#!/usr/bin/env python3
"""
OpenAI Compatible Image Generation Backend

Generates images via OpenAI-compatible APIs (OpenAI, SiliconFlow, local models, etc.).
Used by image_gen.py as a backend module.

Environment variables:
  IMAGE_API_KEY    (required) API key
  IMAGE_BASE_URL   (optional) Custom API endpoint (e.g. http://127.0.0.1:3000/v1)
  IMAGE_MODEL      (optional) Model name (default: depends on provider)

Dependencies:
  pip install openai Pillow
"""

import base64
import io
import os
import sys
import time
import threading
import urllib.request

from openai import OpenAI

# Optional dependency: PIL (used to report image resolution)
try:
    from PIL import Image as PILImage
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


# ╔══════════════════════════════════════════════════════════════════╗
# ║  Constants                                                      ║
# ╚══════════════════════════════════════════════════════════════════╝

# Aspect ratio -> size mapping for OpenAI DALL-E
# Covers common PPT/social media ratios
ASPECT_RATIO_TO_SIZE = {
    "1:1":  "1024x1024",
    "16:9": "1792x1024",
    "9:16": "1024x1792",
    "3:2":  "1536x1024",
    "2:3":  "1024x1536",
    "4:3":  "1536x1024",   # closest available
    "3:4":  "1024x1536",   # closest available
    "4:5":  "1024x1024",   # fallback to square
    "5:4":  "1024x1024",   # fallback to square
    "21:9": "1792x1024",   # closest wide format
}

# Aspect ratio -> width/height for non-DALL-E APIs
ASPECT_RATIO_TO_DIMENSIONS = {
    "1:1":  (1024, 1024),
    "16:9": (1920, 1080),
    "9:16": (1080, 1920),
    "3:2":  (1536, 1024),
    "2:3":  (1024, 1536),
    "4:3":  (1024, 768),
    "3:4":  (768, 1024),
    "4:5":  (1024, 1280),
    "5:4":  (1280, 1024),
    "21:9": (2240, 960),
    "1:4":  (512, 2048),
    "1:8":  (256, 2048),
    "8:1":  (2048, 256),
}

VALID_ASPECT_RATIOS = list(ASPECT_RATIO_TO_SIZE.keys())

# image_size -> quality mapping for OpenAI DALL-E
IMAGE_SIZE_TO_QUALITY = {
    "512px": "low",
    "1K":    "auto",
    "2K":    "high",
    "4K":    "high",
}

DEFAULT_MODEL = "gpt-image-1"

MAX_RETRIES = 3
RETRY_BASE_DELAY = 10
RETRY_BACKOFF = 2


# ╔══════════════════════════════════════════════════════════════════╗
# ║  Provider Configuration                                          ║
# ╚══════════════════════════════════════════════════════════════════╝

# Parameter format types:
#   - "dalle":     OpenAI DALL-E style, uses `size` and `quality` params
#   - "image_size": Uses `image_size` string param (e.g., "1024x1024")
#   - "width_height": Uses `width` and `height` integer params
PARAM_FORMAT_DALLE = "dalle"
PARAM_FORMAT_IMAGE_SIZE = "image_size"
PARAM_FORMAT_WIDTH_HEIGHT = "width_height"

