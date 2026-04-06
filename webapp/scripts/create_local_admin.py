from __future__ import annotations

import argparse

from sqlalchemy import select, text

from webapp.database import SessionLocal, engine
from webapp.models import User
from webapp.security import hash_password, json_dumps, utcnow


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or update a local admin user")
    parser.add_argument("--email", required=True, help="Admin email address")
    parser.add_argument("--password", required=True, help="Admin password (min 6 chars)")
    parser.add_argument("--display-name", default="", help="Display name (optional)")
    args = parser.parse_args()

    email = args.email.strip().lower()
    if "@" not in email:
        raise SystemExit("Invalid email")
    if len(args.password) < 6:
        raise SystemExit("Password too short")

    subject = f"local:{email}"
    username = email.split("@")[0]
    display_name = args.display_name.strip() or username

    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(users)")).fetchall()
        columns = {row[1] for row in rows}
        if "password_hash" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN password_hash TEXT"))
            conn.commit()

    db = SessionLocal()
    try:
        user = db.execute(select(User).where(User.subject == subject)).scalar_one_or_none()
        if user is None:
            user = User(
                id=str(__import__("uuid").uuid4()),
                auth_provider="local",
                subject=subject,
                email=email,
                username=username,
                display_name=display_name,
                role="admin",
                groups_json=json_dumps(["local-admin"]),
                last_login_at=utcnow(),
                password_hash=hash_password(args.password),
                is_active=True,
            )
            db.add(user)
        else:
            user.email = email
            user.username = username
            user.display_name = display_name
            user.role = "admin"
            user.groups_json = json_dumps(["local-admin"])
            user.password_hash = hash_password(args.password)
            user.is_active = True
            user.last_login_at = utcnow()
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
