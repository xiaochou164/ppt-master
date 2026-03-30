#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
web_fetcher.py - Robust Web Content Fetcher with Multiple Fallback Strategies

This module provides a unified interface for fetching web content with multiple
fallback strategies to handle different types of websites:

1. Static HTTP fetch (fast, works for most traditional sites)
2. JavaScript rendering via Playwright (for SPAs)
3. Readability extraction (article-focused extraction)
4. JSON-LD / structured data extraction

Usage:
    from web_fetcher import fetch_web_content

    result = fetch_web_content(url)
    if result.success:
        print(result.content)
"""

import subprocess
import sys
import os
import re
import json
import time
import tempfile
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from urllib.parse import urlparse, urljoin

# Try importing optional dependencies
try:
    import requests
    from bs4 import BeautifulSoup
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

try:
    from readability import Document
    HAS_READABILITY = True
except ImportError:
    HAS_READABILITY = False


# ═══════════════════════════════════════════════════════════════════════════
# Result Data Class
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class FetchResult:
    """Result of a web content fetch operation."""
    success: bool
    url: str
    content: str = ""
    title: str = ""
    description: str = ""
    error: str = ""
    method: str = ""  # "static", "playwright", "readability", "jsonld"
    metadata: Dict[str, Any] = field(default_factory=dict)


# ═══════════════════════════════════════════════════════════════════════════
# Static HTTP Fetcher
# ═══════════════════════════════════════════════════════════════════════════

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

# Known SPA frameworks and indicators
SPA_INDICATORS = [
    "__NEXT_DATA__",           # Next.js
    "__NUXT__",                # Nuxt.js
    "ng-version",              # Angular
    "data-reactroot",          # React
    "data-v-",                 # Vue.js
    "riot-tag",                # Riot.js
    "svelte",                  # Svelte
    "astro-root",              # Astro
    "data-page",               # Possible SPA router
]

# Content selectors for main content extraction
CONTENT_SELECTORS = [
    {"class_": re.compile(r"rich_media_content", re.I)},     # WeChat
    {"id": "js_content"},                                     # WeChat
    {"class_": re.compile(r"tys-main-zt-show", re.I)},       # Gov sites
    {"class_": re.compile(r"tys-main", re.I)},
    {"class_": "TRS_Editor"},
    {"class_": "TRS_UEDITOR"},
    {"class_": "article-content"},
    {"class_": "news-content"},
    {"class_": "main-content"},
    {"class_": "main_content"},
    {"class_": "content-text"},
    {"class_": "post-content"},
    {"class_": "entry-content"},
    {"class_": "article-body"},
    {"id": "content"},
    {"id": "article"},
    {"name": "article"},
    {"name": "main"},
]


def fetch_static(url: str, timeout: int = 30) -> FetchResult:
    """
    Fetch URL using simple HTTP request.

    Fast but cannot handle JavaScript-rendered content.
    """
    if not HAS_REQUESTS:
        return FetchResult(
            success=False,
            url=url,
            error="requests library not installed. Run: pip install requests beautifulsoup4"
        )

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate",
    }

    try:
        response = requests.get(url, headers=headers, timeout=timeout, verify=False)
        response.encoding = response.apparent_encoding or "utf-8"
        html = response.text

        soup = BeautifulSoup(html, "html.parser")

        # Extract title
        title = ""
        if soup.title:
            title = soup.title.string or ""
        if not title:
            og_title = soup.find("meta", property="og:title")
            if og_title:
                title = og_title.get("content", "")

        # Clean title
        title = re.sub(r"[-_|].*?(政府|门户|网站|委员会).*$", "", title).strip()

        # Extract description
        description = ""
        desc_meta = soup.find("meta", attrs={"name": "description"})
        if desc_meta:
            description = desc_meta.get("content", "")
        if not description:
            og_desc = soup.find("meta", property="og:description")
            if og_desc:
                description = og_desc.get("content", "")

        # Remove unwanted elements
        for tag in soup(["script", "style", "nav", "header", "footer", "aside", "noscript", "iframe"]):
            tag.decompose()

        # Find main content
        content_element = None
        max_score = 0

        for selector in CONTENT_SELECTORS:
            if "name" in selector:
                elements = soup.find_all(selector["name"])
            else:
                elements = soup.find_all(attrs=selector)

            for el in elements:
                text = el.get_text(strip=True)
                if len(text) < 100:
                    continue
                # Score by length and Chinese character count
                chinese_count = len(re.findall(r"[\u4e00-\u9fa5]", text))
                score = len(text) + chinese_count * 2
                if score > max_score:
                    max_score = score
                    content_element = el

        if not content_element:
            content_element = soup.body if soup.body else soup

        # Convert to text
        content = content_element.get_text(separator="\n", strip=True)

        # Clean up
        content = re.sub(r"\n{3,}", "\n\n", content)
        content = content.strip()

        # Check if this looks like a SPA with empty content
        if len(content) < 200:
            # Check for SPA indicators
            html_lower = html.lower()
            for indicator in SPA_INDICATORS:
                if indicator.lower() in html_lower:
                    return FetchResult(
                        success=False,
                        url=url,
                        error=f"Detected SPA (found '{indicator}'), static fetch returned minimal content",
                        title=title,
                        description=description,
                        metadata={"spa_detected": True, "indicator": indicator}
                    )

        return FetchResult(
            success=True,
            url=url,
            content=content,
            title=title,
            description=description,
            method="static"
        )

    except Exception as e:
        return FetchResult(success=False, url=url, error=str(e))


# ═══════════════════════════════════════════════════════════════════════════
# Playwright Fetcher (JavaScript Rendering)
# ═══════════════════════════════════════════════════════════════════════════

def fetch_playwright(url: str, timeout: int = 30) -> FetchResult:
    """
    Fetch URL using Playwright for JavaScript rendering.

    Handles SPAs and dynamically loaded content.
    Requires: pip install playwright && playwright install
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return FetchResult(
            success=False,
            url=url,
            error="playwright not installed. Run: pip install playwright && playwright install chromium"
        )

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(
                user_agent=USER_AGENT,
                viewport={"width": 1920, "height": 1080}
            )

            page.set_default_timeout(timeout * 1000)

            try:
                page.goto(url, wait_until="networkidle")
            except Exception:
                # Try with domcontentloaded if networkidle times out
                page.goto(url, wait_until="domcontentloaded")

            # Wait a bit for any lazy-loaded content
            time.sleep(1)

            # Try to wait for common content selectors
            wait_selectors = [
                "article",
                "main",
                ".content",
                ".article-content",
                ".post-content",
                "#content",
                "#article",
            ]
            for selector in wait_selectors:
                try:
                    page.wait_for_selector(selector, timeout=2000)
                    break
                except Exception:
                    continue

            html = page.content()
            title = page.title()

            browser.close()

        # Parse with BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")

        # Extract description from meta
        description = ""
        desc_meta = soup.find("meta", attrs={"name": "description"})
        if desc_meta:
            description = desc_meta.get("content", "")

        # Remove unwanted elements
        for tag in soup(["script", "style", "nav", "header", "footer", "aside", "noscript", "iframe"]):
            tag.decompose()

        # Find main content
        content_element = None
        max_score = 0

        for selector in CONTENT_SELECTORS:
            if "name" in selector:
                elements = soup.find_all(selector["name"])
            else:
                elements = soup.find_all(attrs=selector)

            for el in elements:
                text = el.get_text(strip=True)
                if len(text) < 50:
                    continue
                chinese_count = len(re.findall(r"[\u4e00-\u9fa5]", text))
                score = len(text) + chinese_count * 2
                if score > max_score:
                    max_score = score
                    content_element = el

        if not content_element:
            content_element = soup.body if soup.body else soup

        content = content_element.get_text(separator="\n", strip=True)
        content = re.sub(r"\n{3,}", "\n\n", content).strip()

        return FetchResult(
            success=True,
            url=url,
            content=content,
            title=title or "",
            description=description,
            method="playwright"
        )

    except Exception as e:
        return FetchResult(success=False, url=url, error=str(e))


