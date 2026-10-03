import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[4]


def test_schemas_not_stale():
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / "export_contracts.py"), "--check"],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr


def test_health(monkeypatch):
    monkeypatch.setenv("SCHEDULER_ENABLED", "false")
    from app.core.config import settings
    settings.cache_clear()
    from app.main import app
    with TestClient(app) as c:
        body = c.get("/health").json()
    assert body["ok"] is True and body["db"] is False
