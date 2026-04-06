from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List


REPO_ROOT = Path(__file__).resolve().parent.parent
WEBAPP_DIR = Path(__file__).resolve().parent
STATIC_DIR = WEBAPP_DIR / "static"
SCRIPTS_DIR = REPO_ROOT / "skills" / "ppt-master" / "scripts"
EXAMPLES_DIR = REPO_ROOT / "examples"
TEMPLATES_DIR = REPO_ROOT / "skills" / "ppt-master" / "templates" / "layouts"


def _parse_bool(raw: str | None, default: bool) -> bool:
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _split_csv(raw: str | None, default: List[str]) -> List[str]:
    if not raw:
        return default
    return [part.strip() for part in raw.split(",") if part.strip()]


@dataclass(slots=True)
class Settings:
    auth_enabled: bool = field(default_factory=lambda: _parse_bool(os.environ.get("AUTH_ENABLED"), False))
    database_url: str = field(
        default_factory=lambda: os.environ.get(
            "DATABASE_URL",
            f"sqlite:///{(REPO_ROOT / '.webapp_data' / 'ppt_master.db').resolve()}",
        )
    )
    storage_root: Path = field(
        default_factory=lambda: Path(
            os.environ.get("PPT_MASTER_STORAGE_ROOT", str((REPO_ROOT / ".webapp_data" / "storage").resolve()))
        ).resolve()
    )
    session_cookie_name: str = field(default_factory=lambda: os.environ.get("SESSION_COOKIE_NAME", "ppt_master_session"))
    session_secret: str = field(default_factory=lambda: os.environ.get("SESSION_SECRET", "dev-session-secret-change-me"))
    app_encryption_key: str = field(default_factory=lambda: os.environ.get("APP_ENCRYPTION_KEY", "dev-encryption-key-change-me"))
    session_ttl_seconds: int = field(default_factory=lambda: int(os.environ.get("SESSION_TTL_SECONDS", "43200")))
    session_secure_cookie: bool = field(
        default_factory=lambda: _parse_bool(os.environ.get("SESSION_SECURE_COOKIE"), False)
    )
    auth_issuer_url: str = field(default_factory=lambda: os.environ.get("AUTHENTIK_ISSUER_URL", "").strip())
    auth_client_id: str = field(default_factory=lambda: os.environ.get("AUTHENTIK_CLIENT_ID", "").strip())
    auth_client_secret: str = field(default_factory=lambda: os.environ.get("AUTHENTIK_CLIENT_SECRET", "").strip())
    auth_scopes: List[str] = field(
        default_factory=lambda: _split_csv(os.environ.get("AUTHENTIK_SCOPES"), ["openid", "profile", "email"])
    )
    auth_sync_mode: str = field(default_factory=lambda: os.environ.get("AUTHENTIK_SYNC_MODE", "if_present").strip())
    admin_groups: List[str] = field(
        default_factory=lambda: _split_csv(os.environ.get("AUTHENTIK_ADMIN_GROUPS"), ["ppt-master-admins"])
    )
    web_host: str = field(default_factory=lambda: os.environ.get("PPT_MASTER_WEB_HOST", "127.0.0.1"))
    web_port: int = field(default_factory=lambda: int(os.environ.get("PPT_MASTER_WEB_PORT", "8765")))
    public_base_url: str = field(default_factory=lambda: os.environ.get("PPT_MASTER_PUBLIC_BASE_URL", "").rstrip("/"))
    mock_user_email: str = field(default_factory=lambda: os.environ.get("PPT_MASTER_MOCK_USER_EMAIL", "local-admin@example.com"))
    mock_user_name: str = field(default_factory=lambda: os.environ.get("PPT_MASTER_MOCK_USER_NAME", "Local Admin"))
    local_admin_email: str = field(default_factory=lambda: os.environ.get("PPT_MASTER_LOCAL_ADMIN_EMAIL", "").strip())
    local_admin_password: str = field(default_factory=lambda: os.environ.get("PPT_MASTER_LOCAL_ADMIN_PASSWORD", "").strip())
    local_admin_name: str = field(default_factory=lambda: os.environ.get("PPT_MASTER_LOCAL_ADMIN_NAME", "").strip())
    legacy_projects_dir: Path = field(default_factory=lambda: (REPO_ROOT / "projects").resolve())
    examples_dir: Path = field(default_factory=lambda: EXAMPLES_DIR.resolve())
    templates_dir: Path = field(default_factory=lambda: TEMPLATES_DIR.resolve())
    scripts_dir: Path = field(default_factory=lambda: SCRIPTS_DIR.resolve())
    static_dir: Path = field(default_factory=lambda: STATIC_DIR.resolve())
    repo_root: Path = field(default_factory=lambda: REPO_ROOT.resolve())

    @property
    def callback_url(self) -> str:
        if self.public_base_url:
            return f"{self.public_base_url}/auth/callback"
        return f"http://{self.web_host}:{self.web_port}/auth/callback"


_SETTINGS: Settings | None = None


def get_settings() -> Settings:
    global _SETTINGS
    if _SETTINGS is None:
        _SETTINGS = Settings()
        _SETTINGS.storage_root.mkdir(parents=True, exist_ok=True)
        if _SETTINGS.database_url.startswith("sqlite:///"):
            db_path = Path(_SETTINGS.database_url.removeprefix("sqlite:///"))
            db_path.parent.mkdir(parents=True, exist_ok=True)
    return _SETTINGS