# ═══════════════════════════════════════════════════════════════════════════
# Node.js Web-to-MD Fallback
# ═══════════════════════════════════════════════════════════════════════════

def fetch_nodejs(url: str, timeout: int = 60) -> FetchResult:
    """
    Fetch URL using the Node.js web_to_md.cjs script.

    This is a fallback that uses the existing Node.js implementation.
    """
    script_dir = Path(__file__).parent
    node_script = script_dir / "web_to_md.cjs"

    if not node_script.exists():
        return FetchResult(
            success=False,
            url=url,
            error=f"Node.js script not found: {node_script}"
        )

    # Create temp file for output
    with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
        temp_path = f.name

    try:
        result = subprocess.run(
            ["node", str(node_script), url, "-o", temp_path],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(script_dir.parent.parent)  # Work from skills/ppt-master dir
        )

        if result.returncode != 0:
            return FetchResult(
                success=False,
                url=url,
                error=f"Node.js script failed: {result.stderr}"
            )

        # Read the output
        with open(temp_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Extract title from markdown
        title = ""
        title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
        if title_match:
            title = title_match.group(1).strip()

        # Remove the header comment
        content = re.sub(r"^<!--[\s\S]*?-->\s*\n", "", content)
        # Remove title from content
        content = re.sub(r"^#\s+.+$\n*", "", content, count=1, flags=re.MULTILINE)
        content = content.strip()

        return FetchResult(
            success=True,
            url=url,
            content=content,
            title=title,
            method="nodejs"
        )

    except subprocess.TimeoutExpired:
        return FetchResult(success=False, url=url, error="Node.js script timeout")
    except Exception as e:
        return FetchResult(success=False, url=url, error=str(e))
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)


