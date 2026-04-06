#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

try:
    import uvicorn
except ModuleNotFoundError as exc:  # pragma: no cover - startup guard
    message = (
        "Missing dependency: uvicorn\n"
        "Use the project virtualenv or install requirements first.\n\n"
        "Recommended:\n"
        "  .venv/bin/python webapp/server.py\n\n"
        "Or install dependencies:\n"
        "  python3 -m pip install -r requirements.txt\n"
    )
    raise SystemExit(message) from exc


CURRENT_DIR = Path(__file__).resolve().parent
REPO_ROOT = CURRENT_DIR.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from webapp.app import app  # noqa: E402
from webapp.settings import get_settings  # noqa: E402


def main() -> None:
    settings = get_settings()
    uvicorn.run(
        app,
        host=settings.web_host,
        port=settings.web_port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
