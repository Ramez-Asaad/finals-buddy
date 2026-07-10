import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./finals_buddy.db")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_API_KEY_2 = os.getenv("GROQ_API_KEY_2", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
PORT = int(os.getenv("PORT", "8000"))
HOST = os.getenv("HOST", "0.0.0.0")

# Ollama Integration config - defaults to cloud endpoint
OLLAMA_API_BASE = os.getenv("OLLAMA_API_BASE", "https://ollama.com")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "glm-4.6:cloud")
OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "")

# CORS: comma-separated list of extra allowed origins for the deployed frontend,
# e.g. CORS_ORIGINS="https://finals-buddy.vercel.app,https://finalsbuddy.me"
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]