# ═══════════════════════════════════════════════════════════════════════════
# Readability Fallback (Mozilla's readability algorithm)
# ═══════════════════════════════════════════════════════════════════════════

def fetch_readability(url: str, timeout: int = 30) -> FetchResult:
    """
    Fetch URL and extract content using readability algorithm.

    Good for article-style content.
    Requires: pip install readability-lxml
    """
    if not HAS_READABILITY:
        return FetchResult(
            success=False,
            url=url,
            error="readability-lxml not installed. Run: pip install readability-lxml"
        )

    if not HAS_REQUESTS:
        return FetchResult(
            success=False,
            url=url,
            error="requests not installed"
        )

    try:
        headers = {"User-Agent": USER_AGENT}
        response = requests.get(url, headers=headers, timeout=timeout, verify=False)
        response.encoding = response.apparent_encoding or "utf-8"

        doc = Document(response.text)
        title = doc.title()
        content_html = doc.summary()

        # Strip HTML tags
        soup = BeautifulSoup(content_html, "html.parser")
        content = soup.get_text(separator="\n", strip=True)
        content = re.sub(r"\n{3,}", "\n\n", content).strip()

        return FetchResult(
            success=True,
            url=url,
            content=content,
            title=title,
            method="readability"
        )

    except Exception as e:
        return FetchResult(success=False, url=url, error=str(e))


# ═══════════════════════════════════════════════════════════════════════════
# JSON-LD Extraction (Structured Data)
# ═══════════════════════════════════════════════════════════════════════════

