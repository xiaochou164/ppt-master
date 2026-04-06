#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from sqlalchemy import select

from webapp.app import create_project_directory, get_or_create_mock_user, get_user_storage_root
from webapp.database import SessionLocal
from webapp.models import ImageModelProfile, Project, TextModelProfile, User
from webapp.security import encrypt_secret, new_uuid, slugify
from webapp.settings import get_settings


settings = get_settings()
TEXT_FILE = settings.repo_root / ".ppt_master_text_models.json"
IMAGE_FILE = settings.repo_root / ".ppt_master_image_models.json"


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def ensure_target_user(db, email: str | None, display_name: str | None) -> User:
    if not email:
        return get_or_create_mock_user(db)
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user:
        return user
    username = email.split("@")[0]
    user = User(
        id=new_uuid(),
        auth_provider="migration",
        subject=f"migration:{email}",
        email=email,
        username=username,
        display_name=display_name or username,
        role="admin",
        groups_json='["migration-admin"]',
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def import_text_profiles(db, user: User) -> int:
    payload = load_json(TEXT_FILE)
    count = 0
    for item in payload.get("profiles", []):
        if not item.get("api_key"):
            continue
        profile = TextModelProfile(
            id=new_uuid(),
            owner_user_id=user.id,
            name=str(item.get("name") or f"text-profile-{count + 1}"),
            backend=str(item.get("backend") or "openai"),
            base_url=str(item.get("base_url") or ""),
            model=str(item.get("model") or ""),
            api_key_encrypted=encrypt_secret(str(item.get("api_key") or "")),
            is_default=count == 0,
        )
        db.add(profile)
        count += 1
    db.commit()
    return count


def import_image_profiles(db, user: User) -> int:
    payload = load_json(IMAGE_FILE)
    count = 0
    for item in payload.get("profiles", []):
        if not item.get("api_key"):
            continue
        profile = ImageModelProfile(
            id=new_uuid(),
            owner_user_id=user.id,
            name=str(item.get("name") or f"image-profile-{count + 1}"),
            backend=str(item.get("backend") or "gemini"),
            base_url=str(item.get("base_url") or ""),
            model=str(item.get("model") or ""),
            api_key_encrypted=encrypt_secret(str(item.get("api_key") or "")),
            is_default=count == 0,
        )
        db.add(profile)
        count += 1
    db.commit()
    return count


def import_projects(db, user: User) -> int:
    legacy_root = settings.legacy_projects_dir
    if not legacy_root.exists():
        return 0
    count = 0
    for legacy_project_dir in sorted(path for path in legacy_root.iterdir() if path.is_dir()):
        project_id = new_uuid()
        base_slug = slugify(legacy_project_dir.name)
        slug = base_slug
        index = 2
        while db.execute(select(Project).where(Project.owner_user_id == user.id, Project.slug == slug)).scalar_one_or_none():
            slug = f"{base_slug}-{index}"
            index += 1
        project = Project(
            id=project_id,
            owner_user_id=user.id,
            name=legacy_project_dir.name,
            slug=slug,
            canvas_format="ppt169",
            storage_path=str(get_user_storage_root(user) / project_id),
            status="active",
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        create_project_directory(project)
        shutil.copytree(legacy_project_dir, Path(project.storage_path), dirs_exist_ok=True)
        count += 1
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description="Import legacy local web console data into the new multi-user store.")
    parser.add_argument("--email", help="Target admin email. Defaults to mock local admin when omitted.")
    parser.add_argument("--name", help="Target display name.")
    args = parser.parse_args()

    with SessionLocal() as db:
        user = ensure_target_user(db, args.email, args.name)
        imported_text = import_text_profiles(db, user)
        imported_image = import_image_profiles(db, user)
        imported_projects = import_projects(db, user)
        print(f"Target user: {user.email} ({user.id})")
        print(f"Imported text profiles: {imported_text}")
        print(f"Imported image profiles: {imported_image}")
        print(f"Imported projects: {imported_projects}")


if __name__ == "__main__":
    main()
