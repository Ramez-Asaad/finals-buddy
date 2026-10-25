"""Retrieval quality gate.

Unit tests prove the retriever runs. They do not prove it retrieves the RIGHT
chunk, which is the only thing a student actually experiences. This file is a
golden set: fixed questions, each with the chunk that should come back first.
It runs in CI and fails the build when retrieval quality drops below the
thresholds at the bottom, so a prompt tweak or a chunking change cannot
silently degrade the tutor.

The corpus here is synthetic and committed on purpose. Evaluating against the
live vector store would make the test drift every time a student uploads a
file, and a test whose expected answer moves is not a test.
"""
import pytest

from app.services.vector_store import SimpleVectorStore

CORPUS = [
    ("photosynthesis-1", "Photosynthesis converts light energy into chemical energy. "
     "Chlorophyll in the thylakoid membrane absorbs photons, driving the light-dependent reactions "
     "that produce ATP and NADPH."),
    ("photosynthesis-2", "The Calvin cycle fixes carbon dioxide using RuBisCO. "
     "It consumes the ATP and NADPH made in the light reactions to build glucose."),
    ("mitosis-1", "Mitosis divides one nucleus into two identical daughter nuclei. "
     "The phases are prophase, metaphase, anaphase and telophase, followed by cytokinesis."),
    ("mitosis-2", "During metaphase chromosomes align along the metaphase plate, "
     "and spindle fibres attach to kinetochores before the sister chromatids separate."),
    ("osmosis-1", "Osmosis is the movement of water across a semipermeable membrane "
     "from low solute concentration toward high solute concentration."),
    ("respiration-1", "Cellular respiration breaks down glucose to release ATP. "
     "Glycolysis occurs in the cytoplasm, then the Krebs cycle and electron transport chain "
     "occur in the mitochondria."),
]

# question -> the chunk id that should rank first
GOLDEN = [
    ("What does chlorophyll do with photons?", "photosynthesis-1"),
    ("Which enzyme fixes carbon dioxide in the Calvin cycle?", "photosynthesis-2"),
    ("What are the four phases of mitosis?", "mitosis-1"),
    ("Where do chromosomes line up during metaphase?", "mitosis-2"),
    ("How does water move across a semipermeable membrane?", "osmosis-1"),
    ("Where does glycolysis happen?", "respiration-1"),
    ("What produces ATP and NADPH in the light reactions?", "photosynthesis-1"),
    ("What attaches to kinetochores?", "mitosis-2"),
]

PRECISION_AT_1_FLOOR = 0.75
RECALL_AT_3_FLOOR = 0.875


@pytest.fixture
def store():
    """A store populated in memory. Documents are assigned directly rather than
    through add_document, which would write to the real vector_store.json."""
    s = SimpleVectorStore()
    s.documents = [
        {"text": text, "metadata": {"name": doc_id, "subject_id": 1, "chunk_index": i}}
        for i, (doc_id, text) in enumerate(CORPUS)
    ]
    s.embeddings = [[] for _ in CORPUS]
    return s


def _ranked_ids(store, question, k):
    return [doc["metadata"]["name"] for doc, _ in store.query(question, {"subject_id": 1}, k=k)]


def test_precision_at_1(store):
    """The top result is the one the student sees cited first."""
    hits = sum(_ranked_ids(store, q, 1)[:1] == [expected] for q, expected in GOLDEN)
    precision = hits / len(GOLDEN)
    assert precision >= PRECISION_AT_1_FLOOR, (
        f"precision@1 {precision:.2f} fell below the {PRECISION_AT_1_FLOOR} floor"
    )


def test_recall_at_3(store):
    """The agent reads several chunks, so the right one being in the top 3 still helps."""
    hits = sum(expected in _ranked_ids(store, q, 3) for q, expected in GOLDEN)
    recall = hits / len(GOLDEN)
    assert recall >= RECALL_AT_3_FLOOR, (
        f"recall@3 {recall:.2f} fell below the {RECALL_AT_3_FLOOR} floor"
    )


def test_subject_isolation(store):
    """A student must never retrieve another subject's material."""
    assert store.query("photosynthesis", {"subject_id": 999}, k=5) == []


def test_unrelated_question_scores_low(store):
    """An off-topic question should not produce a confident match. This is the
    signal behind the zero-match and low-similarity metrics in production."""
    results = store.query("What is the exchange rate of the Japanese yen?", {"subject_id": 1}, k=1)
    assert not results or results[0][1] < 0.15


def test_empty_corpus_returns_nothing():
    s = SimpleVectorStore()
    s.documents = []
    s.embeddings = []
    assert s.query("anything", {"subject_id": 1}, k=3) == []
