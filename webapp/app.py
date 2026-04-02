from __future__ import annotations

import base64
import hashlib
import json
import mimetypes
import os
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from http import HTTPStatus
from pathlib import Path
from typing import Any, Dict, Generator, Iterable, List, Optional
from urllib.parse import urlencode
from datetime import datetime

import jwt
import requests
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import Base, SessionLocal, engine, get_db
from .models import AuditLog, ImageModelProfile, Project, Session as SessionModel, TextModelProfile, User
from .security import (
    decrypt_secret,
    encrypt_secret,
    json_dumps,
    json_loads,
    mask_api_key,
    new_uuid,
    pkce_challenge,
    random_token,
    session_expiry,
    slugify,
    utcnow,
)
from .settings import get_settings


settings = get_settings()
Base.metadata.create_all(bind=engine)

if str(settings.scripts_dir) not in sys.path:
    sys.path.insert(0, str(settings.scripts_dir))

from config import CANVAS_FORMATS  # type: ignore  # noqa: E402
from project_manager import ProjectManager  # type: ignore  # noqa: E402
from project_utils import get_project_info  # type: ignore  # noqa: E402


app = FastAPI(title="PPT Master Web", version="2.0.0")
app.mount("/static", StaticFiles(directory=str(settings.static_dir)), name="static")


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
IMAGE_BACKENDS = {"openai", "gemini", "siliconflow"}
DESIGN_SPEC_CANDIDATES = (
    "design_spec.md",
    "设计规范与内容大纲.md",
    "design_specification.md",
    "设计规范.md",
)
SVG_GENERATION_MAX_CHARS = 120000
SVG_PAGE_CONTEXT_LIMIT = 30000
IMAGE_ASPECT_RATIOS = ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"]
IMAGE_SIZES = ["512px", "1K", "2K", "4K"]
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

PROJECT_MANAGER = ProjectManager(base_dir=str(settings.storage_root))


@dataclass
class CommandResult:
    command: List[str]
    returncode: int
    stdout: str
    stderr: str


class ProjectCommandRunner:
    def __init__(self) -> None:
        self._locks: Dict[str, Any] = {}
        self._registry_lock = __import__("threading").Lock()

    def _lock_for(self, project_id: str):
        with self._registry_lock:
            if project_id not in self._locks:
                self._locks[project_id] = __import__("threading").Lock()
            return self._locks[project_id]

    def run(
        self,
        project_id: str,
        command: List[str],
        env_overrides: Optional[Dict[str, Optional[str]]] = None,
    ) -> CommandResult:
        lock = self._lock_for(project_id)
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
                cwd=settings.repo_root,
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

    def acquire(self, project_id: str):
        lock = self._lock_for(project_id)
        if not lock.acquire(blocking=False):
            raise RuntimeError("Another task is already running for this project")
        return lock


RUNNER = ProjectCommandRunner()


def audit(db: Session, user_id: str | None, action: str, resource_type: str, resource_id: str = "", details: Dict[str, Any] | None = None) -> None:
    db.add(
        AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details_json=json_dumps(details or {}),
        )
    )
    db.commit()


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_user_storage_root(user: User) -> Path:
    return ensure_dir(settings.storage_root / "users" / user.id / "projects")


def create_project_directory(project: Project) -> Path:
    path = Path(project.storage_path)
    for rel in ("svg_output", "svg_final", "images", "notes", "templates", "sources"):
        (path / rel).mkdir(parents=True, exist_ok=True)
    readme_path = path / "README.md"
    if not readme_path.exists():
        readme_path.write_text(
            (
                f"# {project.name}\n\n"
                f"- Canvas format: {project.canvas_format}\n"
                f"- Project ID: {project.id}\n"
                f"- Created: {utcnow().strftime('%Y-%m-%d')}\n"
            ),
            encoding="utf-8",
        )
    return path


def project_path(project: Project) -> Path:
    path = Path(project.storage_path).resolve()
    ensure_dir(path)
    return path


def resolve_project_by_ref(db: Session, user: User, project_ref: str) -> Project:
    stmt = select(Project).where(Project.owner_user_id == user.id).where(
        (Project.id == project_ref) | (Project.slug == project_ref) | (Project.name == project_ref)
    )
    project = db.execute(stmt).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def public_user_payload(user: User) -> Dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "groups": json_loads(user.groups_json, []),
        "auth_enabled": settings.auth_enabled,
    }


def admin_user_payload(user: User) -> Dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "display_name": user.display_name,
        "auth_provider": user.auth_provider,
        "subject": user.subject,
        "role": user.role,
        "groups": json_loads(user.groups_json, []),
        "last_login_at": user.last_login_at.strftime("%Y-%m-%d %H:%M:%S") if user.last_login_at else "",
        "created_at": user.created_at.strftime("%Y-%m-%d %H:%M:%S"),
        "updated_at": user.updated_at.strftime("%Y-%m-%d %H:%M:%S"),
        "is_active": user.is_active,
    }


def model_profile_public_payload(profile: TextModelProfile | ImageModelProfile) -> Dict[str, Any]:
    api_key = decrypt_secret(profile.api_key_encrypted) if profile.api_key_encrypted else ""
    return {
        "id": profile.id,
        "name": profile.name,
        "backend": profile.backend,
        "model": profile.model,
        "base_url": profile.base_url,
        "api_key_masked": mask_api_key(api_key),
        "configured": bool(profile.backend and api_key),
        "source": "db",
        "is_default": profile.is_default,
    }


def resolve_default_profile(profiles: List[TextModelProfile | ImageModelProfile]) -> TextModelProfile | ImageModelProfile | None:
    for profile in profiles:
        if profile.is_default:
            return profile
    return profiles[0] if profiles else None


def serialize_model_config(profiles: List[TextModelProfile | ImageModelProfile]) -> Dict[str, Any]:
    active = resolve_default_profile(profiles)
    public_profiles = [model_profile_public_payload(profile) for profile in profiles]
    active_profile = next((item for item in public_profiles if active and item["id"] == active.id), None)
    return {
        "profiles": public_profiles,
        "selected_profile_id": active.id if active else None,
        "active_profile": active_profile,
        "configured": any(profile["configured"] for profile in public_profiles),
    }


def get_text_model_config(db: Session, user: User) -> Dict[str, Any]:
    profiles = list(db.execute(select(TextModelProfile).where(TextModelProfile.owner_user_id == user.id).order_by(TextModelProfile.created_at)).scalars())
    return serialize_model_config(profiles)


def get_image_model_config(db: Session, user: User) -> Dict[str, Any]:
    profiles = list(db.execute(select(ImageModelProfile).where(ImageModelProfile.owner_user_id == user.id).order_by(ImageModelProfile.created_at)).scalars())
    payload = serialize_model_config(profiles)
    payload["aspect_ratios"] = IMAGE_ASPECT_RATIOS
    payload["sizes"] = IMAGE_SIZES
    return payload


def resolve_text_profile(db: Session, user: User, profile_id: Optional[str] = None) -> Optional[TextModelProfile]:
    stmt = select(TextModelProfile).where(TextModelProfile.owner_user_id == user.id)
    if profile_id:
        stmt = stmt.where(TextModelProfile.id == profile_id)
    profiles = list(db.execute(stmt.order_by(TextModelProfile.created_at)).scalars())
    if profile_id:
        return profiles[0] if profiles else None
    return resolve_default_profile(profiles)


def resolve_image_profile(db: Session, user: User, profile_id: Optional[str] = None) -> Optional[ImageModelProfile]:
    stmt = select(ImageModelProfile).where(ImageModelProfile.owner_user_id == user.id)
    if profile_id:
        stmt = stmt.where(ImageModelProfile.id == profile_id)
    profiles = list(db.execute(stmt.order_by(ImageModelProfile.created_at)).scalars())
    if profile_id:
        return profiles[0] if profiles else None
    return resolve_default_profile(profiles)


def normalize_project_name(name: str) -> str:
    return name.strip().strip("/").strip()


def sanitize_uploaded_name(name: str, default_stem: str, suffix: str) -> str:
    raw = (name or "").strip()
    if not raw:
        return f"{default_stem}{suffix}"
    candidate = Path(raw).name.strip().replace("\x00", "")
    safe = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in candidate).strip("._")
    safe = safe or default_stem
    if Path(safe).suffix.lower() != suffix:
        return f"{Path(safe).stem or default_stem}{suffix}"
    return safe


def find_design_spec_file(project_path_value: Path) -> Optional[Path]:
    for candidate in DESIGN_SPEC_CANDIDATES:
        path = project_path_value / candidate
        if path.exists() and path.is_file():
            return path
    return None


def parse_design_spec_for_images(design_spec: str) -> List[Dict[str, Any]]:
    import re

    images = []
    table_pattern = r"^\|\s*([^|\s]+\.(?:png|jpe?g|webp|svg))\s*\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|"
    for match in re.finditer(table_pattern, design_spec, re.MULTILINE | re.IGNORECASE):
        filename = match.group(1).strip()
        dimensions = match.group(2).strip()
        purpose = match.group(3).strip()
        usage_pages = match.group(4).strip()
        status_text = match.group(5).strip()
        description = match.group(6).strip()

        width, height = 1024, 1024
        dim_match = re.search(r"(\d+)\s*[×x]\s*(\d+)", dimensions)
        if dim_match:
            width, height = int(dim_match.group(1)), int(dim_match.group(2))

        pages_str = re.sub(r"\*\*", "", usage_pages)
        page_numbers = re.findall(r"P?(\d+)", pages_str)
        image_status = "pending"
        if "已生成" in status_text or "generated" in status_text.lower():
            image_status = "generated"
        elif "使用中" in status_text or "using" in status_text.lower():
            image_status = "using"

        images.append(
            {
                "filename": filename,
                "width": width,
                "height": height,
                "aspect_ratio": f"{width}:{height}" if width != height else "1:1",
                "purpose": purpose,
                "usage_pages": pages_str,
                "page_numbers": [int(p) for p in page_numbers] if page_numbers else [],
                "status": image_status,
                "description": description,
            }
        )
    return images


def parse_datetime_filter(value: str | None) -> datetime | None:
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None
    try:
        if "T" not in raw and len(raw) == 10:
            raw = f"{raw}T00:00:00"
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def build_audit_query(
    user_id: str | None,
    action: str | None,
    resource_type: str | None,
    start: str | None,
    end: str | None,
):
    stmt = select(AuditLog)
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"%{action.strip()}%"))
    if resource_type:
        stmt = stmt.where(AuditLog.resource_type.ilike(f"%{resource_type.strip()}%"))
    start_dt = parse_datetime_filter(start)
    end_dt = parse_datetime_filter(end)
    if start_dt:
        stmt = stmt.where(AuditLog.created_at >= start_dt)
    if end_dt:
        stmt = stmt.where(AuditLog.created_at <= end_dt)
    return stmt


def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip", "").strip()
    if real_ip:
        return real_ip
    if request.client:
        return request.client.host
    return ""


