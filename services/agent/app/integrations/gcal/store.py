import json
import os
from pathlib import Path
from typing import Protocol

from cryptography.fernet import Fernet


class TokenStore(Protocol):
    def save(self, user_id: str, data: dict) -> None: ...
    def load(self, user_id: str) -> dict | None: ...
    def delete(self, user_id: str) -> None: ...


def fernet() -> Fernet:
    return Fernet(os.environ["SECRET_KEY"].encode())


class FileTokenStore:
    """Dev-only store; swap for a Neon-backed calendar_connections store."""

    def __init__(self, path: str = ".data/gcal_tokens.json"):
        self.path = Path(path)

    def _read(self) -> dict:
        return json.loads(self.path.read_text()) if self.path.exists() else {}

    def save(self, user_id: str, data: dict) -> None:
        rows = self._read()
        rows[user_id] = fernet().encrypt(json.dumps(data).encode()).decode()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(rows))

    def load(self, user_id: str) -> dict | None:
        token = self._read().get(user_id)
        return json.loads(fernet().decrypt(token.encode())) if token else None

    def delete(self, user_id: str) -> None:
        rows = self._read()
        rows.pop(user_id, None)
        self.path.write_text(json.dumps(rows))