def extract_jsonld(url: str, html: str) -> Optional[FetchResult]:
    """
    Extract content from JSON-LD structured data in HTML.

    Useful for pages that have structured article data even if
    the visible content is JavaScript-rendered.
    """
    if not HAS_REQUESTS:
        return None

    soup = BeautifulSoup(html, "html.parser")

    # Find all JSON-LD scripts
    jsonld_scripts = soup.find_all("script", type="application/ld+json")

    if not jsonld_scripts:
        return None

    content_parts = []
    title = ""
    description = ""

    for script in jsonld_scripts:
        try:
            data = json.loads(script.string or "{}")

            # Handle @graph format
            if "@graph" in data:
                items = data["@graph"]
            elif isinstance(data, list):
                items = data
            else:
                items = [data]

            for item in items:
                if not isinstance(item, dict):
                    continue

                item_type = item.get("@type", "")

                # Article types
                if item_type in ["Article", "NewsArticle", "BlogPosting", "TechArticle"]:
                    if not title:
                        title = item.get("headline", "")
                    if not description:
                        description = item.get("description", "")

                    article_body = item.get("articleBody", "")
                    if article_body:
                        content_parts.append(article_body)

                # HowTo
                elif item_type == "HowTo":
                    if not title:
                        title = item.get("name", "")
                    if not description:
                        description = item.get("description", "")

                    steps = item.get("step", [])
                    if isinstance(steps, list):
                        for step in steps:
                            step_name = step.get("name", "")
                            step_text = step.get("text", "")
                            if step_name or step_text:
                                content_parts.append(f"### {step_name}\n{step_text}")

                # FAQ
                elif item_type == "FAQPage":
                    main_entity = item.get("mainEntity", [])
                    if isinstance(main_entity, list):
                        for faq in main_entity:
                            question = faq.get("name", "")
                            answer_data = faq.get("acceptedAnswer", {})
                            answer = answer_data.get("text", "") if isinstance(answer_data, dict) else ""
                            if question:
                                content_parts.append(f"## {question}\n{answer}")

                # WebPage with mainEntity
                elif item_type == "WebPage":
                    if not title:
                        title = item.get("name", "")
                    if not description:
                        description = item.get("description", "")

        except json.JSONDecodeError:
            continue

    if content_parts:
        content = "\n\n".join(content_parts)
        return FetchResult(
            success=True,
            url=url,
            content=content,
            title=title,
            description=description,
            method="jsonld"
        )

    return None


# ═══════════════════════════════════════════════════════════════════════════
# Main Fetcher with Fallback Chain
# ═══════════════════════════════════════════════════════════════════════════

def fetch_web_content(
    url: str,
    timeout: int = 30,
    prefer_playwright: bool = False,
    skip_playwright: bool = False,
    verbose: bool = True
) -> FetchResult:
    """
    Fetch web content with multiple fallback strategies.

    Strategy order:
    1. Static HTTP fetch (fastest)
    2. JSON-LD extraction (if static returns minimal content)
    3. Playwright rendering (if SPA detected or static failed)
    4. Readability extraction (last resort)

    Args:
        url: URL to fetch
        timeout: Timeout in seconds
        prefer_playwright: Start with Playwright instead of static fetch
        skip_playwright: Skip Playwright entirely (useful if not installed)
        verbose: Print progress messages

    Returns:
        FetchResult with success status and content
    """
    if verbose:
        print(f"[WebFetcher] Fetching: {url}")

    # Check if this is a known SPA domain
    parsed = urlparse(url)
    host = parsed.netloc.lower()

    known_spa_domains = [
        "notion.so", "notion.site",
        "linear.app", "figma.com",
        "airtable.com", "coda.io",
        "craft.do", "obsidian.md",
        "docusaurus.io", "vercel.app",
        "netlify.app", "pages.dev",
    ]

    is_known_spa = any(spa_domain in host for spa_domain in known_spa_domains)

    # Strategy 1: Static fetch (unless known SPA)
    if not prefer_playwright and not is_known_spa:
        if verbose:
            print("  [1/4] Trying static HTTP fetch...")
        result = fetch_static(url, timeout)

        if result.success and len(result.content) >= 200:
            if verbose:
                print(f"  ✓ Static fetch succeeded ({len(result.content)} chars)")
            return result

        # Try JSON-LD extraction from the static HTML
        if result.success and len(result.content) < 200:
            if verbose:
                print("  [2/4] Content too short, trying JSON-LD extraction...")

            # Re-fetch HTML for JSON-LD extraction
            try:
                response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout, verify=False)
                jsonld_result = extract_jsonld(url, response.text)
                if jsonld_result and jsonld_result.success and len(jsonld_result.content) >= 100:
                    if verbose:
                        print(f"  ✓ JSON-LD extraction succeeded ({len(jsonld_result.content)} chars)")
                    return jsonld_result
            except Exception:
                pass

        # Check if SPA was detected
        spa_detected = result.metadata.get("spa_detected", False) if result.metadata else False
        if verbose and spa_detected:
            print(f"  ⚠ SPA detected: {result.metadata.get('indicator', 'unknown')}")

    # Strategy 2: Playwright rendering
    if not skip_playwright:
        if verbose:
            print("  [3/4] Trying Playwright (JavaScript rendering)...")
        result = fetch_playwright(url, timeout)

        if result.success and len(result.content) >= 100:
            if verbose:
                print(f"  ✓ Playwright fetch succeeded ({len(result.content)} chars)")
            return result

        if verbose:
            print(f"  ⚠ Playwright failed: {result.error[:100]}")

    # Strategy 3: Readability extraction
    if HAS_READABILITY:
        if verbose:
            print("  [4/4] Trying readability extraction...")
        result = fetch_readability(url, timeout)

        if result.success:
            if verbose:
                print(f"  ✓ Readability extraction succeeded ({len(result.content)} chars)")
            return result

    # Strategy 4: Node.js fallback (as last resort)
    if verbose:
        print("  [Fallback] Trying Node.js web_to_md.cjs...")
    result = fetch_nodejs(url, timeout=60)

    if result.success and len(result.content) >= 50:
        if verbose:
            print(f"  ✓ Node.js fetch succeeded ({len(result.content)} chars)")
        return result

    # All strategies failed
    return FetchResult(
        success=False,
        url=url,
        error="All fetch strategies failed. The page may require authentication, "
              "be behind a paywall, or have strong anti-bot protection."
    )


