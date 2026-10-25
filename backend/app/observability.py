"""Prometheus instrumentation for the RAG + LLM layer.

Why this module exists: the tutor pipeline already *handles* degradation
silently. It retries malformed tool calls at a higher temperature, swaps to a
backup Groq key on a rate limit, and falls back to a no-tools answer when
tool-calling can't be recovered. Every one of those paths produces an answer,
so from the outside the app looks healthy while quality quietly drops. These
metrics make those paths countable.

Everything here is defensive on purpose. A monitoring bug must never break a
student's request, so each recording helper swallows its own exceptions.
"""
import functools
import time
from collections import deque
from threading import Lock

from prometheus_client import Counter, Gauge, Histogram

# Cosine similarity lives in [0, 1] and most real matches land low, so the
# buckets are dense at the bottom where the signal actually is.
SIMILARITY_BUCKETS = (0.0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.7, 1.0)
LATENCY_BUCKETS = (0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0)

# ---- HTTP layer ----
http_requests_total = Counter(
    "fb_http_requests_total", "HTTP requests", ["method", "endpoint", "status"]
)
http_request_duration = Histogram(
    "fb_http_request_duration_seconds", "HTTP request duration", ["endpoint"],
    buckets=LATENCY_BUCKETS,
)

# ---- Retrieval (RAG) ----
rag_queries_total = Counter("fb_rag_queries_total", "Vector store queries run")
rag_zero_match_total = Counter(
    "fb_rag_zero_match_total",
    "Queries that returned no chunks at all, meaning the subject has no indexed material",
)
rag_empty_result_total = Counter(
    "fb_rag_empty_result_total",
    "Queries whose best match scored 0.0, meaning nothing in the corpus overlapped the question",
)
rag_top1_similarity = Histogram(
    "fb_rag_top1_similarity", "Cosine similarity of the best-matching chunk",
    buckets=SIMILARITY_BUCKETS,
)
rag_results_returned = Histogram(
    "fb_rag_results_returned", "Chunks returned per query",
    buckets=(0, 1, 2, 3, 4, 5, 6, 10),
)
rag_query_duration = Histogram(
    "fb_rag_query_duration_seconds", "Time spent inside vector store query",
    buckets=(0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1.0),
)
rag_corpus_documents = Gauge(
    "fb_rag_corpus_documents", "Chunks currently indexed in the vector store"
)

# ---- LLM agent ----
llm_runs_total = Counter(
    "fb_llm_runs_total", "Tutor agent runs by outcome", ["outcome"]
)
llm_duration = Histogram(
    "fb_llm_duration_seconds", "End-to-end tutor agent duration", buckets=LATENCY_BUCKETS
)
llm_tool_calls_total = Counter(
    "fb_llm_tool_calls_total", "Tool invocations by the agent", ["tool"]
)
llm_tool_validation_failures_total = Counter(
    "fb_llm_tool_validation_failures_total",
    "Groq rejected the model's tool call and it had to be retried at a higher temperature",
)
llm_no_tools_fallback_total = Counter(
    "fb_llm_no_tools_fallback_total",
    "Agent gave up on tools and answered without the student's materials",
)
llm_rate_limit_switch_total = Counter(
    "fb_llm_rate_limit_switch_total", "Rate limit forced a swap to the backup Groq key"
)
llm_search_limit_intercept_total = Counter(
    "fb_llm_search_limit_intercept_total",
    "Agent hit the hard 2-search cap and was told to answer from what it had",
)
llm_agent_iterations = Histogram(
    "fb_llm_agent_iterations", "Tool-calling loop iterations per run",
    buckets=(1, 2, 3, 4, 5),
)

# ---- Token economics ----
# Headroom used to sit here. Its compressor is a PyTorch model, torch was
# deliberately excluded from the image, so it silently compressed nothing
# while costing ~240MB of dependencies. It was removed; what stayed is the
# measurement, because RAG payload size is what actually drives token spend.
# One histogram, not a histogram plus a counter: its _sum is already the
# running total, and a Counter named *_total collides with the histogram's
# own series once prometheus_client normalises the name.
rag_payload_tokens = Histogram(
    "fb_rag_payload_tokens", "Estimated tokens of retrieved context per request",
    buckets=(100, 250, 500, 1000, 2000, 4000, 8000),
)

# ---- Answer quality feedback ----
tutor_feedback_total = Counter(
    "fb_tutor_feedback_total", "Student ratings of tutor answers", ["verdict"]
)
tutor_rolling_satisfaction = Gauge(
    "fb_tutor_rolling_satisfaction", "Share of positive ratings over the last 100 rated answers"
)

FEEDBACK_WINDOW = 100
_feedback = deque(maxlen=FEEDBACK_WINDOW)
_feedback_lock = Lock()


def safe(fn):
    """Metrics must never break a request. Swallow anything they raise."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception:
            return None
    return wrapper


@safe
def record_retrieval(results, duration: float, corpus_size: int):
    rag_queries_total.inc()
    rag_query_duration.observe(duration)
    rag_corpus_documents.set(corpus_size)
    rag_results_returned.observe(len(results))
    if not results:
        rag_zero_match_total.inc()
        return
    top1 = float(results[0][1])
    rag_top1_similarity.observe(top1)
    if top1 <= 0.0:
        rag_empty_result_total.inc()


@safe
def record_payload_tokens(text: str):
    """Rough token estimate for the retrieved context.

    Four characters per token is the usual English approximation. An exact
    count would mean shipping a tokenizer, which is most of what the removed
    dependency cost. This is accurate enough to watch a trend, which is all
    this number is used for.
    """
    rag_payload_tokens.observe(max(0, len(text) // 4))


@safe
def record_feedback(verdict: str):
    tutor_feedback_total.labels(verdict=verdict).inc()
    with _feedback_lock:
        _feedback.append(1 if verdict == "up" else 0)
        tutor_rolling_satisfaction.set(sum(_feedback) / len(_feedback))
