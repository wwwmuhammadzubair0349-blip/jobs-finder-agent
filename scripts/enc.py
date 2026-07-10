"""
Shared AES-256-GCM encryption for stored secrets (e.g. users' Gmail app
passwords). Key = SHA-256(AUTH_SECRET). Format: base64(iv[12] + ciphertext).
Must stay byte-compatible with webapp/functions/_shared/enc.js.
"""

from __future__ import annotations

import envload  # noqa: F401
import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_SECRET = os.getenv("AUTH_SECRET", "").strip()


def _key() -> bytes:
    if not _SECRET:
        raise RuntimeError("AUTH_SECRET not set")
    return hashlib.sha256(_SECRET.encode()).digest()


def encrypt(plain: str) -> str:
    iv = os.urandom(12)
    ct = AESGCM(_key()).encrypt(iv, plain.encode(), None)
    return base64.b64encode(iv + ct).decode()


def decrypt(token: str) -> str:
    raw = base64.b64decode(token)
    return AESGCM(_key()).decrypt(raw[:12], raw[12:], None).decode()
