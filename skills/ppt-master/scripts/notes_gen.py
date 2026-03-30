#!/usr/bin/env python3
"""
Generate PPT Master speaker notes in notes/total.md via an LLM API.

Usage:
    python3 scripts/notes_gen.py <project_path>
    python3 scripts/notes_gen.py <project_path> --backend openai --model gpt-4o-mini
    python3 scripts/notes_gen.py <project_path> --overwrite
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple


try:
    from dotenv import load_dotenv
    _ENV_PATH = Path(__file__).resolve().parents[3] / ".env"
    load_dotenv(_ENV_PATH)
except ImportError:
    pass


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_DIR = Path(__file__).resolve().parent

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from project_utils import get_project_info  # type: ignore  # noqa: E402


DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"

MAX_SOURCE_FILES = 8
MAX_CHARS_PER_FILE = 20000
MAX_TOTAL_CONTEXT_CHARS = 90000

CODE_FENCE_RE = re.compile(r"^```(?:markdown|md)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)
H1_RE = re.compile(r"(?m)^#\s+(.+?)\s*$")


@dataclass
class ProjectContext:
    project_path: Path
    project_name: str
    svg_stems: List[str]
    source_sections: List[Tuple[str, str]]
    design_spec: Optional[str]
    project_info: Dict[str, object]


def clip_text(text: str, limit: int) -> str:
    normalized = text.replace("\r\n", "\n").strip()
    if len(normalized) <= limit:
        return normalized
    return normalized[:limit].rstrip() + "\n\n[Truncated]"


def resolve_text_backend(explicit_backend: Optional[str] = None) -> str:
    backend = (explicit_backend or os.environ.get("TEXT_BACKEND", "")).strip().lower()
    if backend in {"openai", "gemini"}:
        return backend
    if backend:
        raise ValueError(f"Unsupported TEXT_BACKEND: {backend}")

    if os.environ.get("GEMINI_API_KEY"):
        return "gemini"

    if os.environ.get("TEXT_API_KEY") or os.environ.get("OPENAI_API_KEY"):
        return "openai"

    raise ValueError(
        "No text backend configured. Set TEXT_BACKEND/TEXT_API_KEY, or fallback OPENAI_API_KEY/GEMINI_API_KEY."
    )


def get_text_credentials(backend: str, explicit_model: Optional[str] = None) -> Tuple[str, Optional[str], str]:
    api_key = os.environ.get("TEXT_API_KEY")
    base_url = os.environ.get("TEXT_BASE_URL")
    model = explicit_model or os.environ.get("TEXT_MODEL")

    if backend == "openai":
        api_key = api_key or os.environ.get("OPENAI_API_KEY")
        base_url = base_url or os.environ.get("OPENAI_BASE_URL")
        model = model or DEFAULT_OPENAI_MODEL
    elif backend == "gemini":
        api_key = api_key or os.environ.get("GEMINI_API_KEY")
        base_url = base_url or os.environ.get("GEMINI_BASE_URL")
        model = model or DEFAULT_GEMINI_MODEL
    else:
        raise ValueError(f"Unsupported backend: {backend}")

    if not api_key:
        raise ValueError(f"No API key found for backend '{backend}'")

    return api_key, base_url, model


def load_project_context(project_path: Path) -> ProjectContext:
    if not project_path.exists() or not project_path.is_dir():
        raise FileNotFoundError(f"Project directory not found: {project_path}")

    svg_output = project_path / "svg_output"
    svg_files = sorted(svg_output.glob("*.svg"))
    if not svg_files:
        raise ValueError("No SVG files found in svg_output/")

    svg_stems = [path.stem for path in svg_files]

    total_chars = 0
    source_sections: List[Tuple[str, str]] = []
    sources_dir = project_path / "sources"
    if sources_dir.exists():
        for path in sorted(sources_dir.iterdir()):
            if len(source_sections) >= MAX_SOURCE_FILES:
                break
            if not path.is_file() or path.suffix.lower() not in {".md", ".markdown", ".txt"}:
                continue
            raw = path.read_text(encoding="utf-8", errors="replace")
            clipped = clip_text(raw, MAX_CHARS_PER_FILE)
            if total_chars + len(clipped) > MAX_TOTAL_CONTEXT_CHARS:
                remaining = MAX_TOTAL_CONTEXT_CHARS - total_chars
                if remaining <= 0:
                    break
                clipped = clip_text(clipped, remaining)
            source_sections.append((path.name, clipped))
            total_chars += len(clipped)
            if total_chars >= MAX_TOTAL_CONTEXT_CHARS:
                break

    design_spec = None
    for candidate in ("design_spec.md", "设计规范与内容大纲.md", "设计规范.md"):
        path = project_path / candidate
        if path.exists():
            design_spec = clip_text(path.read_text(encoding="utf-8", errors="replace"), 30000)
            break

    return ProjectContext(
        project_path=project_path,
        project_name=project_path.name,
        svg_stems=svg_stems,
        source_sections=source_sections,
        design_spec=design_spec,
        project_info=get_project_info(str(project_path)),
    )


def build_prompt(context: ProjectContext) -> str:
    source_chunks = "\n\n".join(
        f"## Source: {name}\n{content}" for name, content in context.source_sections
    ) or "No normalized source markdown was found."

    design_spec_block = context.design_spec or "No design specification file was found."
    svg_outline = "\n".join(f"- {stem}" for stem in context.svg_stems)
    canvas = context.project_info.get("canvas_info") or {}
    canvas_name = canvas.get("name") or context.project_info.get("format_name") or "Unknown"
    canvas_dimensions = canvas.get("dimensions") or "Unknown"

    return f"""You are the Executor logic-construction phase for PPT Master.

