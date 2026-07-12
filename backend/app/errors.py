class AIServiceError(Exception):
    """Raised when an AI-generation call fails or Groq is not configured.
    Caught by a global FastAPI handler and turned into a clean 503 for the client."""