def format_dt(value: datetime | None) -> str:
    if value is None:
        return ""
    return value.strftime("%Y-%m-%d %H:%M:%S")


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def build_activity_payload(request: Request, now: datetime | None = None) -> Dict[str, Any]:
    now = now or utcnow()
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent", "")
    payload = {
        "login_at": now.isoformat(sep=" ", timespec="seconds"),
        "last_seen_at": now.isoformat(sep=" ", timespec="seconds"),
    }
    if ip:
        payload["login_ip"] = ip
        payload["last_seen_ip"] = ip
    if ua:
        payload["login_ua"] = ua[:300]
        payload["last_seen_ua"] = ua[:300]
    return payload


def update_session_activity(db: Session, session: SessionModel, request: Request, now: datetime | None = None) -> None:
    if session.user_id is None:
        return
    payload = json_loads(session.data_json, {})
    if not isinstance(payload, dict):
        payload = {}
    now = now or utcnow()
    last_seen_raw = payload.get("last_seen_at", "")
    last_seen_at = parse_dt(last_seen_raw)
    if last_seen_at and (now - last_seen_at).total_seconds() < 60:
        return
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent", "")
    payload["last_seen_at"] = now.isoformat(sep=" ", timespec="seconds")
    if ip:
        payload["last_seen_ip"] = ip
    if ua:
        payload["last_seen_ua"] = ua[:300]
    session.data_json = json_dumps(payload)
    db.add(session)
    db.commit()


def summarize_session_activity(sessions: List[SessionModel]) -> Dict[str, str]:
    best_seen: tuple[datetime, Dict[str, Any]] | None = None
    best_login: tuple[datetime, Dict[str, Any]] | None = None
    for session in sessions:
        payload = json_loads(session.data_json, {})
        if not isinstance(payload, dict):
            continue
        seen_raw = payload.get("last_seen_at") or payload.get("login_at")
        seen_dt = parse_dt(seen_raw)
        if seen_dt and (best_seen is None or seen_dt > best_seen[0]):
            best_seen = (seen_dt, payload)
        login_raw = payload.get("login_at")
        login_dt = parse_dt(login_raw)
        if login_dt and (best_login is None or login_dt > best_login[0]):
            best_login = (login_dt, payload)

    last_seen_payload = best_seen[1] if best_seen else {}
    last_login_payload = best_login[1] if best_login else {}
    return {
        "last_active_at": format_dt(best_seen[0]) if best_seen else "",
        "last_active_ip": last_seen_payload.get("last_seen_ip", last_seen_payload.get("login_ip", "")) or "",
        "last_active_ua": last_seen_payload.get("last_seen_ua", last_seen_payload.get("login_ua", "")) or "",
        "last_login_ip": last_login_payload.get("login_ip", "") or "",
        "last_login_ua": last_login_payload.get("login_ua", "") or "",
    }