def fetch_to_markdown(url: str, output_path: Optional[str] = None, verbose: bool = True) -> Optional[str]:
    """
    Fetch web content and return/save as Markdown.

    Args:
        url: URL to fetch
        output_path: Optional path to save the markdown file
        verbose: Print progress messages

    Returns:
        Markdown content if successful, None otherwise
    """
    result = fetch_web_content(url, verbose=verbose)

    if not result.success:
        if verbose:
            print(f"[WebFetcher] Failed: {result.error}")
        return None

    # Build markdown
    lines = []
    lines.append("<!--")
    lines.append(f"  Source: {url}")
    lines.append(f"  Fetched: {time.strftime('%Y-%m-%dT%H:%M:%S')}")
    lines.append(f"  Method: {result.method}")
    if result.description:
        lines.append(f"  Description: {result.description}")
    lines.append("-->")
    lines.append("")

    if result.title:
        lines.append(f"# {result.title}")
        lines.append("")

    if result.description:
        lines.append(f"> {result.description}")
        lines.append("")

    lines.append(result.content)

    markdown = "\n".join(lines)

    if output_path:
        Path(output_path).write_text(markdown, encoding="utf-8")
        if verbose:
            print(f"[WebFetcher] Saved to: {output_path}")

    return markdown


# ═══════════════════════════════════════════════════════════════════════════
# CLI Entry Point
# ═══════════════════════════════════════════════════════════════════════════

def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Robust web content fetcher with multiple fallback strategies"
    )
    parser.add_argument("url", help="URL to fetch")
    parser.add_argument("-o", "--output", help="Output markdown file path")
    parser.add_argument("-q", "--quiet", action="store_true", help="Suppress progress messages")
    parser.add_argument("--prefer-playwright", action="store_true", help="Use Playwright first (for known SPAs)")
    parser.add_argument("--skip-playwright", action="store_true", help="Skip Playwright (if not installed)")

    args = parser.parse_args()

    result = fetch_to_markdown(
        args.url,
        output_path=args.output,
        verbose=not args.quiet
    )

    if result:
        if not args.output:
            print(result)
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
