"""Authentication: PBKDF2 password hashing + HMAC-signed bearer tokens.

Deliberately dependency-free (hashlib/hmac/secrets only) so the Docker image
stays small and builds fast on the 1GB free-tier VM. Token format:
    base64url(json payload) . hex(hmac_sha256(secret, payload_b64))
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .database import get_db
from . import models
from .config import ADMIN_EMAILS

TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30  # 30 days
PBKDF2_ITERATIONS = 260_000


def _load_secret() -> str:
    """SECRET_KEY from env, else a generated one persisted next to the DB so
    sessions survive container restarts."""
    env = os.getenv("SECRET_KEY", "").strip()
    if env:
        return env
    path = ".auth_secret"
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                stored = f.read().strip()
                if stored:
                    return stored
        generated = secrets.token_hex(32)
        with open(path, "w", encoding="utf-8") as f:
            f.write(generated)
        return generated
    except OSError:
        # Read-only filesystem edge case: fall back to per-boot secret
        return secrets.token_hex(32)


SECRET_KEY = _load_secret()


# ---------- passwords ----------

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt), PBKDF2_ITERATIONS
    ).hex()
    return f"pbkdf2${PBKDF2_ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt, digest = stored.split("$")
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt), int(iterations)
        ).hex()
        return hmac.compare_digest(candidate, digest)
    except (ValueError, AttributeError):
        return False


# ---------- tokens ----------

def _b64e(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64d(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def create_token(user_id: int) -> str:
    payload = _b64e(json.dumps({"uid": user_id, "exp": int(time.time()) + TOKEN_TTL_SECONDS}).encode())
    sig = hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def decode_token(token: str):
    """Returns user_id or None."""
    try:
        payload_b64, sig = token.rsplit(".", 1)
        expected = hmac.new(SECRET_KEY.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(_b64d(payload_b64))
        if payload.get("exp", 0) < time.time():
            return None
        return payload.get("uid")
    except (ValueError, json.JSONDecodeError):
        return None


# ---------- FastAPI dependency ----------

def get_current_user(request: Request, db: Session = Depends(get_db)) -> models.User:
    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:] if auth_header.startswith("Bearer ") else None
    if not token:
        # EventSource can't set headers — allow ?token= as a fallback carrier
        token = request.query_params.get("token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = decode_token(token)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Account no longer exists")
    return user


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    """Gate for the owner-only admin dashboard: 403s unless the authenticated
    user's email is in the ADMIN_EMAILS allowlist. This is a single-owner
    personal project, not a multi-tenant SaaS — a plain email allowlist is
    intentionally used instead of a roles/permissions system."""
    if user.email.lower() not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