def parse_design_spec_for_pages(design_spec: str) -> List[Dict[str, Any]]:
    import re

    pages = []
    page_patterns = [
        r"(?m)^#+\s*(\d+)[.:\s]+(.+)$",
        r"(?m)^#+\s*Page\s*(\d+)[.:\s]*(.*)$",
        r"(?m)^#+\s*Slide\s*(\d+)[.:\s]*(.*)$",
        r"(?m)^\s*(\d+)[.:\s]+(.+)$",
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
                pages.append({"number": page_num, "title": page_title, "type": page_type})
            break
    return pages


def estimate_page_count(design_spec: str, sources_content: str) -> int:
    import re

    match = re.search(r"\b(?:min|minimum)\s*[:：]?\s*(\d+)", design_spec, re.IGNORECASE)
    if match:
        return int(match.group(1))
    match = re.search(r"\*\*Minimum\*\*\s*[:：]?\s*(\d+)", design_spec, re.IGNORECASE)
    if match:
        return int(match.group(1))
    match = re.search(r"page\s*count[^\d]*(\d+)[^\d]*(\d+)?", design_spec, re.IGNORECASE)
    if match:
        return int(match.group(1))
    content_length = len(sources_content)
    if content_length < 5000:
        return 6
    if content_length < 15000:
        return 10
    if content_length < 30000:
        return 15
    return 20


def load_project_sources(project_path_value: Path, max_files: int = 5, max_chars: int = 50000) -> str:
    sources_dir = project_path_value / "sources"
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
        clipped = raw[: max_chars - total_chars] if total_chars + len(raw) > max_chars else raw
        if clipped.strip():
            content_parts.append(f"---\n# Source: {path.name}\n\n{clipped}")
            total_chars += len(clipped)
            if total_chars >= max_chars:
                break
    return "\n".join(content_parts)


def build_project_summary(project: Project) -> Dict[str, Any]:
    path = project_path(project)
    info = get_project_info(str(path))
    svg_final_files = sorted((path / "svg_final").glob("*.svg"))
    svg_output_files = sorted((path / "svg_output").glob("*.svg"))
    pptx_files = sorted(path.glob("*.pptx"))
    preview_files = svg_final_files or svg_output_files
    preview_root = "svg_final" if svg_final_files else "svg_output"
    notes_dir = path / "notes"
    total_notes_path = notes_dir / "total.md"
    split_note_files = sorted(
        p for p in notes_dir.glob("*.md") if p.is_file() and p.name != "total.md"
    ) if notes_dir.exists() else []
    design_spec_path = find_design_spec_file(path)
    markdown_sources = sorted(p for p in (path / "sources").glob("*.md") if p.is_file()) if (path / "sources").exists() else []

    image_resources = []
    if design_spec_path:
        try:
            image_resources = parse_design_spec_for_images(design_spec_path.read_text(encoding="utf-8", errors="replace"))
        except Exception:
            image_resources = []

    images_dir = path / "images"
    existing_images = set()
    if images_dir.exists():
        for ext in ("*.png", "*.jpg", "*.jpeg", "*.webp"):
            for img_file in images_dir.glob(ext):
                existing_images.add(img_file.name)
    for img in image_resources:
        if img["filename"] in existing_images:
            img["status"] = "generated"

    canvas_info = CANVAS_FORMATS.get(project.canvas_format, {})
    return {
        "id": project.id,
        "slug": project.slug,
        "name": project.name,
        "display_name": project.name,
        "path": str(path),
        "canvas_format": project.canvas_format,
        "canvas_label": canvas_info.get("name", info.get("format_name", "Unknown")),
        "created_at": project.created_at.strftime("%Y-%m-%d"),
        "updated_at": project.updated_at.strftime("%Y-%m-%d %H:%M:%S"),
        "svg_output_count": len(svg_output_files),
        "svg_final_count": len(svg_final_files),
        "svg_final_files": [f.name for f in svg_final_files],
        "split_notes_count": len(split_note_files),
        "source_count": info.get("source_count", 0),
        "has_spec": design_spec_path is not None,
        "has_total_notes": total_notes_path.exists(),
        "total_notes": {
            "name": total_notes_path.name,
            "url": f"/files/projects/{project.id}/notes/{total_notes_path.name}",
        } if total_notes_path.exists() else None,
        "design_spec": {
            "name": design_spec_path.name,
            "url": f"/files/projects/{project.id}/{design_spec_path.name}",
        } if design_spec_path else None,
        "pptx_files": [{"name": file.name, "url": f"/files/projects/{project.id}/{file.name}"} for file in pptx_files],
        "preview_slides": [{"name": file.name, "url": f"/files/projects/{project.id}/{preview_root}/{file.name}"} for file in preview_files[:12]],
        "all_slides": [{"name": file.name, "url": f"/files/projects/{project.id}/{preview_root}/{file.name}"} for file in preview_files],
        "source_markdown": [{"name": file.name, "url": f"/files/projects/{project.id}/sources/{file.name}"} for file in markdown_sources],
        "image_resources": image_resources,
        "image_resources_total": len(image_resources),
        "image_resources_pending": sum(1 for img in image_resources if img["status"] == "pending"),
        "image_resources_generated": sum(1 for img in image_resources if img["status"] == "generated"),
    }


def get_step_guard(project: Project, step_id: str) -> Optional[str]:
    summary = build_project_summary(project)
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


def list_templates() -> Dict[str, Any]:
    index_path = settings.templates_dir / "layouts_index.json"
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
        template_path = settings.templates_dir / template_id
        preview_path = template_path / "preview.png"
        if not template_path.exists() or not template_path.is_dir():
            continue
        svg_files = list(template_path.glob("*.svg"))
        entry = {
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
        if preview_path.exists():
            entry["preview_url"] = f"/files/templates/{template_id}/preview.png"
        templates.append(entry)
    return {
        "templates": templates,
        "categories": categories,
        "quick_lookup": index_data.get("quickLookup", {}),
        "meta": index_data.get("meta", {}),
    }


def apply_template_to_project(project_path_value: Path, template_id: str) -> Dict[str, Any]:
    template_dir = settings.templates_dir / template_id
    if not template_dir.exists() or not template_dir.is_dir():
        raise ValueError(f"Template not found: {template_id}")
    templates_dest = project_path_value / "templates"
    images_dest = project_path_value / "images"
    templates_dest.mkdir(parents=True, exist_ok=True)
    images_dest.mkdir(parents=True, exist_ok=True)
    copied_files = {"templates": [], "images": [], "design_spec": None}
    for svg_file in template_dir.glob("*.svg"):
        dest_file = templates_dest / svg_file.name
        shutil.copy2(svg_file, dest_file)
        copied_files["templates"].append(svg_file.name)
    design_spec_src = template_dir / "design_spec.md"
    if design_spec_src.exists():
        dest_file = project_path_value / "design_spec.md"
        shutil.copy2(design_spec_src, dest_file)
        copied_files["design_spec"] = "design_spec.md"
    for ext in ("*.png", "*.jpg", "*.jpeg"):
        for img_file in template_dir.glob(ext):
            dest_file = images_dest / img_file.name
            shutil.copy2(img_file, dest_file)
            copied_files["images"].append(img_file.name)
    return copied_files


def build_text_env_overrides(profile: TextModelProfile) -> Dict[str, Optional[str]]:
    api_key = decrypt_secret(profile.api_key_encrypted) if profile.api_key_encrypted else ""
    return {
        "TEXT_BACKEND": profile.backend or None,
        "TEXT_API_KEY": api_key or None,
        "TEXT_BASE_URL": profile.base_url or None,
        "TEXT_MODEL": profile.model or None,
        "OPENAI_API_KEY": None,
        "OPENAI_BASE_URL": None,
        "GEMINI_API_KEY": None,
        "GEMINI_BASE_URL": None,
    }


def build_image_profile_dict(profile: ImageModelProfile) -> Dict[str, str]:
    return {
        "backend": profile.backend,
        "api_key": decrypt_secret(profile.api_key_encrypted) if profile.api_key_encrypted else "",
        "base_url": profile.base_url,
        "model": profile.model,
    }


def validate_text_backend(value: str) -> str:
    backend = value.strip().lower()
    if backend not in TEXT_BACKENDS:
        raise ValueError("TEXT_BACKEND must be openai or gemini")
    return backend


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
    candidate_bases: List[str] = []
    normalized = (base_url or "https://api.openai.com/v1").strip().rstrip("/")
    if normalized:
        candidate_bases.append(normalized)
        if not normalized.endswith("/v1"):
            candidate_bases.append(f"{normalized}/v1")
    last_error = "Unable to fetch models"
    for candidate in candidate_bases:
        response = requests.get(f"{candidate}/models", headers={"Authorization": f"Bearer {api_key}"}, timeout=20)
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
    return extract_model_ids(list(client.models.list()))


def test_text_model_profile(profile: Dict[str, Any]) -> Dict[str, Any]:
    from notes_gen import DEFAULT_GEMINI_MODEL, DEFAULT_OPENAI_MODEL, generate_text_gemini, generate_text_openai

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
    prompt = "Return a short plain-text confirmation that the PPT Master model test succeeded. Do not use markdown. Keep it under 12 words."
    started_at = time.perf_counter()
    output = generate_text_openai(prompt, api_key, base_url, model) if backend == "openai" else generate_text_gemini(prompt, api_key, base_url, model)
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


def analyze_content_for_strategist(project_path_value: Path, profile: Dict[str, Any]) -> Dict[str, Any]:
    from notes_gen import generate_text_gemini, generate_text_openai

    sources_content = load_project_sources(project_path_value)
    if not sources_content:
        raise ValueError("No source content found in sources/ directory")
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
    model = str(profile.get("model", "")).strip() or ("gpt-4o-mini" if backend == "openai" else "gemini-2.5-flash")
    if not api_key:
        raise ValueError("No API key configured for analysis")
    raw_response = generate_text_openai(prompt, api_key, base_url, model) if backend == "openai" else generate_text_gemini(prompt, api_key, base_url, model)
    cleaned = raw_response.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned.rsplit("```", 1)[0]
    try:
        result = json.loads(cleaned.strip())
    except json.JSONDecodeError as exc:
        raise ValueError(f"Failed to parse LLM response as JSON: {exc}") from exc
    return {
        "canvas_format": result.get("canvas_format", {}),
        "page_count": result.get("page_count", {}),
        "target_audience": result.get("target_audience", {}),
        "style_objective": result.get("style_objective", {}),
        "color_scheme": result.get("color_scheme", {}),
        "icon_approach": result.get("icon_approach", {}),
        "typography": result.get("typography", {}),
        "image_approach": result.get("image_approach", {}),
        "source_files_count": len(list((project_path_value / "sources").glob("*.md"))) if (project_path_value / "sources").exists() else 0,
        "model_used": model,
    }


def build_svg_generation_prompt(
    page_number: int,
    total_pages: int,
    page_title: str,
    page_type: str,
    design_spec: str,
    sources_content: str,
    existing_pages: List[str],
) -> str:
    viewbox = CANVAS_FORMATS.get("ppt169", {}).get("viewbox", "0 0 1280 720")
    existing_context = f"\nAlready generated pages: {', '.join(existing_pages)}" if existing_pages else ""
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
- For rounded rects: use <rect rx="...">
- For icons: use <use data-icon="icon-name" x="..." y="..." width="..." height="..." fill="..."/>
- For images: use <image href="../images/xxx.png" ... preserveAspectRatio="xMidYMid slice"/>
- Font families: Microsoft YaHei, SimHei, SimSun, Arial, Georgia, Calibri
- Ensure text elements have proper fill and font-size

Generate the SVG now:"""


def generate_single_svg(prompt: str, backend: str, api_key: str, base_url: Optional[str], model: str) -> str:
    from notes_gen import generate_text_gemini, generate_text_openai

    raw_response = generate_text_openai(prompt, api_key, base_url, model) if backend == "openai" else generate_text_gemini(prompt, api_key, base_url, model)
    svg_content = raw_response.strip()
    if svg_content.startswith("```"):
        lines = svg_content.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        svg_content = "\n".join(lines).strip()
    if not svg_content.startswith("<svg") or not svg_content.endswith("</svg>"):
        raise ValueError("Response is not a valid SVG")
    return svg_content


def generate_image_openai(api_key: str, base_url: Optional[str], model: str, prompt: str, output_dir: str, filename: Optional[str], aspect_ratio: str, image_size: str) -> Dict[str, Any]:
    if not model:
        model = "dall-e-3"
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    size_map = {"1:1": "1024x1024", "9:16": "1024x1792", "16:9": "1792x1024"}
    size = size_map.get(aspect_ratio, "1024x1024")
    api_base = (base_url or "https://api.openai.com/v1").rstrip("/")
    url = f"{api_base}/images/generations"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {"model": model, "prompt": prompt, "n": 1, "size": size, "response_format": "b64_json"}
    response = requests.post(url, headers=headers, json=payload, timeout=120)
    if not response.ok:
        raise ValueError(f"OpenAI API error: {response.status_code} - {response.text}")
    data = response.json()
    image_data = data["data"][0].get("b64_json") if data.get("data") else None
    if not image_data:
        raise ValueError("No image data in response")
    if not filename:
        hash_input = f"{prompt}{time.time()}".encode()
        filename = f"image_{hashlib.md5(hash_input).hexdigest()[:8]}"
    output_file = output_path / f"{filename}.png"
    output_file.write_bytes(base64.b64decode(image_data))
    return {"filename": output_file.name, "path": str(output_file), "mime_type": "image/png", "prompt": prompt, "model": model, "backend": "openai"}


def generate_image_gemini(api_key: str, base_url: Optional[str], model: str, prompt: str, output_dir: str, filename: Optional[str], aspect_ratio: str, image_size: str) -> Dict[str, Any]:
    from google import genai
    from google.genai import types

    if not model:
        model = "gemini-2.0-flash-exp"
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    client_kwargs = {"api_key": api_key}
    if base_url:
        client_kwargs["http_options"] = {"base_url": base_url}
    client = genai.Client(**client_kwargs)
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
            response_modalities_config=types.ResponseModalitiesConfig(
                image_config=types.ImageGenerationConfig(aspect_ratio=aspect_ratio, safety_filter_level="block_few")
            ),
        ),
    )
    image_data = None
    mime_type = "image/png"
    for part in response.candidates[0].content.parts:
        if part.inline_data is not None:
            image_data = part.inline_data.data
            mime_type = part.inline_data.mime_type or "image/png"
            break
    if not image_data:
        raise ValueError("No image generated in response")
    if not filename:
        hash_input = f"{prompt}{time.time()}".encode()
        filename = f"image_{hashlib.md5(hash_input).hexdigest()[:8]}"
    ext = "png" if "png" in mime_type else "jpg"
    output_file = output_path / f"{filename}.{ext}"
    output_file.write_bytes(image_data if isinstance(image_data, bytes) else base64.b64decode(image_data))
    return {"filename": output_file.name, "path": str(output_file), "mime_type": mime_type, "prompt": prompt, "model": model, "backend": "gemini"}


def generate_image(profile: Dict[str, Any], prompt: str, output_dir: str, filename: Optional[str] = None, aspect_ratio: str = "1:1", image_size: str = "1K") -> Dict[str, Any]:
    backend = str(profile.get("backend", "gemini")).lower()
    api_key = str(profile.get("api_key", "")).strip()
    base_url = str(profile.get("base_url", "")).strip() or None
    model = str(profile.get("model", "")).strip()
    if not api_key:
        raise ValueError("No API key configured for image generation")
    if backend == "gemini":
        return generate_image_gemini(api_key, base_url, model, prompt, output_dir, filename, aspect_ratio, image_size)
    return generate_image_openai(api_key, base_url, model, prompt, output_dir, filename, aspect_ratio, image_size)


def _get_page_title(svg_file: Path) -> str:
    import re

    try:
        content = svg_file.read_text(encoding="utf-8", errors="replace")
        title_match = re.search(r"<title>([^<]+)</title>", content)
        if title_match:
            return title_match.group(1).strip()
        aria_match = re.search(r"aria-label=[\"']([^\"']+)[\"']", content)
        if aria_match:
            return aria_match.group(1).strip()
        text_match = re.search(r"<text[^>]*>([^<]{3,50})</text>", content)
        if text_match:
            return text_match.group(1).strip()
    except Exception:
        pass
    return "Untitled"


def get_current_session(db: Session, request: Request) -> SessionModel | None:
    session_id = request.cookies.get(settings.session_cookie_name)
    if not session_id:
        return None
    session = db.get(SessionModel, session_id)
    if session is None:
        return None
    if session.expires_at < utcnow():
        db.delete(session)
        db.commit()
        return None
    return session


def ensure_session(db: Session, request: Request, response: Response) -> SessionModel:
    session = get_current_session(db, request)
    if session:
        return session
    session = SessionModel(id=random_token(24), expires_at=session_expiry(settings.session_ttl_seconds), data_json="{}")
    db.add(session)
    db.commit()
    response.set_cookie(
        settings.session_cookie_name,
        session.id,
        httponly=True,
        secure=settings.session_secure_cookie,
        samesite="lax",
        max_age=settings.session_ttl_seconds,
        path="/",
    )
    return session


def get_current_user_optional(request: Request, db: Session = Depends(get_db)) -> User | None:
    session = get_current_session(db, request)
    if session is None or session.user_id is None:
        return None
    user = db.get(User, session.user_id)
    return user if user and user.is_active else None


def require_user(request: Request, db: Session = Depends(get_db)) -> User:
    user = get_current_user_optional(request, db)
    if user is not None:
        return user
    if not settings.auth_enabled:
        return get_or_create_mock_user(db)
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")


def require_admin(user: User = Depends(require_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def get_or_create_mock_user(db: Session) -> User:
    stmt = select(User).where(User.subject == "local-mock-user")
    user = db.execute(stmt).scalar_one_or_none()
    if user:
        return user
    user = User(
        id=new_uuid(),
        auth_provider="mock",
        subject="local-mock-user",
        email=settings.mock_user_email,
        username=settings.mock_user_email.split("@")[0],
        display_name=settings.mock_user_name,
        role="admin",
        groups_json=json_dumps(["local-admin"]),
        last_login_at=utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_auth_config_errors() -> List[str]:
    if not settings.auth_enabled:
        return []

    errors: List[str] = []
    if not settings.auth_issuer_url:
        errors.append("AUTHENTIK_ISSUER_URL is not configured")
    if not settings.auth_client_id:
        errors.append("AUTHENTIK_CLIENT_ID is not configured")
    if not settings.auth_client_secret:
        errors.append("AUTHENTIK_CLIENT_SECRET is not configured")
    if not settings.session_secret or settings.session_secret == "dev-session-secret-change-me":
        errors.append("SESSION_SECRET must be set to a non-default value when AUTH_ENABLED=true")
    if not settings.app_encryption_key or settings.app_encryption_key == "dev-encryption-key-change-me":
        errors.append("APP_ENCRYPTION_KEY must be set to a non-default value when AUTH_ENABLED=true")
    if not settings.public_base_url:
        errors.append("PPT_MASTER_PUBLIC_BASE_URL is recommended for stable Authentik callback URLs")
    return errors


def auth_status_payload(user: User | None) -> Dict[str, Any]:
    config_errors = get_auth_config_errors()
    sync_mode = settings.auth_sync_mode.strip().lower() if settings.auth_sync_mode else "if_present"
    if sync_mode not in {"strict", "if_present", "disabled"}:
        sync_mode = "if_present"
    return {
        "auth_enabled": settings.auth_enabled,
        "authenticated": user is not None,
        "auth_ready": not config_errors,
        "config_errors": config_errors,
        "login_url": "/login",
        "start_login_url": "/auth/login",
        "logout_url": "/auth/logout",
        "callback_url": settings.callback_url,
        "issuer_url": settings.auth_issuer_url.rstrip("/"),
        "sync_mode": sync_mode,
        "admin_groups": settings.admin_groups,
        "user": public_user_payload(user) if user is not None else None,
    }


def build_oidc_metadata() -> Dict[str, Any]:
    config_errors = get_auth_config_errors()
    if config_errors:
        raise HTTPException(status_code=503, detail="; ".join(config_errors))
    issuer = settings.auth_issuer_url.rstrip("/")
    response = requests.get(f"{issuer}/.well-known/openid-configuration", timeout=20)
    response.raise_for_status()
    return response.json()


def exchange_auth_code(code: str, verifier: str) -> Dict[str, Any]:
    metadata = build_oidc_metadata()
    token_response = requests.post(
        metadata["token_endpoint"],
        data={
            "grant_type": "authorization_code",
            "client_id": settings.auth_client_id,
            "client_secret": settings.auth_client_secret,
            "code": code,
            "redirect_uri": settings.callback_url,
            "code_verifier": verifier,
        },
        timeout=20,
    )
    token_response.raise_for_status()
    return token_response.json()


def validate_id_token(id_token: str, nonce: str) -> Dict[str, Any]:
    metadata = build_oidc_metadata()
    jwks = requests.get(metadata["jwks_uri"], timeout=20).json()
    header = jwt.get_unverified_header(id_token)
    jwk = next((key for key in jwks["keys"] if key["kid"] == header.get("kid")), None)
    if jwk is None:
        raise HTTPException(status_code=401, detail="Unable to validate identity token")
    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))
    claims = jwt.decode(
        id_token,
        public_key,
        algorithms=[header["alg"]],
        audience=settings.auth_client_id,
        issuer=settings.auth_issuer_url.rstrip("/"),
        options={"require": ["exp", "iat", "iss", "aud"]},
    )
    if claims.get("nonce") != nonce:
        raise HTTPException(status_code=401, detail="Invalid identity token nonce")
    return claims


def fetch_userinfo(access_token: str) -> Dict[str, Any]:
    metadata = build_oidc_metadata()
    response = requests.get(metadata["userinfo_endpoint"], headers={"Authorization": f"Bearer {access_token}"}, timeout=20)
    response.raise_for_status()
    return response.json()


def upsert_user_from_auth(db: Session, claims: Dict[str, Any], userinfo: Dict[str, Any]) -> User:
    subject = str(userinfo.get("sub") or claims.get("sub") or "").strip()
    if not subject:
        raise HTTPException(status_code=401, detail="Missing OIDC subject")
    user = db.execute(select(User).where(User.subject == subject)).scalar_one_or_none()
    email = str(userinfo.get("email") or claims.get("email") or f"{subject}@unknown.local").strip()
    username = str(userinfo.get("preferred_username") or claims.get("preferred_username") or email.split("@")[0]).strip()
    display_name = str(userinfo.get("name") or claims.get("name") or username).strip()
    sync_mode = settings.auth_sync_mode.strip().lower() if settings.auth_sync_mode else "if_present"
    if sync_mode not in {"strict", "if_present", "disabled"}:
        sync_mode = "if_present"

    groups: List[str] | None
    if "groups" in userinfo:
        groups = userinfo.get("groups") or []
    elif "groups" in claims:
        groups = claims.get("groups") or []
    else:
        groups = None
    role = "admin" if groups and any(group in settings.admin_groups for group in groups) else "user"
    if user is None:
        if groups is None:
            groups = []
            role = "user"
        user = User(
            id=new_uuid(),
            auth_provider="authentik",
            subject=subject,
            email=email,
            username=username,
            display_name=display_name,
            role=role,
            groups_json=json_dumps(groups or []),
            last_login_at=utcnow(),
        )
        db.add(user)
    else:
        if not user.is_active:
            audit(db, user.id, "login_denied", "session", "", {"reason": "user disabled"})
            raise HTTPException(status_code=403, detail="User is disabled")
        user.email = email
        user.username = username
        user.display_name = display_name
        if sync_mode == "disabled":
            pass
        elif sync_mode == "strict":
            user.groups_json = json_dumps(groups or [])
            user.role = role
        elif sync_mode == "if_present":
            if groups is not None:
                user.groups_json = json_dumps(groups)
                user.role = role
        user.last_login_at = utcnow()
    db.commit()
    db.refresh(user)
    return user


@app.get("/healthz")
def healthz() -> Dict[str, str]:
    return {"status": "ok"}


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/static") or request.url.path in {"/healthz"}:
        return response
    try:
        db = SessionLocal()
        session = get_current_session(db, request)
        if session is not None and session.user_id:
            update_session_activity(db, session, request)
    except Exception:
        pass
    finally:
        try:
            db.close()
        except Exception:
            pass
    return response


@app.get("/", response_class=HTMLResponse)
def index(request: Request, db: Session = Depends(get_db)):
    user = get_current_user_optional(request, db)
    if settings.auth_enabled and user is None:
        return RedirectResponse(url="/login", status_code=302)
    return FileResponse(settings.static_dir / "index.html")


@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request, db: Session = Depends(get_db)):
    user = get_current_user_optional(request, db)
    if user is not None:
        return RedirectResponse(url="/", status_code=302)

    auth_status = auth_status_payload(None)
    auth_hint = "已启用 Authentik 单点登录" if settings.auth_enabled else "当前为本地开发模式，点击下方按钮进入"
    button_label = "使用 Authentik 登录" if settings.auth_enabled else "进入本地调试会话"
    login_note = "登录后项目、模型配置和文件访问都会按用户隔离。" if settings.auth_enabled else "当前会使用本地 mock 管理员身份进入控制台。"
    config_block = ""
    if auth_status["auth_enabled"]:
        if auth_status["auth_ready"]:
            config_block = f"""
        <div class="detail-block" style="padding:16px; margin-top: 12px;">
          <p class="detail-title">AuthentiK / OIDC</p>
          <p class="helper">Issuer：{auth_status["issuer_url"] or "-"}</p>
          <p class="helper">Callback：{auth_status["callback_url"]}</p>
          <p class="helper">管理员组：{", ".join(auth_status["admin_groups"]) if auth_status["admin_groups"] else "-"}</p>
          <p class="helper">同步策略：{auth_status["sync_mode"]}</p>
        </div>
"""
        else:
            error_items = "".join(f"<li>{item}</li>" for item in auth_status["config_errors"])
            config_block = f"""
        <div class="status-card status-error" style="margin-top: 12px;">
          <strong>Authentik 配置未完成</strong>
          <ul class="context-list">{error_items}</ul>
          <p class="helper">请先修正环境变量，再从当前页面重新发起登录。</p>
        </div>
"""
    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PPT Master 登录</title>
  <link rel="stylesheet" href="/static/app.css">
</head>
<body>
  <div class="ambient ambient-a"></div>
  <div class="ambient ambient-b"></div>
  <main class="shell" style="max-width: 720px; padding-top: 72px;">
    <section class="panel" style="padding: 32px;">
      <p class="section-kicker">Login</p>
      <h1 style="margin-top: 0;">PPT Master Web Console</h1>
      <p class="helper" style="font-size: 1rem; margin-bottom: 20px;">{auth_hint}</p>
      <div class="stack">
        <a class="button button-secondary" href="/auth/login" style="text-decoration:none; display:inline-flex; justify-content:center;">{button_label}</a>
        <p class="helper">{login_note}</p>
{config_block}
      </div>
    </section>
  </main>
</body>
</html>"""
    return HTMLResponse(html)


@app.get("/auth/login")
def auth_login(request: Request, response: Response, db: Session = Depends(get_db)):
    if not settings.auth_enabled:
        user = get_or_create_mock_user(db)
        session = ensure_session(db, request, response)
        session.user_id = user.id
        session.expires_at = session_expiry(settings.session_ttl_seconds)
        session.data_json = json_dumps(build_activity_payload(request))
        db.commit()
        audit(db, user.id, "login_mock", "session", session.id)
        redirect = RedirectResponse("/", status_code=302)
        redirect.set_cookie(
            settings.session_cookie_name,
            session.id,
            httponly=True,
            secure=settings.session_secure_cookie,
            samesite="lax",
            max_age=settings.session_ttl_seconds,
            path="/",
        )
        return redirect

    config_errors = get_auth_config_errors()
    if config_errors:
        error_html = "".join(f"<li>{item}</li>" for item in config_errors)
        return HTMLResponse(
            f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PPT Master 登录配置错误</title>
  <link rel="stylesheet" href="/static/app.css">
</head>
<body>
  <div class="ambient ambient-a"></div>
  <div class="ambient ambient-b"></div>
  <main class="shell" style="max-width: 760px; padding-top: 72px;">
    <section class="panel" style="padding: 32px;">
      <p class="section-kicker">Auth Error</p>
      <h1 style="margin-top: 0;">Authentik 配置未完成</h1>
      <div class="status-card status-error" style="margin-top: 16px;">
        <strong>当前还不能发起统一认证</strong>
        <ul class="context-list">{error_html}</ul>
      </div>
      <div class="action-row" style="margin-top: 16px;">
        <a class="button button-secondary" href="/login" style="text-decoration:none;">返回登录页</a>
      </div>
    </section>
  </main>
</body>
</html>""",
            status_code=503,
        )

    session = ensure_session(db, request, response)
    state = random_token(24)
    nonce = random_token(24)
    verifier = random_token(48)
    metadata = build_oidc_metadata()
    payload = {"state": state, "nonce": nonce, "code_verifier": verifier}
    session.data_json = json_dumps(payload)
    session.expires_at = session_expiry(settings.session_ttl_seconds)
    db.commit()
    query = urlencode(
        {
            "client_id": settings.auth_client_id,
            "response_type": "code",
            "redirect_uri": settings.callback_url,
            "scope": " ".join(settings.auth_scopes),
            "state": state,
            "nonce": nonce,
            "code_challenge": pkce_challenge(verifier),
            "code_challenge_method": "S256",
        }
    )
    redirect = RedirectResponse(url=f"{metadata['authorization_endpoint']}?{query}", status_code=302)
    for name, value in response.headers.items():
        if name.lower() == "set-cookie":
            redirect.headers.append(name, value)
    return redirect


@app.get("/auth/callback")
def auth_callback(request: Request, code: str, state: str, db: Session = Depends(get_db)):
    session = get_current_session(db, request)
    if session is None:
        raise HTTPException(status_code=401, detail="Missing session")
    payload = json_loads(session.data_json, {})
    if payload.get("state") != state:
        raise HTTPException(status_code=401, detail="Invalid OAuth state")
    token_response = exchange_auth_code(code, payload.get("code_verifier", ""))
    claims = validate_id_token(token_response["id_token"], payload.get("nonce", ""))
    userinfo = fetch_userinfo(token_response["access_token"])
    user = upsert_user_from_auth(db, claims, userinfo)
    session.user_id = user.id
    session.data_json = json_dumps(build_activity_payload(request))
    session.expires_at = session_expiry(settings.session_ttl_seconds)
    db.commit()
    audit(db, user.id, "login", "session", session.id)
    return RedirectResponse(url="/", status_code=302)


@app.post("/auth/logout")
def auth_logout(request: Request, db: Session = Depends(get_db)):
    session = get_current_session(db, request)
    response = JSONResponse({"message": "Logged out"})
    if session:
        audit(db, session.user_id, "logout", "session", session.id)
        db.delete(session)
        db.commit()
    response.delete_cookie(settings.session_cookie_name, path="/")
    return response


@app.get("/api/me")
def api_me(user: User = Depends(require_user)):
    return {"user": public_user_payload(user)}


@app.get("/api/auth/status")
def api_auth_status(request: Request, db: Session = Depends(get_db)):
    user = get_current_user_optional(request, db)
    return auth_status_payload(user)


@app.get("/api/admin/users")
def api_admin_users(
    q: str | None = None,
    role: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    stmt = select(User)
    if q:
        keyword = f"%{q.strip()}%"
        stmt = stmt.where(
            (User.email.ilike(keyword)) | (User.username.ilike(keyword)) | (User.display_name.ilike(keyword))
        )
    if role:
        role_value = role.strip().lower()
        if role_value in {"admin", "user"}:
            stmt = stmt.where(User.role == role_value)
    if status:
        status_value = status.strip().lower()
        if status_value == "active":
            stmt = stmt.where(User.is_active.is_(True))
        elif status_value == "disabled":
            stmt = stmt.where(User.is_active.is_(False))

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    users = list(db.execute(stmt.order_by(User.created_at.desc()).limit(limit).offset(offset)).scalars())
    return {
        "users": [admin_user_payload(user) for user in users],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@app.get("/api/admin/users/{user_id}")
def api_admin_user_detail(user_id: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    project_count = db.execute(
        select(func.count()).select_from(Project).where(Project.owner_user_id == target.id)
    ).scalar_one()
    recent_projects = list(
        db.execute(
            select(Project)
            .where(Project.owner_user_id == target.id)
            .order_by(Project.updated_at.desc())
            .limit(5)
        ).scalars()
    )
    recent_logs = list(
        db.execute(
            select(AuditLog).where(AuditLog.user_id == target.id).order_by(AuditLog.created_at.desc()).limit(20)
        ).scalars()
    )
    recent_sessions = list(
        db.execute(
            select(SessionModel)
            .where(SessionModel.user_id == target.id)
            .order_by(SessionModel.expires_at.desc())
            .limit(5)
        ).scalars()
    )
    return {
        "user": admin_user_payload(target),
        "activity": summarize_session_activity(recent_sessions),
        "projects": {
            "count": project_count,
            "recent": [
                {
                    "id": project.id,
                    "name": project.name,
                    "status": project.status,
                    "updated_at": project.updated_at.strftime("%Y-%m-%d %H:%M:%S"),
                }
                for project in recent_projects
            ],
        },
        "recent_logs": [
            {
                "id": row.id,
                "user_id": row.user_id,
                "action": row.action,
                "resource_type": row.resource_type,
                "resource_id": row.resource_id,
                "details": json_loads(row.details_json, {}),
                "created_at": row.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            }
            for row in recent_logs
        ],
    }


@app.patch("/api/admin/users/{user_id}")
def api_admin_update_user(
    user_id: str,
    body: Dict[str, Any],
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    role = body.get("role")
    if role is not None:
        role = str(role).strip().lower()
        if role not in {"admin", "user"}:
            raise HTTPException(status_code=400, detail="Invalid role")
        if target.id == admin.id and role != "admin":
            raise HTTPException(status_code=400, detail="You cannot demote yourself")
        target.role = role

    groups = body.get("groups")
    if groups is not None:
        if not isinstance(groups, list) or any(not isinstance(item, str) for item in groups):
            raise HTTPException(status_code=400, detail="groups must be a list of strings")
        target.groups_json = json_dumps([item.strip() for item in groups if item.strip()])

    is_active = body.get("is_active")
    if is_active is not None:
        if not isinstance(is_active, bool):
            raise HTTPException(status_code=400, detail="is_active must be a boolean")
        if target.id == admin.id and not is_active:
            raise HTTPException(status_code=400, detail="You cannot disable yourself")
        target.is_active = is_active

    db.commit()
    db.refresh(target)
    audit(db, admin.id, "update", "user", target.id, {"role": target.role, "is_active": target.is_active})
    return {"user": admin_user_payload(target)}


@app.post("/api/admin/users/{user_id}/sessions/purge")
def api_admin_purge_sessions(
    user_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    sessions = list(db.execute(select(SessionModel).where(SessionModel.user_id == user_id)).scalars())
    for session in sessions:
        db.delete(session)
    db.commit()
    audit(db, admin.id, "purge_sessions", "user", target.id, {"count": len(sessions)})
    return {"purged": len(sessions), "user_id": user_id}


@app.get("/api/admin/audit-logs")
def api_admin_audit_logs(
    user_id: str | None = None,
    action: str | None = None,
    resource_type: str | None = None,
    start: str | None = None,
    end: str | None = None,
    limit: int = 100,
    offset: int = 0,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    stmt = build_audit_query(user_id, action, resource_type, start, end)

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = list(db.execute(stmt.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)).scalars())
    user_ids = [row.user_id for row in rows if row.user_id]
    users_map = {}
    if user_ids:
        users = list(db.execute(select(User).where(User.id.in_(user_ids))).scalars())
        users_map = {user.id: user for user in users}
    return {
        "logs": [
            {
                "id": row.id,
                "user_id": row.user_id,
                "user_display_name": users_map.get(row.user_id).display_name if row.user_id in users_map else "",
                "user_email": users_map.get(row.user_id).email if row.user_id in users_map else "",
                "action": row.action,
                "resource_type": row.resource_type,
                "resource_id": row.resource_id,
                "details": json_loads(row.details_json, {}),
                "created_at": row.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            }
            for row in rows
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@app.get("/api/admin/audit-logs/export")
def api_admin_audit_export(
    user_id: str | None = None,
    action: str | None = None,
    resource_type: str | None = None,
    start: str | None = None,
    end: str | None = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    import csv
    import io

    stmt = build_audit_query(user_id, action, resource_type, start, end)
    rows = list(db.execute(stmt.order_by(AuditLog.created_at.desc())).scalars())
    user_ids = [row.user_id for row in rows if row.user_id]
    users_map = {}
    if user_ids:
        users = list(db.execute(select(User).where(User.id.in_(user_ids))).scalars())
        users_map = {user.id: user for user in users}

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["created_at", "action", "resource_type", "resource_id", "user_id", "user_email", "details"])
    for row in rows:
        user = users_map.get(row.user_id)
        writer.writerow(
            [
                row.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                row.action,
                row.resource_type,
                row.resource_id,
                row.user_id or "",
                user.email if user else "",
                json_dumps(json_loads(row.details_json, {})),
            ]
        )

    buffer.seek(0)
    filename = "audit_logs.csv"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(buffer, media_type="text/csv; charset=utf-8", headers=headers)


@app.get("/api/dashboard")
def dashboard(user: User = Depends(require_user), db: Session = Depends(get_db)):
    projects = list(db.execute(select(Project).where(Project.owner_user_id == user.id).order_by(Project.updated_at.desc())).scalars())
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
    return {
        "repo_root": str(settings.repo_root),
        "projects_root": str(get_user_storage_root(user)),
        "formats": formats,
        "steps": [{"id": key, "label": value["label"]} for key, value in POST_PROCESSING_STEPS.items()],
        "projects": [build_project_summary(project) for project in projects],
        "model_config": get_text_model_config(db, user),
        "user": public_user_payload(user),
    }


@app.get("/api/templates")
def templates(user: User = Depends(require_user)):
    return list_templates()


@app.delete("/api/templates/{template_id}")
def delete_template(template_id: str, user: User = Depends(require_user)):
    template_id = template_id.strip()
    if not template_id:
        raise HTTPException(400, "template_id is required")

    template_dir = settings.templates_dir / template_id
    if not template_dir.exists() or not template_dir.is_dir():
        raise HTTPException(404, f"Template not found: {template_id}")

    # Remove directory
    shutil.rmtree(template_dir)

    # Update index
    index_path = settings.templates_dir / "layouts_index.json"
    if index_path.exists():
        try:
            index_data = json.loads(index_path.read_text(encoding="utf-8"))
            index_data.get("layouts", {}).pop(template_id, None)
            for cat in index_data.get("categories", {}).values():
                layouts_list = cat.get("layouts", [])
                if template_id in layouts_list:
                    layouts_list.remove(template_id)
            for key, ids in list(index_data.get("quickLookup", {}).items()):
                if template_id in ids:
                    ids.remove(template_id)
            meta = index_data.get("meta", {})
            meta["total"] = len(index_data.get("layouts", {}))
            index_path.write_text(json.dumps(index_data, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception:
            pass  # Index update is best-effort; directory is already deleted

    return {"message": f"Template '{template_id}' deleted", "template_id": template_id}


@app.post("/api/templates/upload")
async def upload_template(
    name: str = Form(...),
    label: str = Form(...),
    summary: str = Form(default=""),
    category: str = Form(default="general"),
    keywords: str = Form(default=""),
    files: List[UploadFile] = File(...),
    user: User = Depends(require_user),
):
    name = name.strip()
    if not name:
        raise HTTPException(400, "Template name/ID is required")
    if not all(c.isalnum() or c in ("_", "-", "\u4e00-\u9fff") or "\u4e00" <= c <= "\u9fff" for c in name):
        raise HTTPException(400, "Template name can only contain letters, digits, underscores, hyphens, or Chinese characters")

    template_dir = settings.templates_dir / name
    if template_dir.exists():
        raise HTTPException(409, f"Template '{name}' already exists")

    # Validate files: need at least one SVG
    filenames = [f.filename for f in files]
    svg_files = [f for f in filenames if f and f.endswith(".svg")]
    if not svg_files:
        raise HTTPException(400, "At least one SVG file is required")

    # Create directory and save files
    template_dir.mkdir(parents=True, exist_ok=True)
    try:
        saved_files = []
        for upload_file in files:
            if not upload_file.filename:
                continue
            dest = template_dir / upload_file.filename
            content = await upload_file.read()
            dest.write_bytes(content)
            saved_files.append(upload_file.filename)

        # Update index
        index_path = settings.templates_dir / "layouts_index.json"
        if index_path.exists():
            index_data = json.loads(index_path.read_text(encoding="utf-8"))
        else:
            index_data = {"meta": {"total": 0}, "categories": {}, "layouts": {}, "quickLookup": {}}

        kw_list = [k.strip() for k in keywords.split(",") if k.strip()] if keywords else []
        index_data["layouts"][name] = {
            "label": label.strip(),
            "summary": summary.strip(),
            "tone": "",
            "themeMode": "Light",
            "keywords": kw_list,
        }

        # Add to category
        valid_categories = ("brand", "general", "scenario", "government", "special")
        cat = category.strip() if category.strip() in valid_categories else "general"
        if cat not in index_data.get("categories", {}):
            index_data["categories"][cat] = {"label": cat.title(), "layouts": []}
        if name not in index_data["categories"][cat].get("layouts", []):
            index_data["categories"][cat].setdefault("layouts", []).append(name)

        index_data["meta"]["total"] = len(index_data.get("layouts", {}))
        index_path.write_text(json.dumps(index_data, ensure_ascii=False, indent=2), encoding="utf-8")

        return {
            "message": f"Template '{name}' uploaded",
            "template_id": name,
            "files": saved_files,
        }
    except Exception as exc:
        # Cleanup on failure
        if template_dir.exists():
            shutil.rmtree(template_dir)
        raise HTTPException(500, f"Upload failed: {exc}") from exc


@app.get("/api/model-config")
def model_config_get(user: User = Depends(require_user), db: Session = Depends(get_db)):
    return {"model_config": get_text_model_config(db, user)}


@app.post("/api/model-config")
def model_config_post(body: Dict[str, Any], user: User = Depends(require_user), db: Session = Depends(get_db)):
    action = str(body.get("action", "upsert")).strip().lower()
    profiles = list(db.execute(select(TextModelProfile).where(TextModelProfile.owner_user_id == user.id)).scalars())
    if action == "upsert":
        raw_profile = body.get("profile")
        if not isinstance(raw_profile, dict):
            raise HTTPException(400, "profile is required")
        profile_id = str(raw_profile.get("id", "")).strip()
        existing = next((item for item in profiles if item.id == profile_id), None) if profile_id else None
        backend = validate_text_backend(str(raw_profile.get("backend", existing.backend if existing else "")))
        name = str(raw_profile.get("name", existing.name if existing else "")).strip()
        if not name:
            raise HTTPException(400, "Profile name is required")
        api_key = str(raw_profile.get("api_key", "")).strip() or (decrypt_secret(existing.api_key_encrypted) if existing else "")
        if not api_key:
            raise HTTPException(400, "API key is required")
        if existing is None:
            existing = TextModelProfile(
                id=new_uuid(),
                owner_user_id=user.id,
                name=name,
                backend=backend,
                base_url=str(raw_profile.get("base_url", "")).strip(),
                model=str(raw_profile.get("model", "")).strip(),
                api_key_encrypted=encrypt_secret(api_key),
                is_default=bool(body.get("select", True) or not profiles),
            )
            db.add(existing)
        else:
            existing.name = name
            existing.backend = backend
            existing.base_url = str(raw_profile.get("base_url", existing.base_url)).strip()
            existing.model = str(raw_profile.get("model", existing.model)).strip()
            existing.api_key_encrypted = encrypt_secret(api_key)
            if body.get("select", False):
                existing.is_default = True
        if body.get("select", True):
            for profile in profiles:
                if existing.id != profile.id:
                    profile.is_default = False
            existing.is_default = True
        db.commit()
        db.refresh(existing)
        audit(db, user.id, "upsert", "text_model_profile", existing.id, {"name": existing.name})
        return {"message": "Model profile saved", "profile": model_profile_public_payload(existing), "model_config": get_text_model_config(db, user)}
    if action == "delete":
        profile_id = str(body.get("profile_id", "")).strip()
        target = next((item for item in profiles if item.id == profile_id), None)
        if target is None:
            raise HTTPException(404, "Profile not found")
        db.delete(target)
        db.commit()
        remaining = list(db.execute(select(TextModelProfile).where(TextModelProfile.owner_user_id == user.id)).scalars())
        if remaining and not any(item.is_default for item in remaining):
            remaining[0].is_default = True
            db.commit()
        audit(db, user.id, "delete", "text_model_profile", profile_id)
        return {"message": "Model profile deleted", "model_config": get_text_model_config(db, user)}
    if action == "select":
        profile_id = str(body.get("profile_id", "")).strip()
        target = next((item for item in profiles if item.id == profile_id), None)
        if target is None:
            raise HTTPException(404, "Profile not found")
        for profile in profiles:
            profile.is_default = profile.id == profile_id
        db.commit()
        audit(db, user.id, "select", "text_model_profile", profile_id)
        return {"message": "Active model profile updated", "model_config": get_text_model_config(db, user)}
    if action == "test":
        raw_profile = body.get("profile")
        if not isinstance(raw_profile, dict):
            raise HTTPException(400, "profile is required")
        profile_id = str(raw_profile.get("id", "")).strip()
        existing = next((item for item in profiles if item.id == profile_id), None) if profile_id else None
        result = test_text_model_profile(
            {
                "backend": str(raw_profile.get("backend", existing.backend if existing else "")),
                "api_key": str(raw_profile.get("api_key", "")).strip() or (decrypt_secret(existing.api_key_encrypted) if existing else ""),
                "base_url": str(raw_profile.get("base_url", existing.base_url if existing else "")).strip(),
                "model": str(raw_profile.get("model", existing.model if existing else "")).strip(),
            }
        )
        return {"message": "Model test succeeded", "result": result}
    raise HTTPException(400, f"Unsupported action: {action}")


@app.post("/api/model-config/models")
def model_catalog(body: Dict[str, Any], user: User = Depends(require_user)):
    backend = validate_text_backend(str(body.get("backend", "")))
    base_url = str(body.get("base_url", "")).strip()
    api_key = str(body.get("api_key", "")).strip()
    if not api_key:
        raise HTTPException(400, "API key is required to fetch models")
    models = fetch_openai_compatible_models(base_url, api_key) if backend == "openai" else fetch_gemini_models(base_url, api_key)
    return {"models": models, "count": len(models)}


@app.get("/api/image-model-config")
def image_model_config_get(user: User = Depends(require_user), db: Session = Depends(get_db)):
    return {"image_model_config": get_image_model_config(db, user)}


@app.post("/api/image-model-config")
def image_model_config_post(body: Dict[str, Any], user: User = Depends(require_user), db: Session = Depends(get_db)):
    action = str(body.get("action", "upsert")).strip().lower()
    profiles = list(db.execute(select(ImageModelProfile).where(ImageModelProfile.owner_user_id == user.id)).scalars())
    if action == "upsert":
        raw_profile = body.get("profile")
        if not isinstance(raw_profile, dict):
            raise HTTPException(400, "profile is required")
        profile_id = str(raw_profile.get("id", "")).strip()
        existing = next((item for item in profiles if item.id == profile_id), None) if profile_id else None
        backend = str(raw_profile.get("backend", existing.backend if existing else "gemini")).lower()
        if backend not in IMAGE_BACKENDS:
            raise HTTPException(400, "Backend must be 'gemini' or 'openai'")
        name = str(raw_profile.get("name", existing.name if existing else "")).strip()
        if not name:
            raise HTTPException(400, "Profile name is required")
        api_key = str(raw_profile.get("api_key", "")).strip() or (decrypt_secret(existing.api_key_encrypted) if existing else "")
        if not api_key:
            raise HTTPException(400, "API key is required")
        if existing is None:
            existing = ImageModelProfile(
                id=new_uuid(),
                owner_user_id=user.id,
                name=name,
                backend=backend,
                base_url=str(raw_profile.get("base_url", "")).strip(),
                model=str(raw_profile.get("model", "")).strip(),
                api_key_encrypted=encrypt_secret(api_key),
                is_default=bool(body.get("select", True) or not profiles),
            )
            db.add(existing)
        else:
            existing.name = name
            existing.backend = backend
            existing.base_url = str(raw_profile.get("base_url", existing.base_url)).strip()
            existing.model = str(raw_profile.get("model", existing.model)).strip()
            existing.api_key_encrypted = encrypt_secret(api_key)
        if body.get("select", True):
            for profile in profiles:
                profile.is_default = False
            existing.is_default = True
        db.commit()
        db.refresh(existing)
        audit(db, user.id, "upsert", "image_model_profile", existing.id, {"name": existing.name})
        return {"message": "Image model profile saved", "profile": model_profile_public_payload(existing), "image_model_config": get_image_model_config(db, user)}
    if action == "delete":
        profile_id = str(body.get("profile_id", "")).strip()
        target = next((item for item in profiles if item.id == profile_id), None)
        if target is None:
            raise HTTPException(404, "Profile not found")
        db.delete(target)
        db.commit()
        remaining = list(db.execute(select(ImageModelProfile).where(ImageModelProfile.owner_user_id == user.id)).scalars())
        if remaining and not any(item.is_default for item in remaining):
            remaining[0].is_default = True
            db.commit()
        audit(db, user.id, "delete", "image_model_profile", profile_id)
        return {"message": "Image model profile deleted", "image_model_config": get_image_model_config(db, user)}
    if action == "select":
        profile_id = str(body.get("profile_id", "")).strip()
        target = next((item for item in profiles if item.id == profile_id), None)
        if target is None:
            raise HTTPException(404, "Profile not found")
        for profile in profiles:
            profile.is_default = profile.id == profile_id
        db.commit()
        audit(db, user.id, "select", "image_model_profile", profile_id)
        return {"message": "Active image model profile updated", "image_model_config": get_image_model_config(db, user)}
    raise HTTPException(400, f"Unsupported action: {action}")


@app.post("/api/image-model-config/test")
def image_model_test(body: Dict[str, Any], user: User = Depends(require_user)):
    raw_profile = body.get("profile")
    if not isinstance(raw_profile, dict):
        raise HTTPException(400, "profile is required")
    backend = str(raw_profile.get("backend", "gemini")).lower()
    api_key = str(raw_profile.get("api_key", "")).strip()
    if backend not in IMAGE_BACKENDS:
        raise HTTPException(400, "Backend must be 'gemini' or 'openai'")
    if not api_key:
        raise HTTPException(400, "API key is required")
    try:
        with tempfile.TemporaryDirectory(prefix="ppt_master_image_test_") as temp_dir:
            result = generate_image(
                profile={"backend": backend, "api_key": api_key, "base_url": str(raw_profile.get("base_url", "")).strip(), "model": str(raw_profile.get("model", "")).strip()},
                prompt="A simple abstract gradient background, minimalist style",
                output_dir=temp_dir,
                filename="test_image",
                aspect_ratio="1:1",
                image_size="512px",
            )
            return {"message": "Image generation test succeeded", "result": {"backend": result.get("backend"), "model": result.get("model"), "filename": result.get("filename")}}
    except Exception as exc:
        raise HTTPException(400, f"Image generation test failed: {exc}") from exc


@app.get("/api/projects")
def list_projects(user: User = Depends(require_user), db: Session = Depends(get_db)):
    projects = list(db.execute(select(Project).where(Project.owner_user_id == user.id).order_by(Project.updated_at.desc())).scalars())
    return {"projects": [build_project_summary(project) for project in projects]}


@app.post("/api/projects")
def create_project(body: Dict[str, Any], user: User = Depends(require_user), db: Session = Depends(get_db)):
    project_name = normalize_project_name(str(body.get("project_name", "")).strip())
    canvas_format = str(body.get("canvas_format", "ppt169")).strip()
    if not project_name:
        raise HTTPException(400, "project_name is required")
    if canvas_format not in CANVAS_FORMATS:
        raise HTTPException(400, "Unsupported canvas format")
    base_slug = slugify(project_name)
    slug = base_slug
    index = 2
    while db.execute(select(Project).where(Project.owner_user_id == user.id, Project.slug == slug)).scalar_one_or_none():
        slug = f"{base_slug}-{index}"
        index += 1
    project_id = new_uuid()
    project = Project(
        id=project_id,
        owner_user_id=user.id,
        name=project_name,
        slug=slug,
        canvas_format=canvas_format,
        storage_path=str(get_user_storage_root(user) / project_id),
        status="active",
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    create_project_directory(project)
    audit(db, user.id, "create", "project", project.id, {"name": project.name})
    return {"message": "Project created", "project": build_project_summary(project)}


@app.get("/api/projects/{project_ref}")
def get_project(project_ref: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    project = resolve_project_by_ref(db, user, project_ref)
    return {"project": build_project_summary(project)}


@app.delete("/api/projects/{project_ref}")
def delete_project(project_ref: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    project = resolve_project_by_ref(db, user, project_ref)
    path = project_path(project)
    if path.exists():
        shutil.rmtree(path)
    db.delete(project)
    db.commit()
    audit(db, user.id, "delete", "project", project.id)
    return {"message": f"Project '{project.name}' deleted"}


@app.post("/api/projects/{project_ref}/import")
def project_import(project_ref: str, body: Dict[str, Any], user: User = Depends(require_user), db: Session = Depends(get_db)):
    project = resolve_project_by_ref(db, user, project_ref)
    project_root = project_path(project)
    raw_sources = body.get("sources", [])
    move = bool(body.get("move", False))
    pasted_content = str(body.get("pasted_content", ""))
    pasted_format = str(body.get("pasted_format", "markdown")).strip().lower()
    pasted_filename = str(body.get("pasted_filename", "")).strip()
    if not isinstance(raw_sources, list):
        raise HTTPException(400, "sources must be a list")
    sources = [str(item).strip() for item in raw_sources if str(item).strip()]
    if pasted_format not in {"markdown", "text"}:
        raise HTTPException(400, "pasted_format must be markdown or text")
    if not sources and not pasted_content.strip():
        raise HTTPException(400, "Provide sources or pasted content")
    temp_dir_obj = None
    try:
        if pasted_content.strip():
            suffix = ".md" if pasted_format == "markdown" else ".txt"
            temp_dir_obj = tempfile.TemporaryDirectory(prefix="ppt_master_paste_")
            temp_file = Path(temp_dir_obj.name) / sanitize_uploaded_name(pasted_filename, "pasted_source", suffix)
            temp_file.write_text(pasted_content, encoding="utf-8")
            sources.append(str(temp_file))
        summary = PROJECT_MANAGER.import_sources(str(project_root), sources, move=move)
    except Exception as exc:
        raise HTTPException(400, str(exc)) from exc
    finally:
        if temp_dir_obj is not None:
            temp_dir_obj.cleanup()
    project.updated_at = utcnow()
    db.commit()
    audit(db, user.id, "import", "project", project.id)
    return {"message": "Sources imported", "summary": summary, "project": build_project_summary(project)}


@app.post("/api/projects/{project_ref}/validate")
def project_validate(project_ref: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    project = resolve_project_by_ref(db, user, project_ref)
    try:
        is_valid, errors, warnings = PROJECT_MANAGER.validate_project(str(project_path(project)))
    except Exception as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"project": build_project_summary(project), "validation": {"is_valid": is_valid, "errors": errors, "warnings": warnings}}


@app.post("/api/projects/{project_ref}/apply-template")
def project_apply_template(project_ref: str, body: Dict[str, Any], user: User = Depends(require_user), db: Session = Depends(get_db)):
    project = resolve_project_by_ref(db, user, project_ref)
    template_id = str(body.get("template_id", "")).strip()
    if not template_id:
        raise HTTPException(400, "template_id is required")
    copied_files = apply_template_to_project(project_path(project), template_id)
    project.updated_at = utcnow()
    db.commit()
    audit(db, user.id, "apply_template", "project", project.id, {"template_id": template_id})
    return {"message": f"Template '{template_id}' applied successfully", "template_id": template_id, "copied_files": copied_files, "project": build_project_summary(project)}


@app.post("/api/projects/{project_ref}/analyze")
def project_analyze(project_ref: str, body: Dict[str, Any], user: User = Depends(require_user), db: Session = Depends(get_db)):
    project = resolve_project_by_ref(db, user, project_ref)
    profile = resolve_text_profile(db, user, str(body.get("profile_id", "")).strip() or None)
    if profile is None:
        raise HTTPException(400, "No model profile configured")
    result = analyze_content_for_strategist(project_path(project), {**build_text_env_overrides(profile), "backend": profile.backend, "api_key": decrypt_secret(profile.api_key_encrypted), "base_url": profile.base_url, "model": profile.model})
    audit(db, user.id, "analyze", "project", project.id, {"profile_id": profile.id})
    return {"message": "Analysis completed", "recommendations": result, "project": build_project_summary(project), "profile": model_profile_public_payload(profile)}


@app.post("/api/projects/{project_ref}/design-spec")
def project_design_spec(project_ref: str, body: Dict[str, Any], user: User = Depends(require_user), db: Session = Depends(get_db)):
    project = resolve_project_by_ref(db, user, project_ref)
    spec = body.get("spec")
    if not spec:
        raise HTTPException(400, "spec is required")
    canvas_format = spec.get("canvas_format", "ppt169")
    page_count = spec.get("page_count", {})
    target_audience = spec.get("target_audience", "")
    style_objective = spec.get("style_objective", "general")
    color_scheme = spec.get("color_scheme", {})
    icon_approach = spec.get("icon_approach", "builtin")
    typography = spec.get("typography", {})
    image_approach = spec.get("image_approach", "none")
    canvas_info = CANVAS_FORMATS.get(canvas_format, CANVAS_FORMATS.get("ppt169", {}))
    style_names = {"general": "通用灵活 (General Flexible)", "consultant": "一般咨询 (General Consulting)", "consultant-top": "顶级咨询 (Top Consulting)"}
    icon_names = {"builtin": "内置图标库", "emoji": "Emoji 表情", "ai-generated": "AI 生成", "none": "不使用图标"}
    image_names = {"none": "不使用图片", "user-provided": "用户提供", "ai-generated": "AI 生成", "placeholder": "占位符"}
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
"""
    spec_path = project_path(project) / "design_spec.md"
    spec_path.write_text(content, encoding="utf-8")
    project.updated_at = utcnow()
    db.commit()
    audit(db, user.id, "save_design_spec", "project", project.id)
    return {"message": "Design specification saved", "path": str(spec_path), "project": build_project_summary(project)}


@app.post("/api/projects/{project_ref}/generate-notes")
def project_generate_notes(project_ref: str, body: Dict[str, Any], user: User = Depends(require_user), db: Session = Depends(get_db)):
    project = resolve_project_by_ref(db, user, project_ref)
    summary = build_project_summary(project)
    if summary["svg_output_count"] == 0:
        raise HTTPException(400, "Generate notes requires SVG files in svg_output/. Run Strategist/Executor first, then retry.")
    profile = resolve_text_profile(db, user, str(body.get("profile_id", "")).strip() or None)
    if profile is None:
        raise HTTPException(400, "No model profile configured")
    command = [sys.executable, str(settings.scripts_dir / "notes_gen.py"), str(project_path(project)), "--overwrite"]
    result = RUNNER.run(project.id, command, env_overrides=build_text_env_overrides(profile))
    project.updated_at = utcnow()
    db.commit()
    audit(db, user.id, "generate_notes", "project", project.id, {"profile_id": profile.id})
    payload = {
        "message": "Notes generation completed" if result.returncode == 0 else "Notes generation failed",
        "project": build_project_summary(project),
        "profile": model_profile_public_payload(profile),
        "command": result.command,
        "returncode": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }
    if result.returncode != 0:
        return JSONResponse(status_code=400, content=payload)
    return payload


def sse_event(event: str, data: Dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/api/projects/{project_ref}/generate-svg")
def project_generate_svg(project_ref: str, body: Dict[str, Any], user: User = Depends(require_user), db: Session = Depends(get_db)):
    project = resolve_project_by_ref(db, user, project_ref)
    profile = resolve_text_profile(db, user, str(body.get("profile_id", "")).strip() or None)
    if profile is None:
        raise HTTPException(400, "No model profile configured")
    design_spec_path = find_design_spec_file(project_path(project))
    if design_spec_path is None:
        raise HTTPException(400, "Design spec not found. Complete Strategist phase first.")
    design_spec = design_spec_path.read_text(encoding="utf-8", errors="replace")
    sources_content = load_project_sources(project_path(project), max_files=10, max_chars=SVG_GENERATION_MAX_CHARS)
    pages = parse_design_spec_for_pages(design_spec)
    if not pages:
        pages = [{"number": i + 1, "title": f"Page {i + 1}", "type": "content"} for i in range(estimate_page_count(design_spec, sources_content))]
    backend = profile.backend.lower()
    api_key = decrypt_secret(profile.api_key_encrypted)
    base_url = profile.base_url or None
    model = profile.model or ("gpt-4o-mini" if backend == "openai" else "gemini-2.5-flash")
    svg_output_dir = project_path(project) / "svg_output"
    svg_output_dir.mkdir(parents=True, exist_ok=True)

    try:
        stream_lock = RUNNER.acquire(project.id)
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc

    def event_stream() -> Generator[str, None, None]:
        existing_pages: List[str] = []
        generated_files: List[str] = []
        errors: List[str] = []
        try:
            yield sse_event("start", {"total_pages": len(pages), "model": model, "backend": backend})
            for page in pages:
                page_num = page["number"]
                page_title = page["title"]
                try:
                    prompt = build_svg_generation_prompt(page_num, len(pages), page_title, page["type"], design_spec, sources_content, existing_pages)
                    svg_content = generate_single_svg(prompt, backend, api_key, base_url, model)
                    filename = f"page_{page_num:03d}.svg"
                    (svg_output_dir / filename).write_text(svg_content, encoding="utf-8")
                    generated_files.append(filename)
                    existing_pages.append(f"{page_num}:{page_title}")
                    yield sse_event("page_complete", {"page_number": page_num, "total_pages": len(pages), "filename": filename, "title": page_title, "url": f"/files/projects/{project.id}/svg_output/{filename}"})
                except Exception as exc:
                    errors.append(str(exc))
                    yield sse_event("page_error", {"page_number": page_num, "error": str(exc)})
            with SessionLocal() as stream_db:
                stream_project = stream_db.get(Project, project.id)
                if stream_project is not None:
                    stream_project.updated_at = utcnow()
                    stream_db.commit()
            yield sse_event("complete", {"total_pages": len(pages), "generated": len(generated_files), "errors": errors, "files": generated_files, "project": build_project_summary(project)})
        finally:
            stream_lock.release()

    audit(db, user.id, "generate_svg", "project", project.id, {"profile_id": profile.id})
    return StreamingResponse(event_stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/projects/{project_ref}/regenerate-svg")
def project_regenerate_svg(project_ref: str, body: Dict[str, Any], user: User = Depends(require_user), db: Session = Depends(get_db)):
    project = resolve_project_by_ref(db, user, project_ref)
    profile = resolve_text_profile(db, user, str(body.get("profile_id", "")).strip() or None)
    if profile is None:
        raise HTTPException(400, "No model profile configured")
    design_spec_path = find_design_spec_file(project_path(project))
    if design_spec_path is None:
        raise HTTPException(400, "Design spec not found. Complete Strategist phase first.")
    design_spec = design_spec_path.read_text(encoding="utf-8", errors="replace")
    sources_content = load_project_sources(project_path(project), max_files=10, max_chars=SVG_GENERATION_MAX_CHARS)
    all_pages = parse_design_spec_for_pages(design_spec)
    if not all_pages:
        all_pages = [{"number": i + 1, "title": f"Page {i + 1}", "type": "content"} for i in range(estimate_page_count(design_spec, sources_content))]
    page_numbers = set(body.get("page_numbers", []))
    pages_to_generate = all_pages if body.get("regenerate_all", False) else [p for p in all_pages if p["number"] in page_numbers]
    if not pages_to_generate:
        raise HTTPException(400, "No valid pages to regenerate")
    backend = profile.backend.lower()
    api_key = decrypt_secret(profile.api_key_encrypted)
    base_url = profile.base_url or None
    model = profile.model or ("gpt-4o-mini" if backend == "openai" else "gemini-2.5-flash")
    svg_output_dir = project_path(project) / "svg_output"
    existing_pages: List[str] = []
    for svg_file in sorted(svg_output_dir.glob("*.svg")):
        try:
            page_num = int(svg_file.stem.split("_")[1])
        except Exception:
            continue
        if page_num not in {p["number"] for p in pages_to_generate}:
            existing_pages.append(f"{page_num}:{_get_page_title(svg_file)}")

    try:
        stream_lock = RUNNER.acquire(project.id)
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc

    def event_stream() -> Generator[str, None, None]:
        generated_files: List[str] = []
        errors: List[str] = []
        try:
            yield sse_event("start", {"total_pages": len(pages_to_generate), "model": model, "backend": backend, "regenerate": True})
            local_existing = list(existing_pages)
            for page in pages_to_generate:
                try:
                    prompt = build_svg_generation_prompt(page["number"], len(all_pages), page["title"], page["type"], design_spec, sources_content, local_existing)
                    svg_content = generate_single_svg(prompt, backend, api_key, base_url, model)
                    filename = f"page_{page['number']:03d}.svg"
                    (svg_output_dir / filename).write_text(svg_content, encoding="utf-8")
                    generated_files.append(filename)
                    local_existing.append(f"{page['number']}:{page['title']}")
                    yield sse_event("page_complete", {"page_number": page["number"], "total_pages": len(pages_to_generate), "filename": filename, "title": page["title"], "url": f"/files/projects/{project.id}/svg_output/{filename}"})
                except Exception as exc:
                    errors.append(str(exc))
                    yield sse_event("page_error", {"page_number": page["number"], "error": str(exc)})
            with SessionLocal() as stream_db:
                stream_project = stream_db.get(Project, project.id)
                if stream_project is not None:
                    stream_project.updated_at = utcnow()
                    stream_db.commit()
            yield sse_event("complete", {"total_pages": len(pages_to_generate), "generated": len(generated_files), "errors": errors, "files": generated_files, "project": build_project_summary(project)})
        finally:
            stream_lock.release()

    audit(db, user.id, "regenerate_svg", "project", project.id, {"profile_id": profile.id})
    return StreamingResponse(event_stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/projects/{project_ref}/delete-svg")
def project_delete_svg(project_ref: str, body: Dict[str, Any], user: User = Depends(require_user), db: Session = Depends(get_db)):
    project = resolve_project_by_ref(db, user, project_ref)
    page_numbers = body.get("page_numbers", [])
    delete_all = body.get("delete_all", False)
    svg_output_dir = project_path(project) / "svg_output"
    svg_final_dir = project_path(project) / "svg_final"
    deleted_files: List[str] = []
    if delete_all:
        for directory in (svg_output_dir, svg_final_dir):
            if directory.exists():
                for svg_file in directory.glob("*.svg"):
                    try:
                        svg_file.unlink()
                        deleted_files.append(svg_file.name)
                    except Exception:
                        pass
        total_notes = project_path(project) / "notes" / "total.md"
        if total_notes.exists():
            total_notes.unlink()
        notes_dir = project_path(project) / "notes"
        if notes_dir.exists():
            for note_file in notes_dir.glob("page_*.md"):
                try:
                    note_file.unlink()
                except Exception:
                    pass
    else:
        for page_num in page_numbers:
            filename = f"page_{int(page_num):03d}.svg"
            for directory in (svg_output_dir, svg_final_dir):
                target = directory / filename
                if target.exists():
                    try:
                        target.unlink()
                        if directory == svg_output_dir:
                            deleted_files.append(filename)
                    except Exception:
                        pass
            note_file = project_path(project) / "notes" / f"page_{int(page_num):03d}.md"
            if note_file.exists():
                try:
                    note_file.unlink()
                except Exception:
                    pass
    project.updated_at = utcnow()
    db.commit()
    audit(db, user.id, "delete_svg", "project", project.id, {"delete_all": bool(delete_all)})
    return {"message": f"Deleted {len(deleted_files)} SVG files", "deleted_files": deleted_files, "project": build_project_summary(project)}


@app.post("/api/projects/{project_ref}/generate-image")
def project_generate_image(project_ref: str, body: Dict[str, Any], user: User = Depends(require_user), db: Session = Depends(get_db)):
    project = resolve_project_by_ref(db, user, project_ref)
    profile = resolve_image_profile(db, user, str(body.get("profile_id", "")).strip() or None)
    if profile is None:
        raise HTTPException(400, "No image model profile configured")
    prompt = str(body.get("prompt", "")).strip()
    if not prompt:
        raise HTTPException(400, "prompt is required")
    aspect_ratio = str(body.get("aspect_ratio", "1:1")).strip()
    image_size = str(body.get("image_size", "1K")).strip()
    if aspect_ratio not in IMAGE_ASPECT_RATIOS:
        raise HTTPException(400, f"Invalid aspect_ratio. Valid: {', '.join(IMAGE_ASPECT_RATIOS)}")
    if image_size not in IMAGE_SIZES:
        raise HTTPException(400, f"Invalid image_size. Valid: {', '.join(IMAGE_SIZES)}")
    images_dir = project_path(project) / "images"
    result = generate_image(build_image_profile_dict(profile), prompt, str(images_dir), str(body.get("filename", "")).strip() or None, aspect_ratio, image_size)
    project.updated_at = utcnow()
    db.commit()
    audit(db, user.id, "generate_image", "project", project.id, {"profile_id": profile.id})
    return {"message": "Image generated successfully", "image": {"filename": result.get("filename"), "url": f"/files/projects/{project.id}/images/{result.get('filename')}", "prompt": result.get("prompt"), "model": result.get("model"), "backend": result.get("backend")}, "project": build_project_summary(project)}


@app.post("/api/projects/{project_ref}/run-step/{step_id}")
def project_run_step(project_ref: str, step_id: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    project = resolve_project_by_ref(db, user, project_ref)
    if step_id not in POST_PROCESSING_STEPS:
        raise HTTPException(400, f"Unknown step: {step_id}")
    guard_error = get_step_guard(project, step_id)
    if guard_error:
        raise HTTPException(400, guard_error)
    config = POST_PROCESSING_STEPS[step_id]
    command = [sys.executable, str(settings.scripts_dir / config["script"]), str(project_path(project)), *config["args"]]
    result = RUNNER.run(project.id, command)
    project.updated_at = utcnow()
    db.commit()
    audit(db, user.id, "run_step", "project", project.id, {"step_id": step_id})
    payload = {"step": {"id": step_id, "label": config["label"]}, "project": build_project_summary(project), "command": result.command, "returncode": result.returncode, "stdout": result.stdout, "stderr": result.stderr}
    if result.returncode != 0:
        return JSONResponse(status_code=400, content=payload)
    return payload


@app.get("/files/projects/{project_id}/{file_path:path}")
def serve_project_file(project_id: str, file_path: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    project = resolve_project_by_ref(db, user, project_id)
    base = project_path(project)
    target = (base / file_path).resolve()
    try:
        target.relative_to(base.resolve())
    except ValueError as exc:
        raise HTTPException(404, "Not found") from exc
    if not target.exists() or not target.is_file():
        raise HTTPException(404, "Not found")
    mime_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    headers = {"Cache-Control": "no-store"} if mime_type in {"image/svg+xml", "text/plain", "text/markdown"} else None
    return FileResponse(target, media_type=mime_type, headers=headers)


@app.get("/files/templates/{template_id}/{file_name}")
def serve_template_file(template_id: str, file_name: str, user: User = Depends(require_user)):
    target = (settings.templates_dir / template_id / file_name).resolve()
    base = (settings.templates_dir / template_id).resolve()
    try:
        target.relative_to(base)
    except ValueError as exc:
        raise HTTPException(404, "Not found") from exc
    if not target.exists() or not target.is_file():
        raise HTTPException(404, "Not found")
    mime_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    return FileResponse(target, media_type=mime_type)
