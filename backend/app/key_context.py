"""BYOK (bring-your-own-key) + free-trial gating.

The whole app used to share one server-side Groq key for every visitor, so a
few power users could burn through the owner's credits. This module adds a
freemium model instead:

  - Every new account gets FREE_TRIAL_LIMIT AI-generation actions on the
    server's key.
  - After that they must save their own Groq API key (encrypted at rest) to
    keep using AI features — from then on their calls hit *their* Groq account,
    not the server's, with no cap.

Threading a per-request key through the ~9 agent methods and the LangChain
tutor loop would be invasive, because the Groq clients are module-level
singletons built once at import. Instead we stash the resolved key in a
`contextvars.ContextVar` for the duration of the request; `agents.run_llm` and
`langchain_chat.run_langchain_chat` read it via `get_current_key()`.
`contextvars` are per-thread/per-task, so this is safe under FastAPI's sync
threadpool and async workers alike.
"""
import base64
import contextvars
import hashlib
from contextlib import contextmanager

import groq
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException

from . import config
from .auth import SECRET_KEY

# Free AI-generation actions before a personal key is required.
FREE_TRIAL_LIMIT = 5

# Fernet key derived from the app's existing auth secret, so there is no new
# secret to provision or rotate. SHA-256 gives the 32 bytes Fernet expects.
_fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(SECRET_KEY.encode()).digest()))

# The key in force for the current request. None until an endpoint sets it.
_current_key: contextvars.ContextVar = contextvars.ContextVar("groq_key", default=None)


# ─── Encryption ──────────────────────────────────────────────────────────────

def encrypt_key(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt_key(ciphertext: str | None) -> str | None:
    if not ciphertext:
        return None
    try:
        return _fernet.decrypt(ciphertext.encode()).decode()
    except (InvalidToken, ValueError):
        return None


def mask_key(plaintext: str) -> str:
    """A safe hint for the UI — never the full key. e.g. 'gsk_…4f9a'."""
    if not plaintext:
        return ""
    tail = plaintext[-4:]
    head = plaintext[:4] if len(plaintext) > 8 else ""
    return f"{head}…{tail}" if head else f"…{tail}"


# ─── Request key resolution ──────────────────────────────────────────────────

def get_current_key() -> str:
    """The Groq key the current request should use: the per-request key if an
    endpoint set one, otherwise the server key (covers un-gated paths like
    dashboard recommendations)."""
    return _current_key.get() or config.GROQ_API_KEY


def is_server_key(key: str) -> bool:
    """True when `key` is the server's own key (i.e. trial mode). Used to scope
    the GROQ_API_KEY_2 rate-limit fallback to trial users only — a personal key
    must never silently fall back onto the owner's account."""
    return bool(key) and key == config.GROQ_API_KEY


# ─── Per-key Groq client cache ───────────────────────────────────────────────

_clients: dict = {}


def groq_client_for(key: str) -> groq.Groq:
    """Return a cached `groq.Groq` for `key`, building it on first use. Avoids
    rebuilding a client on every call while still supporting many distinct
    per-user keys."""
    client = _clients.get(key)
    if client is None:
        client = groq.Groq(api_key=key)
        _clients[key] = client
    return client


# ─── Trial gate ──────────────────────────────────────────────────────────────

def personal_key_for(user) -> str | None:
    return decrypt_key(getattr(user, "groq_api_key_encrypted", None))


def resolve_key_and_gate(user, count: bool = True):
    """Gate-check + key resolution without touching the contextvar or counter.
    Returns (key, is_trial). Raises 402 if the trial is used up, 503 if no key
    is available at all. Use this for the background-ingestion path, where the
    AI work happens on another thread after the response is sent, so the
    request contextvar can't carry over — pass the returned key explicitly.
    """
    personal = personal_key_for(user)
    is_trial = personal is None
    used = getattr(user, "trial_requests_used", 0) or 0

    if is_trial and count and used >= FREE_TRIAL_LIMIT:
        raise HTTPException(
            status_code=402,
            detail="Free trial used up. Add your own Groq API key in Account settings to keep using AI features.",
        )
    key = personal or config.GROQ_API_KEY
    if not key:
        raise HTTPException(
            status_code=503,
            detail="AI features are unavailable: no Groq API key is configured.",
        )
    return key, is_trial


@contextmanager
def set_request_key(key: str):
    """Bind `key` as the current request's Groq key for the duration of the
    block, then restore. For threads that run outside the original request
    (e.g. BackgroundTasks ingestion)."""
    token = _current_key.set(key)
    try:
        yield
    finally:
        _current_key.reset(token)


def increment_trial(db, user_id: int) -> None:
    """Consume one free-trial action for the given user, by id, in `db`."""
    from . import models
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is not None:
        user.trial_requests_used = (user.trial_requests_used or 0) + 1
        db.commit()


@contextmanager
def ai_action(user, db, count: bool = True):
    """Resolve the Groq key for this user, enforce the free-trial cap, and run
    the wrapped AI work under that key.

    - Personal key set   → use it, no cap, never counted.
    - Trial, under cap    → use the server key; on success, increment the
                            trial counter (only when `count=True`).
    - Trial, at/over cap  → 402 so the frontend can prompt for a key.

    The counter is incremented only if the wrapped block completes without
    raising, so a failed generation never burns a trial action. Pass
    `count=False` for auto-fired paths (e.g. recommendations) that should use
    the resolved key but neither gate nor consume the allowance.
    """
    personal = personal_key_for(user)
    is_trial = personal is None
    used = getattr(user, "trial_requests_used", 0) or 0

    if is_trial and count and used >= FREE_TRIAL_LIMIT:
        raise HTTPException(
            status_code=402,
            detail="Free trial used up. Add your own Groq API key in Account settings to keep using AI features.",
        )

    key = personal or config.GROQ_API_KEY
    if not key:
        raise HTTPException(
            status_code=503,
            detail="AI features are unavailable: no Groq API key is configured.",
        )

    token = _current_key.set(key)
    try:
        yield
        # Reached only when the wrapped AI work succeeded.
        if is_trial and count:
            user.trial_requests_used = used + 1
            db.commit()
    finally:
        _current_key.reset(token)


# ─── Key validation ──────────────────────────────────────────────────────────

def validate_groq_key(key: str) -> bool:
    """Cheap liveness check for a user-supplied key: list models (no token
    spend). Returns True if the key authenticates."""
    try:
        groq.Groq(api_key=key).models.list()
        return True
    except Exception:
        return False