# Provider configuration registry
# Each provider has:
#   - name: Display name
#   - url_patterns: List of URL patterns to detect this provider
#   - model_prefixes: List of model name prefixes
#   - param_format: Parameter format type
#   - default_base_url: Default API endpoint (if any)
#   - default_model: Default model name
#   - unsupported_models: Models that don't support text-to-image
#   - extra_params: Additional parameters to pass to API
PROVIDERS = {
    "openai": {
        "name": "OpenAI",
        "url_patterns": ["openai.com"],
        "model_prefixes": ["dall-e", "gpt-image"],
        "param_format": PARAM_FORMAT_DALLE,
        "default_base_url": None,
        "default_model": "gpt-image-1",
        "unsupported_models": set(),
        "extra_params": {},
    },
    "siliconflow": {
        "name": "SiliconFlow",
        "url_patterns": ["siliconflow.cn", "siliconflow"],
        "model_prefixes": [
            "black-forest-labs/",
            "Kwai-Kolors/",
            "stabilityai/",
        ],
        "param_format": PARAM_FORMAT_IMAGE_SIZE,
        "default_base_url": "https://api.siliconflow.cn/v1",
        "default_model": "Kwai-Kolors/Kolors",
        "unsupported_models": {
            "Qwen/Qwen-Image-Edit-2509",  # Image editing model
        },
        "extra_params": {},
    },
    "replicate": {
        "name": "Replicate",
        "url_patterns": ["replicate.com", "replicate"],
        "model_prefixes": [],
        "param_format": PARAM_FORMAT_WIDTH_HEIGHT,
        "default_base_url": "https://api.replicate.com/v1",
        "default_model": None,
        "unsupported_models": set(),
        "extra_params": {},
    },
    "generic": {
        "name": "Generic OpenAI-Compatible",
        "url_patterns": [],
        "model_prefixes": [],
        "param_format": PARAM_FORMAT_WIDTH_HEIGHT,
        "default_base_url": None,
        "default_model": None,
        "unsupported_models": set(),
        "extra_params": {},
    },
}


def _detect_provider(model: str, base_url: str = None) -> dict:
    """
    Detect which provider to use based on model name and base URL.

    Returns the provider configuration dict.
    """
    # Check by URL pattern first
    if base_url:
        base_url_lower = base_url.lower()
        for provider_id, config in PROVIDERS.items():
            for pattern in config["url_patterns"]:
                if pattern.lower() in base_url_lower:
                    return config

    # Check by model prefix
    model_lower = model.lower()
    for provider_id, config in PROVIDERS.items():
        for prefix in config["model_prefixes"]:
            if model_lower.startswith(prefix.lower()):
                return config

    # Check if it's OpenAI native (no base_url or openai.com)
    if base_url is None or "openai.com" in (base_url or "").lower():
        # Check for DALL-E models specifically
        if "dall" in model_lower:
            return PROVIDERS["openai"]

    # Fallback to generic provider
    return PROVIDERS["generic"]


def _build_generate_params(
    provider: dict,
    client: OpenAI,
    prompt: str,
    model: str,
    aspect_ratio: str,
    image_size: str
) -> dict:
    """
    Build the parameters dict for client.images.generate() based on provider config.

    Returns a dict of parameters ready to pass to the API.
    """
    params = {
        "prompt": prompt,
        "model": model,
        "n": 1,
        "response_format": "b64_json",
    }

    param_format = provider["param_format"]
    width, height = ASPECT_RATIO_TO_DIMENSIONS.get(aspect_ratio, (1024, 1024))

    if param_format == PARAM_FORMAT_DALLE:
        # OpenAI DALL-E style: uses size and quality
        size = ASPECT_RATIO_TO_SIZE.get(aspect_ratio, "1024x1024")
        quality = IMAGE_SIZE_TO_QUALITY.get(image_size, "auto")
        params["size"] = size
        params["quality"] = quality

    elif param_format == PARAM_FORMAT_IMAGE_SIZE:
        # SiliconFlow style: uses size string (same format as DALL-E but without response_format)
        size = f"{width}x{height}"
        params["size"] = size
        # Remove response_format for SiliconFlow (it returns URL instead)
        params.pop("response_format", None)

    elif param_format == PARAM_FORMAT_WIDTH_HEIGHT:
        # Generic style: uses width and height integers
        params["width"] = width
        params["height"] = height

    # Add any extra params defined by provider
    params.update(provider.get("extra_params", {}))

    return params


# ╔══════════════════════════════════════════════════════════════════╗
# ║  Utilities                                                      ║
# ╚══════════════════════════════════════════════════════════════════╝

def _resolve_output_path(prompt: str, output_dir: str = None,
                         filename: str = None, ext: str = ".png") -> str:
    """Compute the final output file path based on parameters"""
    if filename:
        file_name = os.path.splitext(filename)[0]
    else:
        safe = "".join(c for c in prompt if c.isalnum() or c in (' ', '_')).rstrip()
        safe = safe.replace(" ", "_").lower()[:30]
        file_name = safe or "generated_image"

    full_name = f"{file_name}{ext}"
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
        return os.path.join(output_dir, full_name)
    return full_name


