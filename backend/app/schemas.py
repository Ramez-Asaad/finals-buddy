from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

# Subject Schemas
class SubjectBase(BaseModel):
    name: str
    exam_date: Optional[str] = None
    priority_level: Optional[int] = 3
    difficulty: Optional[int] = 3
    confidence_score: Optional[float] = 50.0

class SubjectCreate(SubjectBase):
    pass

class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    exam_date: Optional[str] = None
    priority_level: Optional[int] = None
    difficulty: Optional[int] = None
    confidence_score: Optional[float] = None

class SubjectOut(SubjectBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# Material Schemas
class NoteBase(BaseModel):
    title: str
    content: Optional[str] = None

class NoteCreate(NoteBase):
    pass

class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None

class NoteOut(NoteBase):
    id: int
    subject_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class MaterialBase(BaseModel):
    name: str
    file_type: str
    file_path: Optional[str] = None
    summary: Optional[str] = None
    key_concepts: Optional[str] = None # JSON string
    learning_complexity: Optional[int] = 3
    importance_level: Optional[int] = 3
    deep_research_summary: Optional[str] = None

class MaterialCreate(MaterialBase):
    subject_id: int

class MaterialOut(MaterialBase):
    id: int
    subject_id: int
    created_at: datetime
    job_id: Optional[str] = None

    class Config:
        from_attributes = True

# Task Schemas
class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    duration_minutes: Optional[int] = 30
    urgency_score: Optional[float] = 0.0
    importance_score: Optional[float] = 0.0
    status: Optional[str] = "pending"
    due_date: Optional[str] = None

class TaskCreate(TaskBase):
    subject_id: int

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    urgency_score: Optional[float] = None
    importance_score: Optional[float] = None
    status: Optional[str] = None
    due_date: Optional[str] = None
    completed_at: Optional[datetime] = None

class TaskOut(TaskBase):
    id: int
    subject_id: int
    completed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

# StudySession Schemas
class StudySessionBase(BaseModel):
    title: Optional[str] = "Deep Focus Session"
    duration_minutes: int
    focus_score: Optional[int] = 3
    notes: Optional[str] = None

class StudySessionCreate(StudySessionBase):
    subject_id: int
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None

class StudySessionOut(StudySessionBase):
    id: int
    subject_id: int
    start_time: datetime
    end_time: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

# Quiz Schemas
class QuizBase(BaseModel):
    question: str
    correct_answer: str
    options: Optional[str] = None # JSON string list
    type: Optional[str] = "multiple_choice"
    explanation: Optional[str] = None # Detailed cited explanation for review

class QuizCreate(QuizBase):
    subject_id: int
    material_id: Optional[int] = None

class QuizOut(QuizBase):
    id: int
    subject_id: int
    material_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True

class QuizAnswerRequest(BaseModel):
    user_answer: str

class QuizAnswerResponse(BaseModel):
    is_correct: bool
    correct_answer: str
    explanation: Optional[str] = None

# Flashcard Schemas
class FlashcardBase(BaseModel):
    front: str
    back: str
    box: Optional[int] = 1
    next_review_date: Optional[str] = None
    confidence: Optional[float] = 50.0
    material_id: Optional[int] = None

class FlashcardCreate(FlashcardBase):
    subject_id: int

class FlashcardUpdate(BaseModel):
    front: Optional[str] = None
    back: Optional[str] = None
    box: Optional[int] = None
    material_id: Optional[int] = None

class GenerateMoreRequest(BaseModel):
    item_type: str # 'flashcards' or 'quizzes'
    material_id: Optional[int] = None
    count: Optional[int] = 3

class FlashcardOut(FlashcardBase):
    id: int
    subject_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class FlashcardReviewRequest(BaseModel):
    is_correct: bool # True if correctly recalled (moves to box+1), False otherwise (resets to box 1)

# Recommendation Schemas
class RecommendationOut(BaseModel):
    id: int
    subject_id: int
    task_id: Optional[int] = None
    score: float
    reason: Optional[str] = None
    is_dismissed: bool
    created_at: datetime
    task: Optional[TaskOut] = None

    class Config:
        from_attributes = True

# Dashboard summary schema
class SubjectDashboardOut(BaseModel):
    id: int
    name: str
    exam_date: Optional[str] = None
    priority_level: int
    difficulty: int
    confidence_score: float
    materials_count: int
    completion_percentage: float
    hours_remaining: float
    weak_topics: List[str]
    next_recommended_action: Optional[str] = None
    urgency_status: str # 'low', 'medium', 'high', 'critical'

# Material Update Schema
class MaterialUpdate(BaseModel):
    name: Optional[str] = None
    learning_complexity: Optional[int] = None
    importance_level: Optional[int] = None

# ChatMessage Schemas
class ChatMessageBase(BaseModel):
    role: str
    content: str

class ChatMessageCreate(ChatMessageBase):
    pass

class ChatMessageOut(ChatMessageBase):
    id: int
    subject_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class ChatMessageUpdate(BaseModel):
    content: str


# ----------------- PHASE 2 UPGRADES -----------------

class MockExamQuestionOut(BaseModel):
    id: int
    mock_exam_id: int
    question: str
    user_answer: Optional[str] = None
    ai_grade: Optional[float] = None
    ai_feedback: Optional[str] = None
    reference_source: Optional[str] = None

    class Config:
        from_attributes = True

class MockExamOut(BaseModel):
    id: int
    subject_id: int
    score: float
    duration_seconds: int
    completed_at: Optional[str] = None
    status: str
    created_at: datetime
    questions: List[MockExamQuestionOut]

    class Config:
        from_attributes = True

class MockExamAnswerSubmit(BaseModel):
    question_id: int
    user_answer: str

class MockExamSubmitRequest(BaseModel):
    duration_seconds: int
    answers: List[MockExamAnswerSubmit]

class FormulaOut(BaseModel):
    id: int
    subject_id: int
    name: str
    latex_code: str
    description: Optional[str] = None
    variables_json: Optional[str] = None
    derivation_steps_json: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class ResourceConnectionOut(BaseModel):
    id: int
    subject_id: int
    source_material_id: int
    target_material_id: int
    connection_type: str
    description: Optional[str] = None

    class Config:
        from_attributes = True

class KnowledgeMapOut(BaseModel):
    nodes: List[MaterialOut]
    edges: List[ResourceConnectionOut]


