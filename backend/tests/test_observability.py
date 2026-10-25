"""Tests for the metrics layer.

The point of most of these is that instrumentation stays out of the way: a
broken metric must never surface as a failed request for a student.
"""
from prometheus_client import generate_latest

from app.observability import record_feedback, record_payload_tokens, record_retrieval


def _metrics_text():
    return generate_latest().decode()


def test_retrieval_records_similarity_and_corpus_size():
    record_retrieval([({"text": "a"}, 0.52), ({"text": "b"}, 0.21)], 0.01, 129)
    body = _metrics_text()
    assert "fb_rag_queries_total" in body
    assert "fb_rag_corpus_documents 129.0" in body


def test_zero_match_is_counted_separately_from_weak_match():
    """A query with no chunks at all and a query whose best chunk scored zero
    are different failures: one means nothing was uploaded, the other means
    nothing in the material overlapped the question."""
    before = _metrics_text()
    record_retrieval([], 0.002, 129)
    record_retrieval([({"text": "x"}, 0.0)], 0.002, 129)
    after = _metrics_text()
    assert before != after
    assert "fb_rag_zero_match_total" in after
    assert "fb_rag_empty_result_total" in after


def test_payload_tokens_recorded():
    record_payload_tokens("x" * 4000)
    assert "fb_rag_payload_tokens" in _metrics_text()


def test_payload_tokens_handles_empty_text():
    record_payload_tokens("")


def test_feedback_updates_rolling_satisfaction():
    for _ in range(3):
        record_feedback("up")
    record_feedback("down")
    assert "fb_tutor_rolling_satisfaction" in _metrics_text()


def test_recording_never_raises_on_bad_input():
    """The safe() wrapper is the contract: metrics are a side channel and must
    not be able to break a student's request."""
    record_retrieval(None, "not-a-number", None)
    record_payload_tokens(None)
    record_feedback(None)