def _report_resolution(path: str):
    """Try to report image resolution using PIL"""
    if HAS_PIL:
        try:
            img = PILImage.open(path)
            print(f"  Resolution:   {img.size[0]}x{img.size[1]}")
        except Exception:
            pass


def _is_rate_limit_error(e: Exception) -> bool:
    """Check whether the exception is a rate limit (429) error"""
    err_str = str(e).lower()
    return "429" in err_str or "rate" in err_str or "quota" in err_str


def _normalize_image_size(image_size: str) -> str:
    """Normalize image size input to standard format."""
    s = image_size.strip()
    upper = s.upper()
    if upper in ("1K", "2K", "4K"):
        return upper
    if upper in ("512PX", "512"):
        return "512px"
    return s


# ╔══════════════════════════════════════════════════════════════════╗
# ║  Image Generation                                               ║
# ╚══════════════════════════════════════════════════════════════════╝

def _generate_image(api_key: str, prompt: str, negative_prompt: str = None,
                    aspect_ratio: str = "1:1", image_size: str = "1K",
                    output_dir: str = None, filename: str = None,
                    model: str = DEFAULT_MODEL, base_url: str = None) -> str:
    """
    Image generation via OpenAI-compatible API.

    Automatically detects provider and uses appropriate parameter format.

    Returns:
        Path of the saved image file

    Raises:
        RuntimeError: When generation fails
        ValueError: When model doesn't support text-to-image
    """
    client = OpenAI(api_key=api_key, base_url=base_url)

    # Detect provider
    provider = _detect_provider(model, base_url)

    # Check if model is supported
    if model in provider.get("unsupported_models", set()):
        raise ValueError(
            f"Model '{model}' is not supported for text-to-image generation. "
            f"Please use a different model."
        )

    # Build final prompt
    final_prompt = prompt
    if negative_prompt:
        final_prompt += f"\n\nAvoid the following: {negative_prompt}"

    # Print info
    print(f"[{provider['name']}]")
    print(f"  Model:        {model}")
    print(f"  Prompt:       {final_prompt[:120]}{'...' if len(final_prompt) > 120 else ''}")

    param_format = provider["param_format"]
    width, height = ASPECT_RATIO_TO_DIMENSIONS.get(aspect_ratio, (1024, 1024))

    if param_format == PARAM_FORMAT_DALLE:
        size = ASPECT_RATIO_TO_SIZE.get(aspect_ratio, "1024x1024")
        quality = IMAGE_SIZE_TO_QUALITY.get(image_size, "auto")
        print(f"  Size:         {size} (from aspect_ratio={aspect_ratio})")
        print(f"  Quality:      {quality}")
    elif param_format == PARAM_FORMAT_IMAGE_SIZE:
        print(f"  Image Size:   {width}x{height} (from aspect_ratio={aspect_ratio})")
    else:
        print(f"  Dimensions:   {width}x{height} (from aspect_ratio={aspect_ratio})")

    print()

    start_time = time.time()
    print(f"  ⏳ Generating...", end="", flush=True)

    # Heartbeat thread
    heartbeat_stop = threading.Event()

    def _heartbeat():
        while not heartbeat_stop.is_set():
            heartbeat_stop.wait(5)
            if not heartbeat_stop.is_set():
                elapsed = time.time() - start_time
                print(f" {elapsed:.0f}s...", end="", flush=True)

    hb_thread = threading.Thread(target=_heartbeat, daemon=True)
    hb_thread.start()

    try:
        # Build parameters based on provider
        params = _build_generate_params(provider, client, final_prompt, model, aspect_ratio, image_size)

        # Try to call API with provider-specific params
        try:
            resp = client.images.generate(**params)
        except TypeError:
            # Fallback: some APIs may not support certain params
            # Try with minimal params
            fallback_params = {
                "prompt": final_prompt,
                "model": model,
                "n": 1,
                "response_format": "b64_json",
            }
            # Try size param as fallback
            size = f"{width}x{height}"
            try:
                resp = client.images.generate(**fallback_params, size=size)
            except TypeError:
                # Last resort: no size params at all
                resp = client.images.generate(**fallback_params)
    finally:
        heartbeat_stop.set()
        hb_thread.join(timeout=1)

    elapsed = time.time() - start_time
    print(f"\n  ✅ Image generated ({elapsed:.1f}s)")

    if resp is not None and resp.data:
        path = _resolve_output_path(prompt, output_dir, filename, ".png")

        # Handle both b64_json and URL responses
        image_data = resp.data[0].b64_json
        if image_data:
            # Base64 encoded image
            image_bytes = base64.b64decode(image_data)
        elif resp.data[0].url:
            # URL to image (e.g., SiliconFlow returns URL instead of b64_json)
            print(f"  Downloading from URL...")
            image_url = resp.data[0].url
            with urllib.request.urlopen(image_url, timeout=60) as response:
                image_bytes = response.read()
        else:
            raise RuntimeError("No image data received (neither b64_json nor url)")

        if HAS_PIL:
            image = PILImage.open(io.BytesIO(image_bytes))
            image.save(path)
        else:
            with open(path, "wb") as f:
                f.write(image_bytes)

        print(f"  File saved to: {path}")
        _report_resolution(path)
        return path

    raise RuntimeError("No image was generated. The server may have refused the request.")


