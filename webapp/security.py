from __future__ import annotations

import base64
import hashlib
import json
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Any

from cryptography.fernet import Fernet
from passlib.context import CryptContext

from .settings import get_settings


def utcnow() -> datetime:
    return datetime.utcnow()


def session_expiry(ttl_seconds: int) -> datetime:
    return utcnow() + timedelta(seconds=ttl_seconds)


def new_uuid() -> str:
    return str(uuid.uuid4())


def random_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def slugify(value: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in value.strip())
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return cleaned.strip("-")[:120] or "project"


def json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def json_loads(raw: str | None, default: Any) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return default


def mask_api_key(api_key: str) -> str:
    if not api_key:
        return ""
    return f"{api_key[:4]}...{api_key[-4:]}" if len(api_key) > 8 else "configured"


def _fernet_key() -> bytes:
    settings = get_settings()
    digest = hashlib.sha256(settings.app_encryption_key.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt_secret(value: str) -> str:
    if not value:
        return ""
    return Fernet(_fernet_key()).encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_secret(value: str) -> str:
    if not value:
        return ""
    return Fernet(_fernet_key()).decrypt(value.encode("utf-8")).decode("utf-8")


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return _pwd_context.verify(password, password_hash)
    except Exception:
        return False
