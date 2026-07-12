"""Owner-only admin dashboard API: global stats, app log tail, config/health
sanity checks, and a way to rotate the Groq key without SSH-ing into the VM.

Everything here sits behind `require_admin` (see auth.py) — this is a
single-owner personal project, so there's no roles/permissions system, just
an ADMIN_EMAILS allowlist.
"""
import os
import time
import shutil

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from . import models, config
from .auth import require_admin
from .database import get_db
from .key_context import groq_client_for
from .services import langchain_chat as langchain_chat_module
from .services.vector_store import vector_store, VECTOR_STORE_FILE

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Process start time, used for the uptime figure in /overview. admin.py is
# imported by main.py while the app is being constructed, so this is a close
# enough proxy for "process started".
START_TIME = time.time()

LOG_DIR = "logs"
LOG_FILE = os.path.join(LOG_DIR, "app.log")


def _mask_key(key: str) -> str:
    """Never return a usable secret in a GET response — show only that a key
    is set, plus its last 4 characters, e.g. 'sk-...abcd'."""
    if not key:
        return ""
    if len(key) <= 4:
        return "*" * len(key)
    return f"{'*' * 3}...{key[-4:]}"


def _dir_size_bytes(path: str) -> int:
    total = 0
    if not os.path.isdir(path):
        return 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(root, name))
            except OSError:
                pass
    return total


def _sqlite_db_path() -> str:
    """Best-effort extraction of the file path from a `sqlite:///...` URL."""
    url = config.DATABASE_URL
    prefix = "sqlite:///"
    if url.startswith(prefix):
        return url[len(prefix):]
    return ""


# ----------------- OVERVIEW -----------------

@router.get("/overview")
def get_overview(db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    total_users = db.query(models.User).count()
    total_subjects = db.query(models.Subject).count()
    total_materials = db.query(models.Material).count()
    total_chat_messages = db.query(models.ChatMessage).count()
    total_mock_exams = db.query(models.MockExam).count()
    total_flashcards = db.query(models.Flashcard).count()
    total_quizzes = db.query(models.Quiz).count()

    db_path = _sqlite_db_path()
    db_size_bytes = os.path.getsize(db_path) if db_path and os.path.exists(db_path) else 0

    uploads_size_bytes = _dir_size_bytes("uploads")

    vector_doc_count = len(vector_store.documents)
    vector_store_size_bytes = os.path.getsize(VECTOR_STORE_FILE) if os.path.exists(VECTOR_STORE_FILE) else 0

    uptime_seconds = round(time.time() - START_TIME, 1)

    return {
        "total_users": total_users,
        "total_subjects": total_subjects,
        "total_materials": total_materials,
        "total_chat_messages": total_chat_messages,
        "total_mock_exams": total_mock_exams,
        "total_flashcards": total_flashcards,
        "total_quizzes": total_quizzes,
        "db_size_bytes": db_size_bytes,
        "uploads_size_bytes": uploads_size_bytes,
        "vector_store_doc_count": vector_doc_count,
        "vector_store_size_bytes": vector_store_size_bytes,
        "uptime_seconds": uptime_seconds,
    }


# ----------------- LOGS -----------------

@router.get("/logs")
def get_logs(lines: int = Query(200, ge=1, le=5000), current_user: models.User = Depends(require_admin)):
    """Tail of the application log file. main.py tees stdout/stderr into this
    file on startup, which captures the app's existing print()-based
    diagnostics for free — no `docker logs` / Docker-socket access needed."""
    if not os.path.exists(LOG_FILE):
        return {"lines": [], "total_lines": 0}
    try:
        with open(LOG_FILE, "r", encoding="utf-8", errors="ignore") as f:
            all_lines = f.readlines()
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to read log file: {e}")

    tail = all_lines[-lines:]
    return {
        "lines": [ln.rstrip("\n") for ln in tail],
        "total_lines": len(all_lines),
    }


# ----------------- HEALTH -----------------

@router.get("/health")
def get_health(db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    checks = {}

    checks["groq_api_key_set"] = bool(config.GROQ_API_KEY)
    checks["groq_api_key_2_set"] = bool(config.GROQ_API_KEY_2)
    # Groq clients are now built per-key on demand (key_context.groq_client_for),
    # not held as a singleton — "initialized" means the server key can produce one.
    try:
        checks["groq_client_initialized"] = bool(config.GROQ_API_KEY) and groq_client_for(config.GROQ_API_KEY) is not None
    except Exception:
        checks["groq_client_initialized"] = False

    try:
        db.execute(text("SELECT 1"))
        checks["database_reachable"] = True
    except Exception:
        checks["database_reachable"] = False

    try:
        data_dir = os.path.dirname(_sqlite_db_path()) or "."
        usage = shutil.disk_usage(data_dir if os.path.isdir(data_dir) else ".")
        checks["disk_free_bytes"] = usage.free
        checks["disk_total_bytes"] = usage.total
    except Exception:
        checks["disk_free_bytes"] = None
        checks["disk_total_bytes"] = None

    checks["cors_origins_configured"] = bool(config.CORS_ORIGINS)
    checks["admin_emails_configured"] = bool(config.ADMIN_EMAILS)

    all_ok = (
        checks["groq_api_key_set"]
        and checks["groq_client_initialized"]
        and checks["database_reachable"]
        and checks["admin_emails_configured"]
    )

    return {"ok": all_ok, "checks": checks}


# ----------------- CONFIG (view + update Groq keys) -----------------

@router.get("/config")
def get_config(current_user: models.User = Depends(require_admin)):
    return {
        "cors_origins": config.CORS_ORIGINS,
        "admin_emails": config.ADMIN_EMAILS,
        "groq_api_key_masked": _mask_key(config.GROQ_API_KEY),
        "groq_api_key_2_masked": _mask_key(config.GROQ_API_KEY_2),
        "groq_api_key_set": bool(config.GROQ_API_KEY),
        "groq_api_key_2_set": bool(config.GROQ_API_KEY_2),
    }


class UpdateConfigRequest(BaseModel):
    groq_api_key: str | None = None
    groq_api_key_2: str | None = None


@router.put("/config")
def update_config(payload: UpdateConfigRequest, current_user: models.User = Depends(require_admin)):
    """Persists the new key(s) to the runtime overrides file (survives a
    container restart) AND hot-reloads them into the running process — no
    restart required.

    The primary server key is now the single source of truth in `config`, read
    dynamically on every call via key_context.get_current_key(), so
    persist_groq_keys() alone applies it live. The only module-level snapshot
    left is langchain_chat's GROQ_API_KEY_2 (the trial rate-limit fallback),
    captured at import — so that one still needs patching here.
    """
    if payload.groq_api_key is None and payload.groq_api_key_2 is None:
        raise HTTPException(status_code=400, detail="Provide at least one of groq_api_key or groq_api_key_2")

    config.persist_groq_keys(payload.groq_api_key, payload.groq_api_key_2)

    # Hot-reload the trial fallback key that langchain_chat captured at import.
    langchain_chat_module.GROQ_API_KEY_2 = config.GROQ_API_KEY_2

    try:
        client_ok = bool(config.GROQ_API_KEY) and groq_client_for(config.GROQ_API_KEY) is not None
    except Exception:
        client_ok = False

    return {
        "message": "Groq key(s) saved and applied immediately — no restart needed.",
        "groq_api_key_masked": _mask_key(config.GROQ_API_KEY),
        "groq_api_key_2_masked": _mask_key(config.GROQ_API_KEY_2),
        "groq_client_initialized": client_ok,
    }
