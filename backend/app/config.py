import os
from dotenv import load_dotenv

load_dotenv()

# --- Runtime overrides (survive restarts, take priority over the base .env) ---
# The admin dashboard's "change Groq key" feature writes here instead of
# touching the container's real .env file. Loaded relative to the process cwd,
# which in Docker is WORKDIR /srv/finals-buddy/data — the persisted volume —
# so this file (like finals_buddy.db, uploads/, vector_store.json) survives
# `docker rm` + redeploy.
RUNTIME_OVERRIDES_PATH = os.getenv("RUNTIME_OVERRIDES_PATH", ".runtime_overrides.env")

# Snapshot the base env values *before* applying overrides, so an admin can
# clear an override later and fall back to whatever was baked into .env /
# passed via `docker run --env-file` at container start.
_BASE_ENV_GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
_BASE_ENV_GROQ_API_KEY_2 = os.getenv("GROQ_API_KEY_2", "")

if os.path.exists(RUNTIME_OVERRIDES_PATH):
    load_dotenv(RUNTIME_OVERRIDES_PATH, override=True)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./finals_buddy.db")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_API_KEY_2 = os.getenv("GROQ_API_KEY_2", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
PORT = int(os.getenv("PORT", "8000"))
HOST = os.getenv("HOST", "0.0.0.0")

# CORS: comma-separated list of extra allowed origins for the deployed frontend,
# e.g. CORS_ORIGINS="https://finals-buddy.vercel.app,https://finalsbuddy.me"
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]

# Admin dashboard access: comma-separated allowlist of account emails allowed
# to hit /api/admin/*. Single-owner project — a plain email allowlist, no
# roles/permissions system. Parsed the same way as CORS_ORIGINS above.
ADMIN_EMAILS = [o.strip().lower() for o in os.getenv("ADMIN_EMAILS", "").split(",") if o.strip()]


def persist_groq_keys(groq_api_key: str = None, groq_api_key_2: str = None) -> None:
    """Write the given Groq key(s) to the runtime overrides file (survives
    container restarts) and update this module's in-memory globals so the
    new value is visible immediately to anything that reads
    `config.GROQ_API_KEY` / `config.GROQ_API_KEY_2` afterwards.

    A parameter left as None is untouched. An empty string clears that key's
    override, falling back to whatever was in the base .env at startup.

    Note: this only updates *this module's* globals. Modules that did
    `from .config import GROQ_API_KEY` captured their own separate binding at
    import time and won't see the change automatically — the admin router
    patches those module-level names directly after calling this function.
    """
    global GROQ_API_KEY, GROQ_API_KEY_2

    overrides = {}
    if os.path.exists(RUNTIME_OVERRIDES_PATH):
        with open(RUNTIME_OVERRIDES_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                overrides[k.strip()] = v.strip()

    if groq_api_key is not None:
        if groq_api_key:
            overrides["GROQ_API_KEY"] = groq_api_key
        else:
            overrides.pop("GROQ_API_KEY", None)
    if groq_api_key_2 is not None:
        if groq_api_key_2:
            overrides["GROQ_API_KEY_2"] = groq_api_key_2
        else:
            overrides.pop("GROQ_API_KEY_2", None)

    with open(RUNTIME_OVERRIDES_PATH, "w", encoding="utf-8") as f:
        for k, v in overrides.items():
            f.write(f"{k}={v}\n")

    GROQ_API_KEY = overrides.get("GROQ_API_KEY", _BASE_ENV_GROQ_API_KEY)
    GROQ_API_KEY_2 = overrides.get("GROQ_API_KEY_2", _BASE_ENV_GROQ_API_KEY_2)
    os.environ["GROQ_API_KEY"] = GROQ_API_KEY
    os.environ["GROQ_API_KEY_2"] = GROQ_API_KEY_2