# ╔══════════════════════════════════════════════════════════════════╗
# ║  Public Entry Point                                             ║
# ╚══════════════════════════════════════════════════════════════════╝

def generate(prompt: str, negative_prompt: str = None,
             aspect_ratio: str = "1:1", image_size: str = "1K",
             output_dir: str = None, filename: str = None,
             model: str = None, max_retries: int = MAX_RETRIES) -> str:
    """
    OpenAI-compatible image generation with automatic retry.

    Automatically detects provider based on base_url or model name and uses
    the appropriate API parameter format.

    Reads credentials from environment variables:
      IMAGE_API_KEY  / OPENAI_API_KEY   (fallback)
      IMAGE_BASE_URL / OPENAI_BASE_URL  (fallback)
      IMAGE_MODEL    (optional override)

    Args:
        prompt: Positive prompt text
        negative_prompt: Negative prompt text (appended to prompt as "Avoid...")
        aspect_ratio: Aspect ratio, mapped to size dimensions
        image_size: Image size (for DALL-E: mapped to quality)
        output_dir: Output directory
        filename: Output filename (without extension)
        model: Model name (default: provider-specific)
        max_retries: Maximum number of retries

    Returns:
        Path of the saved image file
    """
    api_key = os.environ.get("IMAGE_API_KEY") or os.environ.get("OPENAI_API_KEY")
    base_url = os.environ.get("IMAGE_BASE_URL") or os.environ.get("OPENAI_BASE_URL")

    if not api_key:
        raise ValueError(
            "No API key found. Set IMAGE_API_KEY or OPENAI_API_KEY environment variable."
        )

    if model is None:
        model = os.environ.get("IMAGE_MODEL")

    # Detect provider to get default model if needed
    detected_provider = _detect_provider(model or "", base_url)
    if model is None:
        model = detected_provider.get("default_model") or DEFAULT_MODEL

    image_size = _normalize_image_size(image_size)

    if aspect_ratio not in ASPECT_RATIO_TO_SIZE:
        supported = list(ASPECT_RATIO_TO_SIZE.keys())
        raise ValueError(
            f"Unsupported aspect ratio '{aspect_ratio}'. "
            f"Supported: {supported}"
        )

    last_error = None
    for attempt in range(max_retries + 1):
        try:
            return _generate_image(api_key, prompt, negative_prompt,
                                   aspect_ratio, image_size, output_dir,
                                   filename, model, base_url)
        except Exception as e:
            last_error = e
            if attempt < max_retries and _is_rate_limit_error(e):
                delay = RETRY_BASE_DELAY * (RETRY_BACKOFF ** attempt)
                print(f"\n  ⚠️  Rate limit hit (attempt {attempt + 1}/{max_retries + 1}). "
                      f"Waiting {delay}s before retry...")
                time.sleep(delay)
            elif attempt < max_retries:
                delay = 5
                print(f"\n  ⚠️  Error (attempt {attempt + 1}/{max_retries + 1}): {e}. "
                      f"Retrying in {delay}s...")
                time.sleep(delay)
            else:
                break

    raise RuntimeError(f"Failed after {max_retries + 1} attempts. Last error: {last_error}")
