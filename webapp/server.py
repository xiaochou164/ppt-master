#!/usr/bin/env python3
"""Local web console for PPT Master.

Provides a small HTTP server to manage projects, import sources, validate
project structure, run post-processing steps one by one, and preview outputs.
"""

from __future__ import annotations

import json
import mimetypes
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import unquote, urlparse


REPO_ROOT = Path(__file__).resolve().parent.parent
WEBAPP_DIR = Path(__file__).resolve().parent
STATIC_DIR = WEBAPP_DIR / "static"
SCRIPTS_DIR = REPO_ROOT / "skills" / "ppt-master" / "scripts"
PROJECTS_DIR = Path(os.environ.get("PPT_MASTER_PROJECTS_DIR", str(REPO_ROOT / "projects"))).resolve()
EXAMPLES_DIR = REPO_ROOT / "examples"
ENV_FILE = REPO_ROOT / ".env"
MODEL_PROFILES_FILE = REPO_ROOT / ".ppt_master_text_models.json"

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from config import CANVAS_FORMATS  # type: ignore  # noqa: E402
from project_manager import ProjectManager  # type: ignore  # noqa: E402
from project_utils import get_project_info  # type: ignore  # noqa: E402


POST_PROCESSING_STEPS = {
    "split-notes": {
        "label": "Split Notes",
        "script": "total_md_split.py",
        "args": [],
    },
    "finalize-svg": {
        "label": "Finalize SVG",
        "script": "finalize_svg.py",
        "args": [],
    },
    "export-pptx": {
        "label": "Export PPTX",
        "script": "svg_to_pptx.py",
        "args": ["-s", "final"],
    },
}

TEXT_BACKENDS = {"openai", "gemini"}
TEXT_ENV_KEYS = ("TEXT_BACKEND", "TEXT_API_KEY", "TEXT_BASE_URL", "TEXT_MODEL")
DESIGN_SPEC_CANDIDATES = (
    "design_spec.md",
    "设计规范与内容大纲.md",
    "design_specification.md",
    "设计规范.md",
)
TEMPLATES_DIR = REPO_ROOT / "skills" / "ppt-master" / "templates" / "layouts"

# SVG Generation constants
SVG_GENERATION_MAX_CHARS = 120000
SVG_PAGE_CONTEXT_LIMIT = 30000

# Image generation constants
IMAGE_BACKENDS = {"openai", "gemini", "siliconflow"}
IMAGE_ENV_KEYS = ("IMAGE_BACKEND", "IMAGE_API_KEY", "IMAGE_BASE_URL", "IMAGE_MODEL")
IMAGE_MODEL_PROFILES_FILE = REPO_ROOT / ".ppt_master_image_models.json"
IMAGE_ASPECT_RATIOS = ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"]
IMAGE_SIZES = ["512px", "1K", "2K", "4K"]

# Preset base URLs for backends
IMAGE_BACKEND_PRESETS = {
    "openai": {"base_url": "", "default_model": "dall-e-3"},
    "gemini": {"base_url": "", "default_model": "gemini-2.0-flash-exp"},
    "siliconflow": {"base_url": "https://api.siliconflow.cn/v1", "default_model": "black-forest-labs/FLUX.1-schnell"},
}

SILICONFLOW_MODELS = [
    "black-forest-labs/FLUX.1-schnell",
    "black-forest-labs/FLUX.1-dev",
    "Kwai-Kolors/Kolors",
    "stabilityai/stable-diffusion-3-medium",
    "stabilityai/stable-diffusion-xl-base-1.0",
    "Qwen/Qwen-Image-Edit-2509",
]

# Industry color schemes for Strategist recommendations
INDUSTRY_COLORS = {
    "finance": {"primary": "#003366", "secondary": "#1565C0", "accent": "#C41E3A", "name": "Finance/Business"},
    "technology": {"primary": "#1565C0", "secondary": "#2196F3", "accent": "#FF6F00", "name": "Technology"},
    "healthcare": {"primary": "#00796B", "secondary": "#009688", "accent": "#FF5722", "name": "Healthcare"},
    "government": {"primary": "#C41E3A", "secondary": "#D32F2F", "accent": "#1976D2", "name": "Government"},
    "education": {"primary": "#1976D2", "secondary": "#42A5F5", "accent": "#FFA000", "name": "Education"},
    "consulting": {"primary": "#003366", "secondary": "#1565C0", "accent": "#FF8F00", "name": "Consulting"},
    "creative": {"primary": "#7B1FA2", "secondary": "#9C27B0", "accent": "#FF4081", "name": "Creative"},
    "default": {"primary": "#1565C0", "secondary": "#42A5F5", "accent": "#FF6F00", "name": "General"},
}

# Style objectives for Strategist recommendations
STYLE_OBJECTIVES = {
    "general": {
        "id": "general",
        "name": "通用灵活",
        "name_en": "General Flexible",
        "focus": "视觉冲击优先",
        "audience": "公众/客户/学员",
        "description": "适用于大多数场景，强调视觉吸引力和灵活性",
    },
    "consultant": {
        "id": "consultant",
        "name": "一般咨询",
        "name_en": "General Consulting",
        "focus": "数据清晰优先",
        "audience": "团队/管理层",
        "description": "适用于数据分析和进度报告",
    },
    "consultant-top": {
        "id": "consultant-top",
        "name": "顶级咨询",
        "name_en": "Top Consulting (MBB)",
        "focus": "逻辑说服优先",
        "audience": "高管/董事会/投资者",
        "description": "适用于战略决策和高管汇报",
    },
}


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: Dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def text_response(handler: BaseHTTPRequestHandler, status: int, content: str, content_type: str) -> None:
    body = content.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", f"{content_type}; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def normalize_project_name(name: str) -> str:
    return name.strip().strip("/").strip()


def load_env_file(path: Path) -> Dict[str, str]:
    values: Dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = raw_line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def save_env_updates(path: Path, updates: Dict[str, Optional[str]]) -> None:
    existing_lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    rendered: List[str] = []
    seen = set()

    for line in existing_lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            rendered.append(line)
            continue

        key, _ = line.split("=", 1)
        env_key = key.strip()
        if env_key not in updates:
            rendered.append(line)
            continue

        seen.add(env_key)
        value = updates[env_key]
        if value is None:
            continue
        rendered.append(f"{env_key}={value}")

    for env_key, value in updates.items():
        if env_key in seen or value is None:
            continue
        rendered.append(f"{env_key}={value}")

    path.write_text("\n".join(rendered).rstrip() + "\n", encoding="utf-8")


def apply_env_values(values: Dict[str, Optional[str]]) -> None:
    for key, value in values.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value


def mask_api_key(api_key: str) -> str:
    if not api_key:
        return ""
    return f"{api_key[:4]}...{api_key[-4:]}" if len(api_key) > 8 else "configured"


def get_legacy_text_model_config() -> Dict[str, Any]:
    env_values = load_env_file(ENV_FILE)
    merged = dict(env_values)
    for key in TEXT_ENV_KEYS + ("OPENAI_API_KEY", "OPENAI_BASE_URL", "GEMINI_API_KEY", "GEMINI_BASE_URL"):
        if os.environ.get(key):
            merged[key] = os.environ[key]

    backend = (merged.get("TEXT_BACKEND") or "").strip().lower()
    if backend not in TEXT_BACKENDS:
        if merged.get("GEMINI_API_KEY"):
            backend = "gemini"
        elif merged.get("TEXT_API_KEY") or merged.get("OPENAI_API_KEY"):
            backend = "openai"
        else:
            backend = ""

    api_key = merged.get("TEXT_API_KEY")
    base_url = merged.get("TEXT_BASE_URL")
    model = merged.get("TEXT_MODEL")

    if backend == "openai":
        api_key = api_key or merged.get("OPENAI_API_KEY")
        base_url = base_url or merged.get("OPENAI_BASE_URL")
        model = model or "gpt-4o-mini"
    elif backend == "gemini":
        api_key = api_key or merged.get("GEMINI_API_KEY")
        base_url = base_url or merged.get("GEMINI_BASE_URL")
        model = model or "gemini-2.5-flash"

    return {
        "id": "legacy-default",
        "name": "Legacy Default",
        "backend": backend,
        "base_url": base_url or "",
        "model": model or "",
        "api_key": api_key or "",
        "api_key_masked": mask_api_key(api_key or ""),
        "configured": bool(backend and api_key),
        "source": "env",
    }


def validate_text_backend(value: str) -> str:
    backend = value.strip().lower()
    if backend not in TEXT_BACKENDS:
        raise ValueError("TEXT_BACKEND must be openai or gemini")
    return backend