Your task is to generate the complete speaker-notes master file for a presentation project.

Output requirements:
1. Return ONLY markdown content. Do not wrap in code fences.
2. Create exactly {len(context.svg_stems)} sections.
3. Each section must start with a level-1 heading in the exact form: "# <svg_stem>".
4. The heading text must exactly match this ordered SVG stem list:
{svg_outline}
5. Separate sections with a markdown horizontal rule: "---".
6. For each page include:
   - 2 to 5 natural presentation sentences
   - one line beginning with "Key points:"
   - one line beginning with "Duration:"
7. Except for the first section, the main text should begin with a "[Transition]" sentence.
8. Match the language of the source materials when it is obvious.
9. Keep the notes presentation-ready: coherent, specific, and aligned to the slide title/stem.
10. Do not mention these instructions.

Project metadata:
- Project: {context.project_name}
- Canvas: {canvas_name}
- Dimensions: {canvas_dimensions}

Reference design specification:
{design_spec_block}

Reference source materials:
{source_chunks}
"""


def generate_text_openai(prompt: str, api_key: str, base_url: Optional[str], model: str) -> str:
    from openai import OpenAI

    client = OpenAI(api_key=api_key, base_url=base_url)
    response = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": "You generate markdown files for PPT Master and must follow formatting instructions exactly.",
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        temperature=0.4,
    )
    content = response.choices[0].message.content
    if not content:
        raise RuntimeError("Model returned empty content")
    return content


def generate_text_gemini(prompt: str, api_key: str, base_url: Optional[str], model: str) -> str:
    from google import genai
    from google.genai import types

    if base_url:
        client = genai.Client(api_key=api_key, http_options={"base_url": base_url})
    else:
        client = genai.Client(api_key=api_key)

    response = client.models.generate_content(
        model=model,
        contents=[prompt],
        config=types.GenerateContentConfig(
            temperature=0.4,
            response_mime_type="text/plain",
        ),
    )
    text = getattr(response, "text", None)
    if not text:
        raise RuntimeError("Model returned empty content")
    return text


def split_sections(markdown: str) -> List[Tuple[str, str]]:
    text = CODE_FENCE_RE.sub("", markdown).strip()
    matches = list(H1_RE.finditer(text))
    sections: List[Tuple[str, str]] = []
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        title = match.group(1).strip()
        body = text[start:end].strip()
        body = re.sub(r"(?m)^---\s*$", "", body).strip()
        sections.append((title, body))
    return sections


def normalize_generated_notes(raw_markdown: str, svg_stems: Sequence[str]) -> str:
    sections = split_sections(raw_markdown)
    if len(sections) != len(svg_stems):
        raise ValueError(
            f"Generated section count mismatch: expected {len(svg_stems)}, got {len(sections)}"
        )

    blocks: List[str] = []
    for index, stem in enumerate(svg_stems):
        _, body = sections[index]
        cleaned_body = body.strip()
        if not cleaned_body:
            raise ValueError(f"Generated content for '{stem}' is empty")
        blocks.append(f"# {stem}\n\n{cleaned_body}")

    return "\n\n---\n\n".join(blocks).rstrip() + "\n"


def write_total_md(project_path: Path, markdown: str, overwrite: bool) -> Path:
    notes_dir = project_path / "notes"
    notes_dir.mkdir(parents=True, exist_ok=True)
    target = notes_dir / "total.md"
    if target.exists() and not overwrite:
        raise FileExistsError(f"{target} already exists. Use --overwrite to replace it.")
    target.write_text(markdown, encoding="utf-8")
    return target


def generate_notes(project_path: Path, backend: Optional[str], model: Optional[str], overwrite: bool) -> Path:
    context = load_project_context(project_path)
    resolved_backend = resolve_text_backend(backend)
    api_key, base_url, resolved_model = get_text_credentials(resolved_backend, model)
    prompt = build_prompt(context)

    print("PPT Master - Notes Generator")
    print("=" * 50)
    print(f"Project:  {project_path}")
    print(f"Backend:  {resolved_backend}")
    print(f"Model:    {resolved_model}")
    print(f"Slides:   {len(context.svg_stems)}")
    print(f"Sources:  {len(context.source_sections)}")
    print()

    if resolved_backend == "openai":
        raw_markdown = generate_text_openai(prompt, api_key, base_url, resolved_model)
    else:
        raw_markdown = generate_text_gemini(prompt, api_key, base_url, resolved_model)

    normalized = normalize_generated_notes(raw_markdown, context.svg_stems)
    target = write_total_md(project_path, normalized, overwrite=overwrite)
    print(f"[OK] Generated notes: {target}")
    return target


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate notes/total.md via LLM API.")
    parser.add_argument("project_path", help="Project directory path")
    parser.add_argument("--backend", choices=["openai", "gemini"], default=None)
    parser.add_argument("--model", default=None, help="Override the model name")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing notes/total.md")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        generate_notes(
            project_path=Path(args.project_path),
            backend=args.backend,
            model=args.model,
            overwrite=args.overwrite,
        )
    except Exception as exc:
        print(f"[ERROR] {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
