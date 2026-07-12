import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # BYOK (bring-your-own-key): a user's personal Groq API key, Fernet-encrypted
    # at rest (see key_context.py). NULL = still on the free trial, using the
    # server's key. `trial_requests_used` counts AI-generation actions consumed
    # against the free-trial allowance; ignored once a personal key is set.
    groq_api_key_encrypted = Column(Text, nullable=True)
    trial_requests_used = Column(Integer, default=0, nullable=False)

    subjects = relationship("Subject", back_populates="user", cascade="all, delete-orphan")

class Subject(Base):
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String, nullable=False)
    exam_date = Column(String, nullable=True) # ISO Date string or text
    priority_level = Column(Integer, default=3) # 1-5
    difficulty = Column(Integer, default=3) # 1-5
    confidence_score = Column(Float, default=50.0) # 0-100%
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    materials = relationship("Material", back_populates="subject", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="subject", cascade="all, delete-orphan")
    sessions = relationship("StudySession", back_populates="subject", cascade="all, delete-orphan")
    quizzes = relationship("Quiz", back_populates="subject", cascade="all, delete-orphan")
    flashcards = relationship("Flashcard", back_populates="subject", cascade="all, delete-orphan")
    recommendations = relationship("Recommendation", back_populates="subject", cascade="all, delete-orphan")
    chats = relationship("ChatMessage", back_populates="subject", cascade="all, delete-orphan")
    mock_exams = relationship("MockExam", back_populates="subject", cascade="all, delete-orphan")
    formulas = relationship("Formula", back_populates="subject", cascade="all, delete-orphan")
    resource_connections = relationship("ResourceConnection", back_populates="subject", cascade="all, delete-orphan")
    notes = relationship("Note", back_populates="subject", cascade="all, delete-orphan")
    user = relationship("User", back_populates="subjects")

class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, default="Untitled Note")
    content = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    subject = relationship("Subject", back_populates="notes")

class Material(Base):
    __tablename__ = "materials"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    file_type = Column(String, nullable=False) # 'pdf', 'docx', 'txt', etc.
    file_path = Column(String, nullable=True)
    summary = Column(Text, nullable=True)
    key_concepts = Column(Text, nullable=True) # JSON array of concepts
    learning_complexity = Column(Integer, default=3) # 1-5
    importance_level = Column(Integer, default=3) # 1-5
    deep_research_summary = Column(Text, nullable=True) # enriched analysis by deep summarizer agent
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    subject = relationship("Subject", back_populates="materials")
    quizzes = relationship("Quiz", back_populates="material", cascade="all, delete-orphan")

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    duration_minutes = Column(Integer, default=30)
    urgency_score = Column(Float, default=0.0)
    importance_score = Column(Float, default=0.0)
    status = Column(String, default="pending") # 'pending', 'completed'
    due_date = Column(String, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    subject = relationship("Subject", back_populates="tasks")
    recommendation = relationship("Recommendation", back_populates="task", cascade="all, delete-orphan", uselist=False)

class StudySession(Base):
    __tablename__ = "study_sessions"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=True)
    start_time = Column(DateTime, default=datetime.datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    duration_minutes = Column(Integer, default=0)
    focus_score = Column(Integer, default=3) # 1-5
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    subject = relationship("Subject", back_populates="sessions")

class Quiz(Base):
    __tablename__ = "quizzes"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    material_id = Column(Integer, ForeignKey("materials.id", ondelete="CASCADE"), nullable=True)
    question = Column(Text, nullable=False)
    correct_answer = Column(Text, nullable=False)
    options = Column(Text, nullable=True) # JSON array of options for multiple choice
    type = Column(String, default="multiple_choice") # 'multiple_choice', 'open_ended'
    explanation = Column(Text, nullable=True) # AI-generated cited explanation
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    subject = relationship("Subject", back_populates="quizzes")
    material = relationship("Material", back_populates="quizzes")

class Flashcard(Base):
    __tablename__ = "flashcards"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    material_id = Column(Integer, ForeignKey("materials.id", ondelete="CASCADE"), nullable=True)
    front = Column(Text, nullable=False)
    back = Column(Text, nullable=False)
    box = Column(Integer, default=1) # Leitner Box 1 to 5
    next_review_date = Column(String, nullable=True) # ISO Date string
    confidence = Column(Float, default=50.0) # last recorded confidence or user performance
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    subject = relationship("Subject", back_populates="flashcards")
    material = relationship("Material")

class Recommendation(Base):
    __tablename__ = "recommendations"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True)
    score = Column(Float, default=0.0)
    reason = Column(String, nullable=True)
    is_dismissed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    subject = relationship("Subject", back_populates="recommendations")
    task = relationship("Task", back_populates="recommendation")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False) # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    subject = relationship("Subject", back_populates="chats")

class MockExam(Base):
    __tablename__ = "mock_exams"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    score = Column(Float, default=0.0)
    duration_seconds = Column(Integer, default=0)
    completed_at = Column(String, nullable=True)
    status = Column(String, default="in_progress") # 'in_progress', 'graded'
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    subject = relationship("Subject", back_populates="mock_exams")
    questions = relationship("MockExamQuestion", back_populates="exam", cascade="all, delete-orphan")

class MockExamQuestion(Base):
    __tablename__ = "mock_exam_questions"

    id = Column(Integer, primary_key=True, index=True)
    mock_exam_id = Column(Integer, ForeignKey("mock_exams.id", ondelete="CASCADE"), nullable=False)
    question = Column(Text, nullable=False)
    user_answer = Column(Text, nullable=True)
    ai_grade = Column(Float, nullable=True)
    ai_feedback = Column(Text, nullable=True)
    reference_source = Column(String, nullable=True)

    exam = relationship("MockExam", back_populates="questions")

class Formula(Base):
    __tablename__ = "formulas"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    latex_code = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    variables_json = Column(Text, nullable=True) # JSON string representing dictionary/list of variables
    derivation_steps_json = Column(Text, nullable=True) # JSON string representing steps
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    subject = relationship("Subject", back_populates="formulas")

class ResourceConnection(Base):
    __tablename__ = "resource_connections"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    source_material_id = Column(Integer, ForeignKey("materials.id", ondelete="CASCADE"), nullable=False)
    target_material_id = Column(Integer, ForeignKey("materials.id", ondelete="CASCADE"), nullable=False)
    connection_type = Column(String, nullable=False) # 'Prerequisite', 'Extension', 'Foundational', etc.
    description = Column(Text, nullable=True) # AI explained connection

    subject = relationship("Subject", back_populates="resource_connections")
    source_material = relationship("Material", foreign_keys=[source_material_id])
    target_material = relationship("Material", foreign_keys=[target_material_id])