def load_model_profiles_file() -> Dict[str, Any]:
    if not MODEL_PROFILES_FILE.exists():
        return {"profiles": [], "selected_profile_id": None}

    try:
        data = json.loads(MODEL_PROFILES_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid model profiles file: {exc}") from exc

    profiles = data.get("profiles", [])
    if not isinstance(profiles, list):
        raise ValueError("Model profiles file is invalid: 'profiles' must be a list")

    return {
        "profiles": profiles,
        "selected_profile_id": data.get("selected_profile_id"),
    }


def save_model_profiles_file(data: Dict[str, Any]) -> None:
    MODEL_PROFILES_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def normalize_profile(profile: Dict[str, Any], existing: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    backend = validate_text_backend(str(profile.get("backend", existing.get("backend") if existing else "")))
    name = str(profile.get("name", existing.get("name") if existing else "")).strip()
    if not name:
        raise ValueError("Profile name is required")

    api_key = str(profile.get("api_key", "")).strip()
    if not api_key and existing is not None:
        api_key = str(existing.get("api_key", "")).strip()

    model = str(profile.get("model", existing.get("model") if existing else "")).strip()
    base_url = str(profile.get("base_url", existing.get("base_url") if existing else "")).strip()
    profile_id = str(profile.get("id", existing.get("id") if existing else "")).strip() or uuid.uuid4().hex

    return {
        "id": profile_id,
        "name": name,
        "backend": backend,
        "model": model,
        "base_url": base_url,
        "api_key": api_key,
    }


def build_public_profile(profile: Dict[str, Any]) -> Dict[str, Any]:
    api_key = str(profile.get("api_key", "")).strip()
    return {
        "id": str(profile.get("id", "")),
        "name": str(profile.get("name", "")),
        "backend": str(profile.get("backend", "")),
        "model": str(profile.get("model", "")),
        "base_url": str(profile.get("base_url", "")),
        "api_key_masked": mask_api_key(api_key),
        "configured": bool(profile.get("backend") and api_key),
        "source": str(profile.get("source", "profiles")),
    }


def get_text_model_config() -> Dict[str, Any]:
    stored = load_model_profiles_file()
    profiles = stored.get("profiles", [])
    selected_profile_id = stored.get("selected_profile_id")

    if not profiles:
        legacy = get_legacy_text_model_config()
        if legacy.get("configured"):
            profiles = [legacy]
            selected_profile_id = legacy["id"]

    public_profiles = [build_public_profile(profile) for profile in profiles]
    active_profile = next(
        (profile for profile in public_profiles if profile["id"] == selected_profile_id),
        public_profiles[0] if public_profiles else None,
    )

    return {
        "profiles": public_profiles,
        "selected_profile_id": active_profile["id"] if active_profile else None,
        "active_profile": active_profile,
        "configured": any(profile["configured"] for profile in public_profiles),
    }


def get_private_model_profiles_state() -> Dict[str, Any]:
    stored = load_model_profiles_file()
    profiles = stored.get("profiles", [])
    selected_profile_id = stored.get("selected_profile_id")

    if not profiles:
        legacy = get_legacy_text_model_config()
        if legacy.get("configured"):
            profiles = [{
                "id": legacy["id"],
                "name": legacy["name"],
                "backend": legacy["backend"],
                "model": legacy["model"],
                "base_url": legacy["base_url"],
                "api_key": legacy["api_key"],
                "source": "env",
            }]
            selected_profile_id = legacy["id"]

    return {
        "profiles": profiles,
        "selected_profile_id": selected_profile_id,
    }


def resolve_private_profile(profile_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    state = get_private_model_profiles_state()
    profiles = state.get("profiles", [])
    selected_profile_id = profile_id or state.get("selected_profile_id")

    if selected_profile_id:
        for profile in profiles:
            if str(profile.get("id")) == str(selected_profile_id):
                return profile

    return profiles[0] if profiles else None


def build_text_env_overrides(profile: Dict[str, Any]) -> Dict[str, Optional[str]]:
    backend = str(profile.get("backend", "")).strip().lower()
    api_key = str(profile.get("api_key", "")).strip()
    base_url = str(profile.get("base_url", "")).strip()
    model = str(profile.get("model", "")).strip()

    return {
        "TEXT_BACKEND": backend or None,
        "TEXT_API_KEY": api_key or None,
        "TEXT_BASE_URL": base_url or None,
        "TEXT_MODEL": model or None,
        "OPENAI_API_KEY": None,
        "OPENAI_BASE_URL": None,
        "GEMINI_API_KEY": None,
        "GEMINI_BASE_URL": None,
    }


# ============== Image Model Profile Management ==============

def get_legacy_image_model_config() -> Dict[str, Any]:
    """Get image model config from environment variables (legacy support)."""
    env_values = load_env_file(ENV_FILE)
    merged = dict(env_values)
    for key in IMAGE_ENV_KEYS + ("GEMINI_API_KEY", "GEMINI_BASE_URL", "OPENAI_API_KEY", "OPENAI_BASE_URL"):
        if os.environ.get(key):
            merged[key] = os.environ[key]

    backend = (merged.get("IMAGE_BACKEND") or "").strip().lower()
    if backend not in IMAGE_BACKENDS:
        if merged.get("GEMINI_API_KEY"):
            backend = "gemini"
        elif merged.get("IMAGE_API_KEY") or merged.get("OPENAI_API_KEY"):
            backend = "openai"
        else:
            backend = ""

    api_key = merged.get("IMAGE_API_KEY")
    base_url = merged.get("IMAGE_BASE_URL")
    model = merged.get("IMAGE_MODEL")

    # Legacy Gemini fallback
    if backend == "gemini" and not api_key:
        api_key = merged.get("GEMINI_API_KEY")
        base_url = base_url or merged.get("GEMINI_BASE_URL")
    elif backend == "openai" and not api_key:
        api_key = merged.get("OPENAI_API_KEY")
        base_url = base_url or merged.get("OPENAI_BASE_URL")

    if not model:
        model = "gemini-2.0-flash-exp" if backend == "gemini" else "dall-e-3"

    return {
        "id": "legacy-default-image",
        "name": "Legacy Image Default",
        "backend": backend,
        "base_url": base_url or "",
        "model": model or "",
        "api_key": api_key or "",
        "api_key_masked": mask_api_key(api_key or ""),
        "configured": bool(backend and api_key),
        "source": "env",
    }


def load_image_model_profiles_file() -> Dict[str, Any]:
    """Load image model profiles from JSON file."""
    if not IMAGE_MODEL_PROFILES_FILE.exists():
        return {"profiles": [], "selected_profile_id": None}

    try:
        data = json.loads(IMAGE_MODEL_PROFILES_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid image model profiles file: {exc}") from exc

    profiles = data.get("profiles", [])
    if not isinstance(profiles, list):
        raise ValueError("Image model profiles file is invalid: 'profiles' must be a list")

    return {
        "profiles": profiles,
        "selected_profile_id": data.get("selected_profile_id"),
    }


def save_image_model_profiles_file(data: Dict[str, Any]) -> None:
    """Save image model profiles to JSON file."""
    IMAGE_MODEL_PROFILES_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def get_image_model_config() -> Dict[str, Any]:
    """Get current image model configuration with all profiles."""
    stored = load_image_model_profiles_file()
    profiles = stored.get("profiles", [])
    selected_profile_id = stored.get("selected_profile_id")

    if not profiles:
        legacy = get_legacy_image_model_config()
        if legacy.get("configured"):
            profiles = [legacy]
            selected_profile_id = legacy["id"]

    public_profiles = [build_public_profile(profile) for profile in profiles]
    active_profile = next(
        (profile for profile in public_profiles if profile["id"] == selected_profile_id),
        public_profiles[0] if public_profiles else None,
    )

    return {
        "profiles": public_profiles,
        "selected_profile_id": active_profile["id"] if active_profile else None,
        "active_profile": active_profile,
        "configured": any(profile["configured"] for profile in public_profiles),
        "aspect_ratios": IMAGE_ASPECT_RATIOS,
        "sizes": IMAGE_SIZES,
    }


def get_private_image_model_profiles_state() -> Dict[str, Any]:
    """Get private image model profiles state (with API keys)."""
    stored = load_image_model_profiles_file()
    profiles = stored.get("profiles", [])
    selected_profile_id = stored.get("selected_profile_id")

    if not profiles:
        legacy = get_legacy_image_model_config()
        if legacy.get("configured"):
            profiles = [{
                "id": legacy["id"],
                "name": legacy["name"],
                "backend": legacy["backend"],
                "model": legacy["model"],
                "base_url": legacy["base_url"],
                "api_key": legacy["api_key"],
                "source": "env",
            }]
            selected_profile_id = legacy["id"]

    return {
        "profiles": profiles,
        "selected_profile_id": selected_profile_id,
    }


def resolve_private_image_profile(profile_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Resolve a private image profile by ID."""
    state = get_private_image_model_profiles_state()
    profiles = state.get("profiles", [])
    selected_profile_id = profile_id or state.get("selected_profile_id")

    if selected_profile_id:
        for profile in profiles:
            if str(profile.get("id")) == str(selected_profile_id):
                return profile

    return profiles[0] if profiles else None


def build_image_env_overrides(profile: Dict[str, Any]) -> Dict[str, Optional[str]]:
    """Build environment variable overrides for image generation."""
    backend = str(profile.get("backend", "")).strip().lower()
    api_key = str(profile.get("api_key", "")).strip()
    base_url = str(profile.get("base_url", "")).strip()
    model = str(profile.get("model", "")).strip()

    return {
        "IMAGE_BACKEND": backend or None,
        "IMAGE_API_KEY": api_key or None,
        "IMAGE_BASE_URL": base_url or None,
        "IMAGE_MODEL": model or None,
    }


def generate_image(profile: Dict[str, Any], prompt: str, output_dir: str, filename: Optional[str] = None, aspect_ratio: str = "1:1", image_size: str = "1K") -> Dict[str, Any]:
    """Generate an image using the configured backend."""
    backend = str(profile.get("backend", "gemini")).lower()
    api_key = str(profile.get("api_key", "")).strip()
    base_url = str(profile.get("base_url", "")).strip() or None
    model = str(profile.get("model", "")).strip()

    if not api_key:
        raise ValueError("No API key configured for image generation")

    if backend == "gemini":
        return generate_image_gemini(api_key, base_url, model, prompt, output_dir, filename, aspect_ratio, image_size)
    else:
        return generate_image_openai(api_key, base_url, model, prompt, output_dir, filename, aspect_ratio, image_size)


def generate_image_gemini(api_key: str, base_url: Optional[str], model: str, prompt: str, output_dir: str, filename: Optional[str], aspect_ratio: str, image_size: str) -> Dict[str, Any]:
    """Generate image using Gemini backend."""
    from google import genai
    from google.genai import types
    import base64
    import hashlib

    if not model:
        model = "gemini-2.0-flash-exp"

    # Create output directory if needed
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Build client
    client_kwargs = {"api_key": api_key}
    if base_url:
        client_kwargs["http_options"] = {"base_url": base_url}
    client = genai.Client(**client_kwargs)

    # Generate image
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
            response_modalities_config=types.ResponseModalitiesConfig(
                image_config=types.ImageGenerationConfig(
                    aspect_ratio=aspect_ratio,
                    safety_filter_level="block_few",
                )
            )
        )
    )

    # Find image in response
    image_data = None
    for part in response.candidates[0].content.parts:
        if part.inline_data is not None:
            image_data = part.inline_data.data
            mime_type = part.inline_data.mime_type or "image/png"
            break

    if not image_data:
        raise ValueError("No image generated in response")

    # Generate filename
    if not filename:
        hash_input = f"{prompt}{time.time()}".encode()
        filename = f"image_{hashlib.md5(hash_input).hexdigest()[:8]}"

    # Determine extension
    ext = "png" if "png" in mime_type else "jpg"
    full_filename = f"{filename}.{ext}"
    output_file = output_path / full_filename

    # Write file
    if isinstance(image_data, bytes):
        output_file.write_bytes(image_data)
    else:
        output_file.write_bytes(base64.b64decode(image_data))

    return {
        "filename": full_filename,
        "path": str(output_file),
        "mime_type": mime_type,
        "prompt": prompt,
        "model": model,
        "backend": "gemini",
    }


def generate_image_openai(api_key: str, base_url: Optional[str], model: str, prompt: str, output_dir: str, filename: Optional[str], aspect_ratio: str, image_size: str) -> Dict[str, Any]:
    """Generate image using OpenAI backend."""
    import base64
    import hashlib
    import requests

    if not model:
        model = "dall-e-3"

    # Create output directory if needed
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Map aspect ratio to DALL-E size
    size_map = {
        "1:1": "1024x1024",
        "9:16": "1024x1792",
        "16:9": "1792x1024",
    }
    size = size_map.get(aspect_ratio, "1024x1024")

    # Build API URL
    api_base = (base_url or "https://api.openai.com/v1").rstrip("/")
    url = f"{api_base}/images/generations"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "prompt": prompt,
        "n": 1,
        "size": size,
        "response_format": "b64_json",
    }

    response = requests.post(url, headers=headers, json=payload, timeout=120)
    if not response.ok:
        raise ValueError(f"OpenAI API error: {response.status_code} - {response.text}")

    data = response.json()
    if not data.get("data"):
        raise ValueError("No image data in response")

    image_data = data["data"][0].get("b64_json")
    if not image_data:
        # Fallback to URL
        image_url = data["data"][0].get("url")
        if image_url:
            img_response = requests.get(image_url, timeout=60)
            if img_response.ok:
                image_data = base64.b64encode(img_response.content).decode()
            else:
                raise ValueError("Failed to download image from URL")
        else:
            raise ValueError("No image data or URL in response")

    # Generate filename
    if not filename:
        hash_input = f"{prompt}{time.time()}".encode()
        filename = f"image_{hashlib.md5(hash_input).hexdigest()[:8]}"

    full_filename = f"{filename}.png"
    output_file = output_path / full_filename

    # Write file
    output_file.write_bytes(base64.b64decode(image_data))

    return {
        "filename": full_filename,
        "path": str(output_file),
        "mime_type": "image/png",
        "prompt": prompt,
        "model": model,
        "backend": "openai",
    }


def extract_model_ids(payload: Any) -> List[str]:
    seen = set()
    model_ids: List[str] = []

    def add_candidate(raw: Any) -> None:
        if raw is None:
            return
        value = str(raw).strip()
        if not value:
            return
        if value.startswith("models/"):
            value = value.split("/", 1)[1]
        if value in seen:
            return
        seen.add(value)
        model_ids.append(value)

    if isinstance(payload, dict):
        items = payload.get("data")
        if isinstance(items, list):
            for item in items:
                if isinstance(item, dict):
                    add_candidate(item.get("id") or item.get("name"))
                else:
                    add_candidate(getattr(item, "id", None) or getattr(item, "name", None))
        else:
            add_candidate(payload.get("id") or payload.get("name"))
    elif isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict):
                add_candidate(item.get("id") or item.get("name"))
            else:
                add_candidate(getattr(item, "id", None) or getattr(item, "name", None))
    else:
        add_candidate(getattr(payload, "id", None) or getattr(payload, "name", None))

    return sorted(model_ids)


def fetch_openai_compatible_models(base_url: str, api_key: str) -> List[str]:
    import requests

    candidate_bases: List[str] = []
    normalized = (base_url or "https://api.openai.com/v1").strip().rstrip("/")
    if normalized:
        candidate_bases.append(normalized)
        if not normalized.endswith("/v1"):
            candidate_bases.append(f"{normalized}/v1")

    last_error = "Unable to fetch models"
    for candidate in candidate_bases:
        response = requests.get(
            f"{candidate}/models",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=20,
        )
        if response.ok:
            return extract_model_ids(response.json())
        last_error = response.text.strip() or f"HTTP {response.status_code}"
        if response.status_code != HTTPStatus.NOT_FOUND:
            break

    raise ValueError(f"Failed to fetch model list: {last_error}")


def fetch_gemini_models(base_url: str, api_key: str) -> List[str]:
    from google import genai

    if base_url:
        client = genai.Client(api_key=api_key, http_options={"base_url": base_url})
    else:
        client = genai.Client(api_key=api_key)

    models = client.models.list()
    return extract_model_ids(list(models))


def build_test_profile(profile: Dict[str, Any], existing: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    backend = validate_text_backend(str(profile.get("backend", existing.get("backend") if existing else "")))
    api_key = str(profile.get("api_key", "")).strip()
    if not api_key and existing is not None:
        api_key = str(existing.get("api_key", "")).strip()

    return {
        "id": str(profile.get("id", existing.get("id") if existing else "")).strip(),
        "name": str(profile.get("name", existing.get("name") if existing else "")).strip(),
        "backend": backend,
        "model": str(profile.get("model", existing.get("model") if existing else "")).strip(),
        "base_url": str(profile.get("base_url", existing.get("base_url") if existing else "")).strip(),
        "api_key": api_key,
    }


def test_text_model_profile(profile: Dict[str, Any]) -> Dict[str, Any]:
    from notes_gen import (
        DEFAULT_GEMINI_MODEL,
        DEFAULT_OPENAI_MODEL,
        generate_text_gemini,
        generate_text_openai,
    )

    backend = validate_text_backend(str(profile.get("backend", "")))
    api_key = str(profile.get("api_key", "")).strip()
    if not api_key:
        raise ValueError("API key is required")

    model = str(profile.get("model", "")).strip()
    used_default_model = False
    if not model:
        model = DEFAULT_OPENAI_MODEL if backend == "openai" else DEFAULT_GEMINI_MODEL
        used_default_model = True

    base_url = str(profile.get("base_url", "")).strip() or None
    prompt = (
        "Return a short plain-text confirmation that the PPT Master model test succeeded. "
        "Do not use markdown. Keep it under 12 words."
    )

    started_at = time.perf_counter()
    if backend == "openai":
        output = generate_text_openai(prompt, api_key, base_url, model)
    else:
        output = generate_text_gemini(prompt, api_key, base_url, model)
    elapsed_ms = int((time.perf_counter() - started_at) * 1000)

    preview = output.strip().replace("\r\n", "\n")
    if len(preview) > 400:
        preview = preview[:400].rstrip() + "..."

    return {
        "backend": backend,
        "model": model,
        "used_default_model": used_default_model,
        "duration_ms": elapsed_ms,
        "preview": preview,
    }


def sanitize_uploaded_name(name: str, default_stem: str, suffix: str) -> str:
    raw = (name or "").strip()
    if not raw:
        return f"{default_stem}{suffix}"

    candidate = Path(raw).name.strip().replace("\x00", "")
    if not candidate:
        return f"{default_stem}{suffix}"

    safe = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in candidate)
    safe = safe.strip("._")
    if not safe:
        safe = default_stem

    path = Path(safe)
    if path.suffix.lower() != suffix:
        return f"{path.stem or default_stem}{suffix}"
    return path.name


def project_path_from_name(name: str) -> Path:
    path = (PROJECTS_DIR / normalize_project_name(name)).resolve()
    try:
        path.relative_to(PROJECTS_DIR.resolve())
    except ValueError as exc:
        raise FileNotFoundError("Invalid project path") from exc
    if not path.exists() or not path.is_dir():
        raise FileNotFoundError(f"Project not found: {name}")
    return path


def find_design_spec_file(project_path: Path) -> Optional[Path]:
    for candidate in DESIGN_SPEC_CANDIDATES:
        path = project_path / candidate
        if path.exists() and path.is_file():
            return path
    return None


def build_project_summary(project_path: Path) -> Dict[str, Any]:
    info = get_project_info(str(project_path))
    svg_final_files = sorted((project_path / "svg_final").glob("*.svg"))
    svg_output_files = sorted((project_path / "svg_output").glob("*.svg"))
    pptx_files = sorted(project_path.glob("*.pptx"))
    preview_files = svg_final_files or svg_output_files
    preview_root = "svg_final" if svg_final_files else "svg_output"
    notes_dir = project_path / "notes"
    total_notes_path = project_path / "notes" / "total.md"
    split_note_files = sorted(
        path for path in notes_dir.glob("*.md")
        if path.is_file() and path.name != "total.md"
    ) if notes_dir.exists() else []
    design_spec_path = find_design_spec_file(project_path)
    markdown_sources = sorted(
        p for p in (project_path / "sources").glob("*.md") if p.is_file()
    ) if (project_path / "sources").exists() else []

    return {
        "name": project_path.name,
        "display_name": info.get("name", project_path.name),
        "path": str(project_path),
        "canvas_format": info.get("format", "unknown"),
        "canvas_label": info.get("format_name", "Unknown"),
        "created_at": info.get("date_formatted", "Unknown"),
        "svg_output_count": len(svg_output_files),
        "svg_final_count": len(svg_final_files),
        "split_notes_count": len(split_note_files),
        "source_count": info.get("source_count", 0),
        "has_spec": info.get("has_spec", False),
        "has_total_notes": total_notes_path.exists(),
        "total_notes": {
            "name": total_notes_path.name,
            "url": f"/files/projects/{project_path.name}/notes/{total_notes_path.name}",
        } if total_notes_path.exists() else None,
        "design_spec": {
            "name": design_spec_path.name,
            "url": f"/files/projects/{project_path.name}/{design_spec_path.name}",
        } if design_spec_path else None,
        "pptx_files": [
            {
                "name": file.name,
                "url": f"/files/projects/{project_path.name}/{file.name}",
            }
            for file in pptx_files
        ],
        "preview_slides": [
            {
                "name": file.name,
                "url": f"/files/projects/{project_path.name}/{preview_root}/{file.name}",
            }
            for file in preview_files[:12]
        ],
        "all_slides": [
            {
                "name": file.name,
                "url": f"/files/projects/{project_path.name}/{preview_root}/{file.name}",
            }
            for file in preview_files
        ],
        "source_markdown": [
            {
                "name": file.name,
                "url": f"/files/projects/{project_path.name}/sources/{file.name}",
            }
            for file in markdown_sources
        ],
    }


def get_step_guard(project_path: Path, step_id: str) -> Optional[str]:
    summary = build_project_summary(project_path)

    if step_id == "split-notes":
        if summary["svg_output_count"] == 0:
            return "Split Notes requires SVG files in svg_output/"
        if not summary["has_total_notes"]:
            return "Split Notes requires notes/total.md"
        return None

    if step_id == "finalize-svg":
        if summary["svg_output_count"] == 0:
            return "Finalize SVG requires SVG files in svg_output/"
        if summary["split_notes_count"] == 0:
            return "Finalize SVG must run after Split Notes so notes/*.md already exist"
        return None

    if step_id == "export-pptx":
        if summary["split_notes_count"] == 0:
            return "Export PPTX requires notes/*.md generated by Split Notes"
        if summary["svg_final_count"] == 0:
            return "Export PPTX requires finalized SVG files in svg_final/"
        return None

    return None


def list_projects() -> List[Dict[str, Any]]:
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    project_dirs = [path for path in PROJECTS_DIR.iterdir() if path.is_dir()]
    project_dirs.sort(key=lambda item: item.stat().st_mtime, reverse=True)
    return [build_project_summary(path) for path in project_dirs]


def list_templates() -> Dict[str, Any]:
    """List available templates from templates/layouts directory."""
    index_path = TEMPLATES_DIR / "layouts_index.json"
    if not index_path.exists():
        return {"templates": [], "categories": {}, "error": "Template index not found"}

    try:
        index_data = json.loads(index_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"templates": [], "categories": {}, "error": "Invalid template index"}

    templates = []
    layouts = index_data.get("layouts", {})
    categories = index_data.get("categories", {})

    for template_id, template_info in layouts.items():
        template_path = TEMPLATES_DIR / template_id
        preview_path = template_path / "preview.png"

        # Check if template directory exists
        if not template_path.exists() or not template_path.is_dir():
            continue

        # Count SVG files in template
        svg_files = list(template_path.glob("*.svg"))

        # Build template entry
        template_entry = {
            "id": template_id,
            "label": template_info.get("label", template_id),
            "summary": template_info.get("summary", ""),
            "tone": template_info.get("tone", ""),
            "theme_mode": template_info.get("themeMode", ""),
            "keywords": template_info.get("keywords", []),
            "svg_count": len(svg_files),
            "svg_files": [f.name for f in svg_files],
            "has_design_spec": (template_path / "design_spec.md").exists(),
            "assets": template_info.get("assets", []),
        }

        # Add preview URL if preview.png exists
        if preview_path.exists():
            template_entry["preview_url"] = f"/files/templates/{template_id}/preview.png"

        templates.append(template_entry)

    return {
        "templates": templates,
        "categories": categories,
        "quick_lookup": index_data.get("quickLookup", {}),
        "meta": index_data.get("meta", {}),
    }


def apply_template_to_project(project_path: Path, template_id: str) -> Dict[str, Any]:
    """Copy template files to project directory."""
    template_dir = TEMPLATES_DIR / template_id

    if not template_dir.exists() or not template_dir.is_dir():
        raise ValueError(f"Template not found: {template_id}")

    # Destination directories
    templates_dest = project_path / "templates"
    images_dest = project_path / "images"

    templates_dest.mkdir(parents=True, exist_ok=True)
    images_dest.mkdir(parents=True, exist_ok=True)

    copied_files = {
        "templates": [],
        "images": [],
        "design_spec": None,
    }

    # Copy SVG files to templates/
    for svg_file in template_dir.glob("*.svg"):
        dest_file = templates_dest / svg_file.name
        shutil.copy2(svg_file, dest_file)
        copied_files["templates"].append(svg_file.name)

    # Copy design_spec.md if exists
    design_spec_src = template_dir / "design_spec.md"
    if design_spec_src.exists():
        dest_file = project_path / "design_spec.md"
        shutil.copy2(design_spec_src, dest_file)
        copied_files["design_spec"] = "design_spec.md"

    # Copy image assets (png, jpg, jpeg) to images/
    for ext in ("*.png", "*.jpg", "*.jpeg"):
        for img_file in template_dir.glob(ext):
            dest_file = images_dest / img_file.name
            shutil.copy2(img_file, dest_file)
            copied_files["images"].append(img_file.name)

    return copied_files


def load_project_sources(project_path: Path, max_files: int = 5, max_chars: int = 50000) -> str:
    """Load and concatenate source markdown files for analysis."""
    sources_dir = project_path / "sources"
    if not sources_dir.exists():
        return ""

    content_parts = []
    total_chars = 0

    for path in sorted(sources_dir.iterdir()):
        if not path.is_file() or path.suffix.lower() not in {".md", ".markdown", ".txt"}:
            continue
        if len(content_parts) >= max_files:
            break

        raw = path.read_text(encoding="utf-8", errors="replace")
        clipped = raw[:max_chars - total_chars] if total_chars + len(raw) > max_chars else raw
        if clipped.strip():
            content_parts.append(f"---\n# Source: {path.name}\n\n{clipped}")
            total_chars += len(clipped)
            if total_chars >= max_chars:
                break

    return "\n".join(content_parts)


def analyze_content_for_strategist(project_path: Path, profile: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze source content and generate Strategist recommendations using LLM."""
    from notes_gen import generate_text_openai, generate_text_gemini

    sources_content = load_project_sources(project_path)
    if not sources_content:
        raise ValueError("No source content found in sources/ directory")

    project_info = get_project_info(str(project_path))

    prompt = f"""You are the Strategist for PPT Master. Analyze the following source content and provide eight-item confirmation recommendations.

Output requirements:
1. Return ONLY valid JSON. No markdown code fences.
2. Use this exact structure:
{{
  "canvas_format": {{"suggestion": "ppt169", "reason": "..."}},
  "page_count": {{"min": 8, "max": 12, "reason": "..."}},
  "target_audience": {{"suggestion": "...", "reason": "..."}},
  "style_objective": {{"suggestion": "general|consultant|consultant-top", "reason": "..."}},
  "color_scheme": {{"primary": "#RRGGBB", "secondary": "#RRGGBB", "accent": "#RRGGBB", "reason": "..."}},
  "icon_approach": {{"suggestion": "builtin|emoji|ai-generated", "reason": "..."}},
  "typography": {{"title_font": "...", "body_font": "...", "body_size": 24, "reason": "..."}},
  "image_approach": {{"suggestion": "none|user-provided|ai-generated|placeholder", "reason": "...", "count": 0}}
}}

Content to analyze:
{sources_content[:30000]}
"""

    backend = str(profile.get("backend", "openai")).lower()
    api_key = str(profile.get("api_key", "")).strip()
    base_url = str(profile.get("base_url", "")).strip() or None
    model = str(profile.get("model", "")).strip()

    if not api_key:
        raise ValueError("No API key configured for analysis")

    if not model:
        model = "gpt-4o-mini" if backend == "openai" else "gemini-2.5-flash"

    if backend == "openai":
        raw_response = generate_text_openai(prompt, api_key, base_url, model)
    else:
        raw_response = generate_text_gemini(prompt, api_key, base_url, model)

    # Parse JSON response
    import json
    try:
        # Remove potential code fences
        cleaned = raw_response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
        result = json.loads(cleaned.strip())
    except json.JSONDecodeError as exc:
        raise ValueError(f"Failed to parse LLM response as JSON: {exc}\n\nResponse: {raw_response[:500]}")

    return {
        "canvas_format": result.get("canvas_format", {}),
        "page_count": result.get("page_count", {}),
        "target_audience": result.get("target_audience", {}),
        "style_objective": result.get("style_objective", {}),
        "color_scheme": result.get("color_scheme", {}),
        "icon_approach": result.get("icon_approach", {}),
        "typography": result.get("typography", {}),
        "image_approach": result.get("image_approach", {}),
        "source_files_count": len(list((project_path / "sources").glob("*.md"))) if (project_path / "sources").exists() else 0,
        "model_used": model,
    }


def build_svg_generation_prompt(
    project_path: Path,
    page_number: int,
    total_pages: int,
    page_title: str,
    page_type: str,
    design_spec: str,
    sources_content: str,
    existing_pages: List[str],
) -> str:
    """Build prompt for SVG page generation."""
    from config import CANVAS_FORMATS

    # Get canvas info from design spec or default
    canvas_format = "ppt169"
    viewbox = CANVAS_FORMATS.get(canvas_format, {}).get("viewbox", "0 0 1280 720")

    existing_context = ""
    if existing_pages:
        existing_context = f"\nAlready generated pages: {', '.join(existing_pages)}"

    return f"""You are the Executor for PPT Master. Generate a single SVG page for a presentation.

CRITICAL REQUIREMENTS:
1. Output ONLY the SVG code. No markdown, no explanation, no code fences.
2. Start with <svg> and end with </svg>
3. Use viewBox="{viewbox}"
4. Page {page_number} of {total_pages}: "{page_title}" ({page_type})

DESIGN SPECIFICATION:
{design_spec[:8000]}

SOURCE CONTENT:
{sources_content[:SVG_PAGE_CONTEXT_LIMIT]}

PAGE CONTEXT:
- Current page: {page_number}/{total_pages}
- Title: {page_title}
- Type: {page_type}{existing_context}

SVG TECHNICAL CONSTRAINTS:
- NO clipPath, mask, <style>, class, foreignObject, textPath, @font-face, animate, script
- NO marker-end on paths
- Use inline styles only
- For opacity: use fill-opacity/stroke-opacity instead of rgba()
- For rounded rects: use <rect rx="..."> (will be converted to path later)
- For icons: use <use data-icon="icon-name" x="..." y="..." width="..." height="..." fill="..."/>
- For images: use <image href="../images/xxx.png" ... preserveAspectRatio="xMidYMid slice"/>
- Font families: Microsoft YaHei, SimHei, SimSun, Arial, Georgia, Calibri
- Ensure text elements have proper fill and font-size

Generate the SVG now:"""


def generate_single_svg(
    prompt: str,
    backend: str,
    api_key: str,
    base_url: Optional[str],
    model: str,
) -> str:
    """Generate a single SVG page using LLM."""
    from notes_gen import generate_text_openai, generate_text_gemini

    if backend == "openai":
        raw_response = generate_text_openai(prompt, api_key, base_url, model)
    else:
        raw_response = generate_text_gemini(prompt, api_key, base_url, model)

    # Clean up response
    svg_content = raw_response.strip()

    # Remove markdown code fences if present
    if svg_content.startswith("```"):
        lines = svg_content.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        svg_content = "\n".join(lines).strip()

    # Validate SVG
    if not svg_content.startswith("<svg"):
        raise ValueError("Response is not a valid SVG: must start with <svg>")

    if not svg_content.endswith("</svg>"):
        raise ValueError("Response is not a valid SVG: must end with </svg>")

    return svg_content


def _get_page_title(svg_file: Path) -> str:
    """Extract page title from SVG file by parsing its content."""
    try:
        import re
        content = svg_file.read_text(encoding="utf-8", errors="replace")
        # Try to find title in common patterns
        # Look for <title> tag
        title_match = re.search(r"<title>([^<]+)</title>", content)
        if title_match:
            return title_match.group(1).strip()
        # Look for aria-label
        aria_match = re.search(r"aria-label=[\"']([^\"']+)[\"']", content)
        if aria_match:
            return aria_match.group(1).strip()
        # Look for first text element with significant content
        text_match = re.search(r"<text[^>]*>([^<]{3,50})</text>", content)
        if text_match:
            return text_match.group(1).strip()
    except Exception:
        pass
    return "Untitled"


def parse_design_spec_for_pages(design_spec: str) -> List[Dict[str, Any]]:
    """Parse design spec to extract page outline."""
    import re

    pages = []

    # Try to find page outline in design spec
    # Look for patterns like "## Page 1" or "### Slide 1" or numbered sections
    page_patterns = [
        r"(?m)^#+\s*(\d+)[.:\s]+(.+)$",  # ## 1. Title or ### 1: Title
        r"(?m)^#+\s*Page\s*(\d+)[.:\s]*(.*)$",  # ## Page 1: Title
        r"(?m)^#+\s*Slide\s*(\d+)[.:\s]*(.*)$",  # ## Slide 1: Title
        r"(?m)^\s*(\d+)[.:\s]+(.+)$",  # 1. Title (list item)
    ]

    for pattern in page_patterns:
        matches = re.findall(pattern, design_spec)
        if matches:
            for match in matches:
                page_num = int(match[0])
                page_title = match[1].strip()
                page_type = "content"
                if "cover" in page_title.lower() or page_num == 1:
                    page_type = "cover"
                elif "toc" in page_title.lower() or "目录" in page_title:
                    page_type = "toc"
                elif "chapter" in page_title.lower() or "章节" in page_title:
                    page_type = "chapter"
                elif "ending" in page_title.lower() or "thank" in page_title.lower() or "结束" in page_title or "谢谢" in page_title:
                    page_type = "ending"

                pages.append({
                    "number": page_num,
                    "title": page_title,
                    "type": page_type,
                })
            break

    return pages


def estimate_page_count(design_spec: str, sources_content: str) -> int:
    """Estimate page count from design spec and sources."""
    import re

    # Try to extract from design spec - handle various formats
    # Format 1: "Minimum: 8" or "Min: 8"
    match = re.search(r"\b(?:min|minimum)\s*[:：]?\s*(\d+)", design_spec, re.IGNORECASE)
    if match:
        return int(match.group(1))

    # Format 2: "**Minimum**: 8" (Markdown bold)
    match = re.search(r"\*\*Minimum\*\*\s*[:：]?\s*(\d+)", design_spec, re.IGNORECASE)
    if match:
        return int(match.group(1))

    # Format 3: "Page Count" section with min/max
    match = re.search(r"page\s*count[^\d]*(\d+)[^\d]*(\d+)?", design_spec, re.IGNORECASE)
    if match:
        return int(match.group(1))

    # Estimate from content length
    content_length = len(sources_content)
    if content_length < 5000:
        return 6
    elif content_length < 15000:
        return 10
    elif content_length < 30000:
        return 15
    else:
        return 20


@dataclass
class CommandResult:
    command: List[str]
    returncode: int
    stdout: str
    stderr: str


class ProjectCommandRunner:
    """Run long-lived project operations with per-project locking."""

    def __init__(self) -> None:
        self._locks: Dict[str, threading.Lock] = {}
        self._registry_lock = threading.Lock()

    def _lock_for(self, project_name: str) -> threading.Lock:
        with self._registry_lock:
            if project_name not in self._locks:
                self._locks[project_name] = threading.Lock()
            return self._locks[project_name]

    def run(
        self,
        project_name: str,
        command: List[str],
        env_overrides: Optional[Dict[str, Optional[str]]] = None,
    ) -> CommandResult:
        lock = self._lock_for(project_name)
        if not lock.acquire(blocking=False):
            raise RuntimeError("Another task is already running for this project")

        try:
            env = os.environ.copy()
            if env_overrides:
                for key, value in env_overrides.items():
                    if value is None:
                        env.pop(key, None)
                    else:
                        env[key] = value
            completed = subprocess.run(
                command,
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=env,
            )
            return CommandResult(
                command=command,
                returncode=completed.returncode,
                stdout=completed.stdout,
                stderr=completed.stderr,
            )
        finally:
            lock.release()


RUNNER = ProjectCommandRunner()
PROJECT_MANAGER = ProjectManager(base_dir=str(PROJECTS_DIR))


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


class PPTConsoleHandler(BaseHTTPRequestHandler):
    server_version = "PPTMasterWeb/1.0"

    def do_GET(self) -> None:  # noqa: N802
        try:
            parsed = urlparse(self.path)
            path = parsed.path

            if path == "/":
                self._serve_static("index.html", "text/html")
                return
            if path.startswith("/static/"):
                rel_path = path.removeprefix("/static/")
                self._serve_static(rel_path)
                return
            if path == "/api/dashboard":
                self._handle_dashboard()
                return
            if path == "/api/model-config":
                self._handle_model_config_get()
                return
            if path == "/api/image-model-config":
                self._handle_image_model_config_get()
                return
            if path == "/api/templates":
                self._handle_templates_get()
                return
            if path.startswith("/api/projects/"):
                self._handle_project_get(path)
                return
            if path.startswith("/files/"):
                self._serve_repo_file(path)
                return

            json_response(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})
        except Exception as exc:  # pragma: no cover - guardrail
            json_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})

    def do_POST(self) -> None:  # noqa: N802
        try:
            parsed = urlparse(self.path)
            path = parsed.path
            body = self._read_json_body()

            if path == "/api/projects":
                self._create_project(body)
                return
            if path == "/api/model-config/models":
                self._handle_model_catalog_post(body)
                return
            if path == "/api/model-config":
                self._handle_model_config_post(body)
                return
            if path == "/api/image-model-config":
                self._handle_image_model_config_post(body)
                return
            if path == "/api/image-model-config/test":
                self._handle_image_model_test(body)
                return
            if path.startswith("/api/projects/"):
                self._handle_project_post(path, body)
                return

            json_response(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})
        except ValueError as exc:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception as exc:  # pragma: no cover - guardrail
            json_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})

    def do_DELETE(self) -> None:  # noqa: N802
        try:
            parsed = urlparse(self.path)
            path = parsed.path

            if path.startswith("/api/projects/"):
                self._handle_project_delete(path)
                return

            json_response(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})
        except ValueError as exc:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception as exc:  # pragma: no cover - guardrail
            json_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        return

    def _read_json_body(self) -> Dict[str, Any]:
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            return {}

        raw = self.rfile.read(content_length)
        if not raw:
            return {}

        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            raise ValueError("Request body must be valid JSON")

    def _serve_static(self, relative_path: str, content_type: Optional[str] = None) -> None:
        target = (STATIC_DIR / relative_path).resolve()
        try:
            target.relative_to(STATIC_DIR.resolve())
        except ValueError:
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        if not target.exists() or not target.is_file():
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        mime_type = content_type or mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        data = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", mime_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _serve_repo_file(self, request_path: str) -> None:
        rel_path = request_path.removeprefix("/files/")
        safe_parts = [unquote(part) for part in rel_path.split("/") if part]
        if not safe_parts:
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        root_name = safe_parts[0]
        if root_name == "projects":
            base = PROJECTS_DIR
        elif root_name == "examples":
            base = EXAMPLES_DIR
        elif root_name == "templates":
            base = TEMPLATES_DIR
        else:
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        target = (base / Path(*safe_parts[1:])).resolve()
        try:
            target.relative_to(base.resolve())
        except ValueError:
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        if not target.exists() or not target.is_file():
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        data = target.read_bytes()
        mime_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", mime_type)
        self.send_header("Content-Length", str(len(data)))
        if mime_type in {"image/svg+xml", "text/plain", "text/markdown"}:
            self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _handle_dashboard(self) -> None:
        formats = [
            {
                "id": key,
                "name": value["name"],
                "dimensions": value["dimensions"],
                "aspect_ratio": value["aspect_ratio"],
                "use_case": value.get("use_case", ""),
            }
            for key, value in CANVAS_FORMATS.items()
        ]
        payload = {
            "repo_root": str(REPO_ROOT),
            "projects_root": str(PROJECTS_DIR),
            "model_config": get_text_model_config(),
            "formats": formats,
            "steps": [
                {"id": key, "label": value["label"]}
                for key, value in POST_PROCESSING_STEPS.items()
            ],
            "projects": list_projects(),
        }
        json_response(self, HTTPStatus.OK, payload)

    def _handle_model_config_get(self) -> None:
        json_response(self, HTTPStatus.OK, {"model_config": get_text_model_config()})

    def _handle_templates_get(self) -> None:
        """Return list of available templates."""
        result = list_templates()
        json_response(self, HTTPStatus.OK, result)

    def _apply_template(self, project_name: str, project_path: Path, body: Dict[str, Any]) -> None:
        """Apply a template to a project."""
        template_id = str(body.get("template_id", "")).strip()
        if not template_id:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "template_id is required"})
            return

        try:
            copied_files = apply_template_to_project(project_path, template_id)
        except ValueError as exc:
            json_response(self, HTTPStatus.NOT_FOUND, {"error": str(exc)})
            return
        except Exception as exc:
            json_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, {"error": f"Failed to apply template: {exc}"})
            return

        json_response(
            self,
            HTTPStatus.OK,
            {
                "message": f"Template '{template_id}' applied successfully",
                "template_id": template_id,
                "copied_files": copied_files,
                "project": build_project_summary(project_path),
            },
        )

    def _analyze_project(self, project_name: str, project_path: Path, body: Dict[str, Any]) -> None:
        """Analyze project sources and generate Strategist recommendations."""
        # Check sources exist
        sources_dir = project_path / "sources"
        if not sources_dir.exists() or not any(sources_dir.iterdir()):
            json_response(
                self,
                HTTPStatus.BAD_REQUEST,
                {"error": "No source content found. Import sources first.", "project": build_project_summary(project_path)},
            )
            return

        # Get profile for LLM
        profile_id = str(body.get("profile_id", "")).strip() or None
        profile = resolve_private_profile(profile_id)
        if profile is None:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "No model profile configured"})
            return
        if not str(profile.get("api_key", "")).strip():
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "Selected model profile has no API key"})
            return
        if not str(profile.get("backend", "")).strip():
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "Selected model profile has no backend"})
            return

        try:
            result = analyze_content_for_strategist(project_path, profile)
        except ValueError as exc:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": str(exc), "project": build_project_summary(project_path)})
            return
        except Exception as exc:
            json_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, {"error": f"Analysis failed: {exc}"})
            return

        json_response(
            self,
            HTTPStatus.OK,
            {
                "message": "Analysis completed",
                "recommendations": result,
                "project": build_project_summary(project_path),
                "profile": build_public_profile(profile),
            },
        )

    def _save_design_spec(self, project_name: str, project_path: Path, body: Dict[str, Any]) -> None:
        """Save design specification to project."""
        spec = body.get("spec")
        if not spec:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "spec is required"})
            return

        # Build design_spec.md content
        canvas_format = spec.get("canvas_format", "ppt169")
        page_count = spec.get("page_count", {})
        target_audience = spec.get("target_audience", "")
        style_objective = spec.get("style_objective", "general")
        color_scheme = spec.get("color_scheme", {})
        icon_approach = spec.get("icon_approach", "builtin")
        typography = spec.get("typography", {})
        image_approach = spec.get("image_approach", "none")

        # Get canvas format info
        canvas_info = CANVAS_FORMATS.get(canvas_format, CANVAS_FORMATS.get("ppt169", {}))

        style_names = {
            "general": "通用灵活 (General Flexible)",
            "consultant": "一般咨询 (General Consulting)",
            "consultant-top": "顶级咨询 (Top Consulting)",
        }

        icon_names = {
            "builtin": "内置图标库",
            "emoji": "Emoji 表情",
            "ai-generated": "AI 生成",
            "none": "不使用图标",
        }

        image_names = {
            "none": "不使用图片",
            "user-provided": "用户提供",
            "ai-generated": "AI 生成",
            "placeholder": "占位符",
        }

        content = f"""# Design Specification

## Canvas

- **Format**: {canvas_info.get('name', 'PPT 16:9')}
- **Dimensions**: {canvas_info.get('dimensions', '1280×720')}
- **ViewBox**: {canvas_info.get('viewbox', '0 0 1280 720')}

## Page Count

- **Minimum**: {page_count.get('min', 8)}
- **Maximum**: {page_count.get('max', 12)}

## Target Audience

{target_audience or 'General audience'}

## Style Objective

**{style_names.get(style_objective, '通用灵活')}**

## Color Scheme

- **Primary**: `{color_scheme.get('primary', '#1565C0')}`
- **Secondary**: `{color_scheme.get('secondary', '#42A5F5')}`
- **Accent**: `{color_scheme.get('accent', '#FF6F00')}`

## Icon Usage

**{icon_names.get(icon_approach, '内置图标库')}**

## Typography

- **Title Font**: {typography.get('title_font', 'Microsoft YaHei')}
- **Body Font**: {typography.get('body_font', 'Microsoft YaHei')}
- **Body Size**: {typography.get('body_size', 24)}px

## Image Usage

**{image_names.get(image_approach, '不使用图片')}**

---

*Generated by PPT Master Web Console*
"""

        spec_path = project_path / "design_spec.md"
        try:
            spec_path.write_text(content, encoding="utf-8")
        except Exception as exc:
            json_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, {"error": f"Failed to write design_spec.md: {exc}"})
            return

        json_response(
            self,
            HTTPStatus.OK,
            {
                "message": "Design specification saved",
                "path": str(spec_path),
                "project": build_project_summary(project_path),
            },
        )

    def _handle_model_config_post(self, body: Dict[str, Any]) -> None:
        action = str(body.get("action", "upsert")).strip().lower()
        state = get_private_model_profiles_state()
        profiles = list(state.get("profiles", []))
        selected_profile_id = state.get("selected_profile_id")

        if action == "upsert":
            raw_profile = body.get("profile")
            if not isinstance(raw_profile, dict):
                raise ValueError("profile is required")

            profile_id = str(raw_profile.get("id", "")).strip()
            existing = next((item for item in profiles if str(item.get("id")) == profile_id), None) if profile_id else None
            normalized = normalize_profile(raw_profile, existing=existing)
            if not normalized.get("api_key"):
                raise ValueError("API key is required")

            if existing is None:
                profiles.append(normalized)
            else:
                index = profiles.index(existing)
                if existing.get("source") and existing.get("source") != "env":
                    normalized["source"] = existing["source"]
                profiles[index] = normalized

            if body.get("select", True) or not selected_profile_id:
                selected_profile_id = normalized["id"]

            save_model_profiles_file({
                "profiles": profiles,
                "selected_profile_id": selected_profile_id,
            })
            json_response(
                self,
                HTTPStatus.OK,
                {
                    "message": "Model profile saved",
                    "profile": build_public_profile(normalized),
                    "model_config": get_text_model_config(),
                },
            )
            return

        if action == "delete":
            profile_id = str(body.get("profile_id", "")).strip()
            if not profile_id:
                raise ValueError("profile_id is required")
            target = next((item for item in profiles if str(item.get("id")) == profile_id), None)
            if target is None:
                raise ValueError("Profile not found")
            if str(target.get("source", "")) == "env":
                raise ValueError("Legacy env profile cannot be deleted here")

            profiles = [item for item in profiles if str(item.get("id")) != profile_id]
            if selected_profile_id == profile_id:
                selected_profile_id = profiles[0]["id"] if profiles else None

            save_model_profiles_file({
                "profiles": profiles,
                "selected_profile_id": selected_profile_id,
            })
            json_response(
                self,
                HTTPStatus.OK,
                {
                    "message": "Model profile deleted",
                    "model_config": get_text_model_config(),
                },
            )
            return

        if action == "select":
            profile_id = str(body.get("profile_id", "")).strip()
            if not profile_id:
                raise ValueError("profile_id is required")
            target = next((item for item in profiles if str(item.get("id")) == profile_id), None)
            if target is None:
                raise ValueError("Profile not found")

            if str(target.get("source", "")) != "env" or MODEL_PROFILES_FILE.exists():
                save_model_profiles_file({
                    "profiles": profiles,
                    "selected_profile_id": profile_id,
                })

            json_response(
                self,
                HTTPStatus.OK,
                {
                    "message": "Active model profile updated",
                    "model_config": get_text_model_config(),
                },
            )
            return

        if action == "test":
            raw_profile = body.get("profile")
            if not isinstance(raw_profile, dict):
                raise ValueError("profile is required")

            profile_id = str(raw_profile.get("id", "")).strip()
            existing = next((item for item in profiles if str(item.get("id")) == profile_id), None) if profile_id else None
            candidate = build_test_profile(raw_profile, existing=existing)
            result = test_text_model_profile(candidate)

            json_response(
                self,
                HTTPStatus.OK,
                {
                    "message": "Model test succeeded",
                    "result": result,
                },
            )
            return

        raise ValueError(f"Unsupported action: {action}")

    def _handle_model_catalog_post(self, body: Dict[str, Any]) -> None:
        backend = validate_text_backend(str(body.get("backend", "")))
        base_url = str(body.get("base_url", "")).strip()
        api_key = str(body.get("api_key", "")).strip()
        if not api_key:
            raise ValueError("API key is required to fetch models")

        if backend == "openai":
            models = fetch_openai_compatible_models(base_url, api_key)
        else:
            models = fetch_gemini_models(base_url, api_key)

        json_response(
            self,
            HTTPStatus.OK,
            {
                "models": models,
                "count": len(models),
            },
        )

    def _handle_image_model_config_get(self) -> None:
        """Return current image model configuration."""
        json_response(self, HTTPStatus.OK, {"image_model_config": get_image_model_config()})

    def _handle_image_model_config_post(self, body: Dict[str, Any]) -> None:
        """Handle image model profile CRUD operations."""
        action = str(body.get("action", "upsert")).strip().lower()
        state = get_private_image_model_profiles_state()
        profiles = list(state.get("profiles", []))
        selected_profile_id = state.get("selected_profile_id")

        if action == "upsert":
            raw_profile = body.get("profile")
            if not isinstance(raw_profile, dict):
                raise ValueError("profile is required")

            profile_id = str(raw_profile.get("id", "")).strip()
            existing = next((item for item in profiles if str(item.get("id")) == profile_id), None) if profile_id else None

            backend = str(raw_profile.get("backend", existing.get("backend") if existing else "gemini")).lower()
            if backend not in IMAGE_BACKENDS:
                raise ValueError("Backend must be 'gemini' or 'openai'")

            name = str(raw_profile.get("name", existing.get("name") if existing else "")).strip()
            if not name:
                raise ValueError("Profile name is required")

            api_key = str(raw_profile.get("api_key", "")).strip()
            if not api_key and existing is not None:
                api_key = str(existing.get("api_key", "")).strip()

            if not api_key:
                raise ValueError("API key is required")

            model = str(raw_profile.get("model", existing.get("model") if existing else "")).strip()
            base_url = str(raw_profile.get("base_url", existing.get("base_url") if existing else "")).strip()
            new_id = str(raw_profile.get("id", existing.get("id") if existing else "")).strip() or uuid.uuid4().hex

            normalized = {
                "id": new_id,
                "name": name,
                "backend": backend,
                "model": model,
                "base_url": base_url,
                "api_key": api_key,
            }

            if existing is None:
                profiles.append(normalized)
            else:
                index = profiles.index(existing)
                profiles[index] = normalized

            if body.get("select", True) or not selected_profile_id:
                selected_profile_id = normalized["id"]

            save_image_model_profiles_file({
                "profiles": profiles,
                "selected_profile_id": selected_profile_id,
            })

            json_response(
                self,
                HTTPStatus.OK,
                {
                    "message": "Image model profile saved",
                    "profile": build_public_profile(normalized),
                    "image_model_config": get_image_model_config(),
                },
            )
            return

        if action == "delete":
            profile_id = str(body.get("profile_id", "")).strip()
            if not profile_id:
                raise ValueError("profile_id is required")
            target = next((item for item in profiles if str(item.get("id")) == profile_id), None)
            if target is None:
                raise ValueError("Profile not found")

            profiles = [item for item in profiles if str(item.get("id")) != profile_id]
            if selected_profile_id == profile_id:
                selected_profile_id = profiles[0]["id"] if profiles else None

            save_image_model_profiles_file({
                "profiles": profiles,
                "selected_profile_id": selected_profile_id,
            })
            json_response(
                self,
                HTTPStatus.OK,
                {
                    "message": "Image model profile deleted",
                    "image_model_config": get_image_model_config(),
                },
            )
            return

        if action == "select":
            profile_id = str(body.get("profile_id", "")).strip()
            if not profile_id:
                raise ValueError("profile_id is required")
            target = next((item for item in profiles if str(item.get("id")) == profile_id), None)
            if target is None:
                raise ValueError("Profile not found")

            save_image_model_profiles_file({
                "profiles": profiles,
                "selected_profile_id": profile_id,
            })

            json_response(
                self,
                HTTPStatus.OK,
                {
                    "message": "Active image model profile updated",
                    "image_model_config": get_image_model_config(),
                },
            )
            return

        raise ValueError(f"Unsupported action: {action}")

    def _handle_image_model_test(self, body: Dict[str, Any]) -> None:
        """Test image model configuration with a simple generation."""
        raw_profile = body.get("profile")
        if not isinstance(raw_profile, dict):
            raise ValueError("profile is required")

        backend = str(raw_profile.get("backend", "gemini")).lower()
        if backend not in IMAGE_BACKENDS:
            raise ValueError("Backend must be 'gemini' or 'openai'")

        api_key = str(raw_profile.get("api_key", "")).strip()
        if not api_key:
            raise ValueError("API key is required")

        model = str(raw_profile.get("model", "")).strip()
        base_url = str(raw_profile.get("base_url", "")).strip()

        # Use a simple test prompt
        test_prompt = "A simple abstract gradient background, minimalist style"

        try:
            with tempfile.TemporaryDirectory(prefix="ppt_master_image_test_") as temp_dir:
                result = generate_image(
                    profile={"backend": backend, "api_key": api_key, "base_url": base_url, "model": model},
                    prompt=test_prompt,
                    output_dir=temp_dir,
                    filename="test_image",
                    aspect_ratio="1:1",
                    image_size="512px",
                )
                json_response(
                    self,
                    HTTPStatus.OK,
                    {
                        "message": "Image generation test succeeded",
                        "result": {
                            "backend": result.get("backend"),
                            "model": result.get("model"),
                            "filename": result.get("filename"),
                        },
                    },
                )
        except Exception as exc:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": f"Image generation test failed: {exc}"})

    def _handle_project_get(self, path: str) -> None:
        parts = [part for part in path.split("/") if part]
        if len(parts) != 3:
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        project_name = unquote(parts[2])
        try:
            project_path = project_path_from_name(project_name)
        except FileNotFoundError as exc:
            json_response(self, HTTPStatus.NOT_FOUND, {"error": str(exc)})
            return

        json_response(self, HTTPStatus.OK, {"project": build_project_summary(project_path)})

    def _handle_project_delete(self, path: str) -> None:
        """Delete a project by name."""
        parts = [part for part in path.split("/") if part]
        if len(parts) != 3:
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        project_name = unquote(parts[2])
        try:
            project_path = project_path_from_name(project_name)
        except FileNotFoundError as exc:
            json_response(self, HTTPStatus.NOT_FOUND, {"error": str(exc)})
            return

        # Safety check: only delete within PROJECTS_DIR
        try:
            project_path.resolve().relative_to(PROJECTS_DIR.resolve())
        except ValueError:
            json_response(self, HTTPStatus.FORBIDDEN, {"error": "Cannot delete project outside projects directory"})
            return

        # Delete the project directory
        try:
            shutil.rmtree(project_path)
            json_response(self, HTTPStatus.OK, {"message": f"Project '{project_name}' deleted"})
        except Exception as exc:
            json_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, {"error": f"Failed to delete project: {exc}"})

    def _create_project(self, body: Dict[str, Any]) -> None:
        project_name = str(body.get("project_name", "")).strip()
        canvas_format = str(body.get("canvas_format", "ppt169")).strip()
        if not project_name:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "project_name is required"})
            return

        try:
            project_path = PROJECT_MANAGER.init_project(project_name, canvas_format, str(PROJECTS_DIR))
        except Exception as exc:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return

        created_path = Path(project_path)
        json_response(
            self,
            HTTPStatus.CREATED,
            {
                "message": "Project created",
                "project": build_project_summary(created_path),
            },
        )

    def _handle_project_post(self, path: str, body: Dict[str, Any]) -> None:
        parts = [part for part in path.split("/") if part]
        if len(parts) < 4:
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        project_name = unquote(parts[2])
        action = unquote(parts[3])

        try:
            project_path = project_path_from_name(project_name)
        except FileNotFoundError as exc:
            json_response(self, HTTPStatus.NOT_FOUND, {"error": str(exc)})
            return

        if action == "import":
            self._import_sources(project_name, project_path, body)
            return
        if action == "validate":
            self._validate_project(project_path)
            return
        if action == "apply-template":
            self._apply_template(project_name, project_path, body)
            return
        if action == "analyze":
            self._analyze_project(project_name, project_path, body)
            return
        if action == "design-spec":
            self._save_design_spec(project_name, project_path, body)
            return
        if action == "generate-notes":
            self._generate_notes(project_name, project_path, body)
            return
        if action == "generate-svg":
            self._generate_svg_stream(project_name, project_path, body)
            return
        if action == "regenerate-svg":
            self._regenerate_svg_pages(project_name, project_path, body)
            return
        if action == "delete-svg":
            self._delete_svg_files(project_name, project_path, body)
            return
        if action == "generate-image":
            self._generate_image(project_name, project_path, body)
            return
        if action == "run-step" and len(parts) == 5:
            self._run_post_processing_step(project_name, project_path, unquote(parts[4]))
            return

        json_response(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def _import_sources(self, project_name: str, project_path: Path, body: Dict[str, Any]) -> None:
        raw_sources = body.get("sources", [])
        move = bool(body.get("move", False))
        pasted_content = str(body.get("pasted_content", ""))
        pasted_format = str(body.get("pasted_format", "markdown")).strip().lower()
        pasted_filename = str(body.get("pasted_filename", "")).strip()

        if not isinstance(raw_sources, list):
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "sources must be a list"})
            return

        sources = [str(item).strip() for item in raw_sources if str(item).strip()]
        has_pasted_content = bool(pasted_content.strip())

        if pasted_format not in {"markdown", "text"}:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "pasted_format must be markdown or text"})
            return

        if not sources and not has_pasted_content:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "Provide sources or pasted content"})
            return

        temp_dir_obj: Optional[tempfile.TemporaryDirectory[str]] = None
        try:
            if has_pasted_content:
                suffix = ".md" if pasted_format == "markdown" else ".txt"
                temp_dir_obj = tempfile.TemporaryDirectory(prefix="ppt_master_paste_")
                temp_dir = Path(temp_dir_obj.name)
                temp_file = temp_dir / sanitize_uploaded_name(
                    pasted_filename,
                    default_stem="pasted_source",
                    suffix=suffix,
                )
                temp_file.write_text(pasted_content, encoding="utf-8")
                sources.append(str(temp_file))

            summary = PROJECT_MANAGER.import_sources(str(project_path), sources, move=move)
        except Exception as exc:
            json_response(
                self,
                HTTPStatus.BAD_REQUEST,
                {"error": str(exc), "project": build_project_summary(project_path)},
            )
            return
        finally:
            if temp_dir_obj is not None:
                temp_dir_obj.cleanup()

        json_response(
            self,
            HTTPStatus.OK,
            {
                "message": "Sources imported",
                "summary": summary,
                "project": build_project_summary(project_path),
            },
        )

    def _validate_project(self, project_path: Path) -> None:
        try:
            is_valid, errors, warnings = PROJECT_MANAGER.validate_project(str(project_path))
        except Exception as exc:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return

        json_response(
            self,
            HTTPStatus.OK,
            {
                "project": build_project_summary(project_path),
                "validation": {
                    "is_valid": is_valid,
                    "errors": errors,
                    "warnings": warnings,
                },
            },
        )

    def _generate_notes(self, project_name: str, project_path: Path, body: Dict[str, Any]) -> None:
        summary = build_project_summary(project_path)
        if summary["svg_output_count"] == 0:
            json_response(
                self,
                HTTPStatus.BAD_REQUEST,
                {
                    "error": "Generate notes requires SVG files in svg_output/. Run Strategist/Executor first, then retry.",
                    "project": summary,
                },
            )
            return

        command = [
            sys.executable,
            str(SCRIPTS_DIR / "notes_gen.py"),
            str(project_path),
            "--overwrite",
        ]
        profile_id = str(body.get("profile_id", "")).strip() or None
        profile = resolve_private_profile(profile_id)
        if profile is None:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "No model profile configured"})
            return
        if not str(profile.get("api_key", "")).strip():
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "Selected model profile has no API key"})
            return
        if not str(profile.get("backend", "")).strip():
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "Selected model profile has no backend"})
            return

        env_overrides = build_text_env_overrides(profile)

        try:
            result = RUNNER.run(project_name, command, env_overrides=env_overrides)
        except RuntimeError as exc:
            json_response(self, HTTPStatus.CONFLICT, {"error": str(exc)})
            return

        payload = {
            "message": "Notes generation completed" if result.returncode == 0 else "Notes generation failed",
            "project": build_project_summary(project_path),
            "profile": build_public_profile(profile),
            "command": result.command,
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
        status = HTTPStatus.OK if result.returncode == 0 else HTTPStatus.BAD_REQUEST
        json_response(self, status, payload)

    def _generate_svg_stream(self, project_name: str, project_path: Path, body: Dict[str, Any]) -> None:
        """Generate SVG pages with SSE streaming."""
        import queue
        import threading

        # Get profile for LLM
        profile_id = str(body.get("profile_id", "")).strip() or None
        profile = resolve_private_profile(profile_id)
        if profile is None:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "No model profile configured"})
            return
        if not str(profile.get("api_key", "")).strip():
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "Selected model profile has no API key"})
            return
        if not str(profile.get("backend", "")).strip():
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "Selected model profile has no backend"})
            return

        # Check design spec exists
        design_spec_path = find_design_spec_file(project_path)
        if design_spec_path is None:
            json_response(
                self,
                HTTPStatus.BAD_REQUEST,
                {"error": "Design spec not found. Complete Strategist phase first."},
            )
            return

        design_spec = design_spec_path.read_text(encoding="utf-8", errors="replace")
        sources_content = load_project_sources(project_path, max_files=10, max_chars=SVG_GENERATION_MAX_CHARS)

        # Parse page outline from design spec
        pages = parse_design_spec_for_pages(design_spec)
        if not pages:
            # Estimate pages if no outline found
            estimated_pages = estimate_page_count(design_spec, sources_content)
            pages = [
                {"number": i + 1, "title": f"Page {i + 1}", "type": "content"}
                for i in range(estimated_pages)
            ]

        backend = str(profile.get("backend", "openai")).lower()
        api_key = str(profile.get("api_key", "")).strip()
        base_url = str(profile.get("base_url", "")).strip() or None
        model = str(profile.get("model", "")).strip()
        if not model:
            model = "gpt-4o-mini" if backend == "openai" else "gemini-2.5-flash"

        # Prepare output directory
        svg_output_dir = project_path / "svg_output"
        svg_output_dir.mkdir(parents=True, exist_ok=True)

        # Set up SSE streaming
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        def send_event(event: str, data: Dict[str, Any]) -> None:
            payload = f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
            self.wfile.write(payload.encode("utf-8"))
            self.wfile.flush()

        def send_log(message: str) -> None:
            send_event("log", {"message": message})

        existing_pages: List[str] = []
        generated_files: List[str] = []
        errors: List[str] = []

        send_event("start", {
            "total_pages": len(pages),
            "model": model,
            "backend": backend,
        })

        for page in pages:
            page_num = page["number"]
            page_title = page["title"]
            page_type = page["type"]

            send_log(f"Generating page {page_num}/{len(pages)}: {page_title}...")

            try:
                prompt = build_svg_generation_prompt(
                    project_path=project_path,
                    page_number=page_num,
                    total_pages=len(pages),
                    page_title=page_title,
                    page_type=page_type,
                    design_spec=design_spec,
                    sources_content=sources_content,
                    existing_pages=existing_pages,
                )

                svg_content = generate_single_svg(
                    prompt=prompt,
                    backend=backend,
                    api_key=api_key,
                    base_url=base_url,
                    model=model,
                )

                # Save SVG file
                filename = f"page_{page_num:03d}.svg"
                output_path = svg_output_dir / filename
                output_path.write_text(svg_content, encoding="utf-8")

                generated_files.append(filename)
                existing_pages.append(f"{page_num}:{page_title}")

                send_event("page_complete", {
                    "page_number": page_num,
                    "total_pages": len(pages),
                    "filename": filename,
                    "title": page_title,
                    "url": f"/files/projects/{project_name}/svg_output/{filename}",
                })

            except Exception as exc:
                error_msg = f"Page {page_num} failed: {exc}"
                errors.append(error_msg)
                send_event("page_error", {
                    "page_number": page_num,
                    "error": str(exc),
                })

        # Send completion event
        send_event("complete", {
            "total_pages": len(pages),
            "generated": len(generated_files),
            "errors": errors,
            "files": generated_files,
            "project": build_project_summary(project_path),
        })

    def _regenerate_svg_pages(self, project_name: str, project_path: Path, body: Dict[str, Any]) -> None:
        """Regenerate specified SVG pages with SSE streaming."""
        import queue
        import threading

        # Get pages to regenerate
        page_numbers = body.get("page_numbers", [])  # List of page numbers to regenerate
        regenerate_all = body.get("regenerate_all", False)  # Regenerate all pages

        # Get profile for LLM
        profile_id = str(body.get("profile_id", "")).strip() or None
        profile = resolve_private_profile(profile_id)
        if profile is None:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "No model profile configured"})
            return
        if not str(profile.get("api_key", "")).strip():
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "Selected model profile has no API key"})
            return
        if not str(profile.get("backend", "")).strip():
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "Selected model profile has no backend"})
            return

        # Check design spec exists
        design_spec_path = find_design_spec_file(project_path)
        if design_spec_path is None:
            json_response(
                self,
                HTTPStatus.BAD_REQUEST,
                {"error": "Design spec not found. Complete Strategist phase first."},
            )
            return

        design_spec = design_spec_path.read_text(encoding="utf-8", errors="replace")
        sources_content = load_project_sources(project_path, max_files=10, max_chars=SVG_GENERATION_MAX_CHARS)

        # Parse page outline from design spec
        all_pages = parse_design_spec_for_pages(design_spec)
        if not all_pages:
            estimated_pages = estimate_page_count(design_spec, sources_content)
            all_pages = [
                {"number": i + 1, "title": f"Page {i + 1}", "type": "content"}
                for i in range(estimated_pages)
            ]

        # Determine which pages to regenerate
        if regenerate_all:
            pages_to_generate = all_pages
        else:
            # Filter by specified page numbers
            page_set = set(page_numbers)
            pages_to_generate = [p for p in all_pages if p["number"] in page_set]

        if not pages_to_generate:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "No valid pages to regenerate"})
            return

        backend = str(profile.get("backend", "openai")).lower()
        api_key = str(profile.get("api_key", "")).strip()
        base_url = str(profile.get("base_url", "")).strip() or None
        model = str(profile.get("model", "")).strip()
        if not model:
            model = "gpt-4o-mini" if backend == "openai" else "gemini-2.5-flash"

        # Prepare output directory
        svg_output_dir = project_path / "svg_output"
        svg_output_dir.mkdir(parents=True, exist_ok=True)

        # Build existing pages list from files that won't be regenerated
        existing_files = sorted(svg_output_dir.glob("*.svg"))
        existing_pages: List[str] = []
        for svg_file in existing_files:
            # Extract page number from filename (page_001.svg -> 1)
            try:
                page_num = int(svg_file.stem.split("_")[1])
                if page_num not in {p["number"] for p in pages_to_generate}:
                    existing_pages.append(f"{page_num}:{_get_page_title(svg_file)}")
            except (IndexError, ValueError):
                pass

        # Set up SSE streaming
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        def send_event(event: str, data: Dict[str, Any]) -> None:
            payload = f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
            self.wfile.write(payload.encode("utf-8"))
            self.wfile.flush()

        def send_log(message: str) -> None:
            send_event("log", {"message": message})

        generated_files: List[str] = []
        errors: List[str] = []

        send_event("start", {
            "total_pages": len(pages_to_generate),
            "model": model,
            "backend": backend,
            "regenerate": True,
        })

        for page in pages_to_generate:
            page_num = page["number"]
            page_title = page["title"]
            page_type = page["type"]

            send_log(f"Regenerating page {page_num}/{len(all_pages)}: {page_title}...")

            try:
                prompt = build_svg_generation_prompt(
                    project_path=project_path,
                    page_number=page_num,
                    total_pages=len(all_pages),
                    page_title=page_title,
                    page_type=page_type,
                    design_spec=design_spec,
                    sources_content=sources_content,
                    existing_pages=existing_pages,
                )

                svg_content = generate_single_svg(
                    prompt=prompt,
                    backend=backend,
                    api_key=api_key,
                    base_url=base_url,
                    model=model,
                )

                # Save SVG file (overwrite existing)
                filename = f"page_{page_num:03d}.svg"
                output_path = svg_output_dir / filename
                output_path.write_text(svg_content, encoding="utf-8")

                generated_files.append(filename)
                existing_pages.append(f"{page_num}:{page_title}")

                send_event("page_complete", {
                    "page_number": page_num,
                    "total_pages": len(pages_to_generate),
                    "filename": filename,
                    "title": page_title,
                    "url": f"/files/projects/{project_name}/svg_output/{filename}",
                })

            except Exception as exc:
                error_msg = f"Page {page_num} failed: {exc}"
                errors.append(error_msg)
                send_event("page_error", {
                    "page_number": page_num,
                    "error": str(exc),
                })

        # Send completion event
        send_event("complete", {
            "total_pages": len(pages_to_generate),
            "generated": len(generated_files),
            "errors": errors,
            "files": generated_files,
            "project": build_project_summary(project_path),
        })

    def _delete_svg_files(self, project_name: str, project_path: Path, body: Dict[str, Any]) -> None:
        """Delete specified SVG files."""
        page_numbers = body.get("page_numbers", [])  # List of page numbers to delete
        delete_all = body.get("delete_all", False)  # Delete all SVG files

        svg_output_dir = project_path / "svg_output"
        svg_final_dir = project_path / "svg_final"

        deleted_files: List[str] = []

        if delete_all:
            # Delete all SVG files from both directories
            for directory in [svg_output_dir, svg_final_dir]:
                if directory.exists():
                    for svg_file in directory.glob("*.svg"):
                        try:
                            svg_file.unlink()
                            deleted_files.append(svg_file.name)
                        except Exception as exc:
                            pass  # Ignore deletion errors

            # Also delete total.md notes if exists
            total_notes = project_path / "notes" / "total.md"
            if total_notes.exists():
                try:
                    total_notes.unlink()
                except Exception:
                    pass

            # Delete split notes
            notes_dir = project_path / "notes"
            if notes_dir.exists():
                for note_file in notes_dir.glob("page_*.md"):
                    try:
                        note_file.unlink()
                    except Exception:
                        pass
        else:
            # Delete specific pages
            for page_num in page_numbers:
                filename = f"page_{page_num:03d}.svg"

                # Delete from svg_output
                svg_output_file = svg_output_dir / filename
                if svg_output_file.exists():
                    try:
                        svg_output_file.unlink()
                        deleted_files.append(filename)
                    except Exception:
                        pass

                # Delete from svg_final
                svg_final_file = svg_final_dir / filename
                if svg_final_file.exists():
                    try:
                        svg_final_file.unlink()
                    except Exception:
                        pass

                # Delete corresponding note
                note_file = project_path / "notes" / f"page_{page_num:03d}.md"
                if note_file.exists():
                    try:
                        note_file.unlink()
                    except Exception:
                        pass

        json_response(
            self,
            HTTPStatus.OK,
            {
                "message": f"Deleted {len(deleted_files)} SVG files",
                "deleted_files": deleted_files,
                "project": build_project_summary(project_path),
            },
        )

    def _generate_image(self, project_name: str, project_path: Path, body: Dict[str, Any]) -> None:
        """Generate a single image for the project."""
        # Get profile
        profile_id = str(body.get("profile_id", "")).strip() or None
        profile = resolve_private_image_profile(profile_id)
        if profile is None:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "No image model profile configured"})
            return
        if not str(profile.get("api_key", "")).strip():
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "Selected image model profile has no API key"})
            return

        # Get prompt
        prompt = str(body.get("prompt", "")).strip()
        if not prompt:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "prompt is required"})
            return

        # Get optional parameters
        filename = str(body.get("filename", "")).strip() or None
        aspect_ratio = str(body.get("aspect_ratio", "1:1")).strip()
        image_size = str(body.get("image_size", "1K")).strip()

        if aspect_ratio not in IMAGE_ASPECT_RATIOS:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": f"Invalid aspect_ratio. Valid: {', '.join(IMAGE_ASPECT_RATIOS)}"})
            return

        if image_size not in IMAGE_SIZES:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": f"Invalid image_size. Valid: {', '.join(IMAGE_SIZES)}"})
            return

        # Ensure images directory exists
        images_dir = project_path / "images"
        images_dir.mkdir(parents=True, exist_ok=True)

        try:
            result = generate_image(
                profile=profile,
                prompt=prompt,
                output_dir=str(images_dir),
                filename=filename,
                aspect_ratio=aspect_ratio,
                image_size=image_size,
            )
            json_response(
                self,
                HTTPStatus.OK,
                {
                    "message": "Image generated successfully",
                    "image": {
                        "filename": result.get("filename"),
                        "url": f"/files/projects/{project_name}/images/{result.get('filename')}",
                        "prompt": result.get("prompt"),
                        "model": result.get("model"),
                        "backend": result.get("backend"),
                    },
                    "project": build_project_summary(project_path),
                },
            )
        except Exception as exc:
            json_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, {"error": f"Image generation failed: {exc}"})

    def _run_post_processing_step(self, project_name: str, project_path: Path, step_id: str) -> None:
        if step_id not in POST_PROCESSING_STEPS:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": f"Unknown step: {step_id}"})
            return

        guard_error = get_step_guard(project_path, step_id)
        if guard_error:
            json_response(
                self,
                HTTPStatus.BAD_REQUEST,
                {
                    "error": guard_error,
                    "project": build_project_summary(project_path),
                },
            )
            return

        config = POST_PROCESSING_STEPS[step_id]
        command = [
            sys.executable,
            str(SCRIPTS_DIR / config["script"]),
            str(project_path),
            *config["args"],
        ]

        try:
            result = RUNNER.run(project_name, command)
        except RuntimeError as exc:
            json_response(self, HTTPStatus.CONFLICT, {"error": str(exc)})
            return

        payload = {
            "step": {
                "id": step_id,
                "label": config["label"],
            },
            "project": build_project_summary(project_path),
            "command": result.command,
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
        status = HTTPStatus.OK if result.returncode == 0 else HTTPStatus.BAD_REQUEST
        json_response(self, status, payload)


def main() -> None:
    port = int(os.environ.get("PPT_MASTER_WEB_PORT", "8765"))
    host = os.environ.get("PPT_MASTER_WEB_HOST", "127.0.0.1")

    server = ReusableThreadingHTTPServer((host, port), PPTConsoleHandler)
    print(f"PPT Master web console running at http://{host}:{port}")
    print(f"Projects root: {PROJECTS_DIR}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
