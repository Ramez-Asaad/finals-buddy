export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api";

export interface Subject {
  id: number;
  name: string;
  exam_date?: string;
  priority_level: number;
  difficulty: number;
  confidence_score: number;
  created_at: string;
}

export interface SubjectDashboard {
  id: number;
  name: string;
  exam_date?: string;
  priority_level: number;
  difficulty: number;
  confidence_score: number;
  materials_count: number;
  completion_percentage: number;
  hours_remaining: number;
  weak_topics: string[];
  next_recommended_action?: string;
  urgency_status: 'low' | 'medium' | 'high' | 'critical';
}

export interface Material {
  id: number;
  subject_id: number;
  name: string;
  file_type: string;
  file_path?: string;
  summary?: string;
  key_concepts?: string; // JSON string
  learning_complexity: number;
  importance_level: number;
  deep_research_summary?: string;
  created_at: string;
  job_id?: string;
}

export interface Task {
  id: number;
  subject_id: number;
  title: string;
  description?: string;
  duration_minutes: number;
  urgency_score: number;
  importance_score: number;
  status: 'pending' | 'completed';
  due_date?: string;
  completed_at?: string;
  created_at: string;
}

export interface StudySession {
  id: number;
  subject_id: number;
  title?: string;
  start_time: string;
  end_time?: string;
  duration_minutes: number;
  focus_score: number;
  notes?: string;
  created_at: string;
}

export interface Note {
  id: number;
  subject_id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Quiz {
  id: number;
  subject_id: number;
  material_id?: number;
  question: string;
  options?: string; // JSON string array
  correct_answer: string;
  type: string;
  created_at: string;
}

export interface Flashcard {
  id: number;
  subject_id: number;
  material_id?: number;
  front: string;
  back: string;
  box: number;
  next_review_date?: string;
  confidence: number;
  created_at: string;
}

export interface Recommendation {
  id: number;
  subject_id: number;
  task_id?: number;
  score: number;
  reason?: string;
  is_dismissed: boolean;
  created_at: string;
  task?: Task;
}

export interface ChatMessage {
  id: number;
  subject_id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export const api = {
  async getDashboardSummary() {
    const res = await fetch(`${API_BASE}/dashboard/summary`);
    if (!res.ok) throw new Error("Failed to load dashboard summary");
    return res.json();
  },

  async getRecommendations(): Promise<Recommendation[]> {
    const res = await fetch(`${API_BASE}/dashboard/recommendations`);
    if (!res.ok) throw new Error("Failed to load recommendations");
    return res.json();
  },

  async getSubjects(): Promise<Subject[]> {
    const res = await fetch(`${API_BASE}/subjects`);
    if (!res.ok) throw new Error("Failed to load subjects");
    return res.json();
  },

  async getSubject(id: number): Promise<SubjectDashboard> {
    const res = await fetch(`${API_BASE}/subjects/${id}`);
    if (!res.ok) throw new Error("Failed to load subject detail");
    return res.json();
  },

  async createSubject(name: string, exam_date?: string, priority_level = 3, difficulty = 3): Promise<Subject> {
    const res = await fetch(`${API_BASE}/subjects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, exam_date, priority_level, difficulty }),
    });
    if (!res.ok) throw new Error("Failed to create subject");
    return res.json();
  },

  async deleteSubject(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/subjects/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete subject");
  },

  async uploadMaterial(subjectId: number, file: File): Promise<Material> {
    const formData = new FormData();
    formData.append("subject_id", subjectId.toString());
    formData.append("file", file);

    const res = await fetch(`${API_BASE}/materials/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to upload file");
    }
    return res.json();
  },

  async getMaterials(subjectId: number): Promise<Material[]> {
    const res = await fetch(`${API_BASE}/subjects/${subjectId}/materials`);
    if (!res.ok) throw new Error("Failed to load materials");
    return res.json();
  },

  async getTasks(subjectId: number): Promise<Task[]> {
    const res = await fetch(`${API_BASE}/subjects/${subjectId}/tasks`);
    if (!res.ok) throw new Error("Failed to load tasks");
    return res.json();
  },

  async createTask(task: Partial<Task>): Promise<Task> {
    const res = await fetch(`${API_BASE}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    });
    if (!res.ok) throw new Error("Failed to create task");
    return res.json();
  },

  async updateTask(taskId: number, status: 'pending' | 'completed'): Promise<Task> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error("Failed to update task");
    return res.json();
  },

  async createStudySession(sessionId: number, duration: number, focus: number, notes?: string, title?: string): Promise<StudySession> {
    const res = await fetch(`${API_BASE}/study-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject_id: sessionId, duration_minutes: duration, focus_score: focus, notes, title }),
    });
    if (!res.ok) throw new Error("Failed to log study session");
    return res.json();
  },

  async getFlashcards(subjectId: number): Promise<Flashcard[]> {
    const res = await fetch(`${API_BASE}/subjects/${subjectId}/flashcards`);
    if (!res.ok) throw new Error("Failed to load flashcards");
    return res.json();
  },

  async reviewFlashcard(cardId: number, isCorrect: boolean): Promise<Flashcard> {
    const res = await fetch(`${API_BASE}/flashcards/${cardId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_correct: isCorrect }),
    });
    if (!res.ok) throw new Error("Failed to review flashcard");
    return res.json();
  },

  async getQuizzes(subjectId: number): Promise<Quiz[]> {
    const res = await fetch(`${API_BASE}/subjects/${subjectId}/quizzes`);
    if (!res.ok) throw new Error("Failed to load quizzes");
    return res.json();
  },

  async submitQuizAnswer(quizId: number, answer: string) {
    const res = await fetch(`${API_BASE}/quizzes/${quizId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_answer: answer }),
    });
    if (!res.ok) throw new Error("Failed to grade answer");
    return res.json();
  },

  async tutorChat(subjectId: number, query: string, mode = "standard") {
    const formData = new FormData();
    formData.append("subject_id", subjectId.toString());
    formData.append("query", query);
    formData.append("mode", mode);

    const res = await fetch(`${API_BASE}/tutor/chat`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Failed to query tutor");
    return res.json();
  },

  async getNotes(subjectId: number): Promise<Note[]> {
    const res = await fetch(`${API_BASE}/subjects/${subjectId}/notes`);
    if (!res.ok) throw new Error("Failed to fetch notes");
    return res.json();
  },

  async createNote(subjectId: number, title: string, content: string = ""): Promise<Note> {
    const res = await fetch(`${API_BASE}/subjects/${subjectId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    if (!res.ok) throw new Error("Failed to create note");
    return res.json();
  },

  async updateNote(noteId: number, data: { title?: string, content?: string }): Promise<Note> {
    const res = await fetch(`${API_BASE}/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update note");
    return res.json();
  },

  async deleteNote(noteId: number): Promise<void> {
    const res = await fetch(`${API_BASE}/notes/${noteId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete note");
  },

  async uploadFile(file: File): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Failed to upload file");
    return res.json();
  },

  async updateSubject(id: number, data: Partial<Subject>): Promise<Subject> {
    const res = await fetch(`${API_BASE}/subjects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update subject");
    return res.json();
  },

  async updateMaterial(id: number, data: { name?: string, learning_complexity?: number, importance_level?: number }): Promise<Material> {
    const res = await fetch(`${API_BASE}/materials/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update material");
    return res.json();
  },

  async deleteMaterial(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/materials/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete material");
  },

  async getChatHistory(subjectId: number): Promise<ChatMessage[]> {
    const res = await fetch(`${API_BASE}/subjects/${subjectId}/chats`);
    if (!res.ok) throw new Error("Failed to load chat history");
    return res.json();
  },

  async updateChatMessage(messageId: number, content: string): Promise<ChatMessage> {
    const res = await fetch(`${API_BASE}/chats/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error("Failed to update chat message");
    return res.json();
  },

  async clearChatHistory(subjectId: number): Promise<void> {
    const res = await fetch(`${API_BASE}/subjects/${subjectId}/chats`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to clear chat history");
  },

  async getMockExams(subjectId: number): Promise<MockExam[]> {
    const res = await fetch(`${API_BASE}/subjects/${subjectId}/mock-exams`);
    if (!res.ok) throw new Error("Failed to load mock exams");
    return res.json();
  },

  async createMockExam(subjectId: number): Promise<MockExam> {
    const res = await fetch(`${API_BASE}/subjects/${subjectId}/mock-exams`, {
      method: "POST"
    });
    if (!res.ok) throw new Error("Failed to create mock exam");
    return res.json();
  },

  async submitMockExam(examId: number, durationSeconds: number, answers: { question_id: number, user_answer: string }[]): Promise<MockExam> {
    const res = await fetch(`${API_BASE}/mock-exams/${examId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duration_seconds: durationSeconds, answers }),
    });
    if (!res.ok) throw new Error("Failed to submit mock exam");
    return res.json();
  },

  async getFormulas(subjectId: number): Promise<Formula[]> {
    const res = await fetch(`${API_BASE}/subjects/${subjectId}/formulas`);
    if (!res.ok) throw new Error("Failed to load formulas");
    return res.json();
  },

  async addFormulaNote(formulaId: number, note: string): Promise<{ description: string }> {
    const res = await fetch(`${API_BASE}/formulas/${formulaId}/note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    if (!res.ok) throw new Error("Failed to save formula note");
    return res.json();
  },

  async createFlashcard(subjectId: number, front: string, back: string): Promise<Flashcard> {
    const res = await fetch(`${API_BASE}/subjects/${subjectId}/flashcards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ front, back }),
    });
    if (!res.ok) throw new Error("Failed to create flashcard");
    return res.json();
  },

  async updateFlashcard(cardId: number, data: Partial<{ front: string; back: string; box: number; material_id: number | null }>): Promise<Flashcard> {
    const res = await fetch(`${API_BASE}/flashcards/${cardId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update flashcard");
    return res.json();
  },

  async deleteFlashcard(cardId: number): Promise<void> {
    const res = await fetch(`${API_BASE}/flashcards/${cardId}`, {
      method: "DELETE"
    });
    if (!res.ok) throw new Error("Failed to delete flashcard");
  },

  async getKnowledgeMap(subjectId: number): Promise<KnowledgeMap> {
    const res = await fetch(`${API_BASE}/subjects/${subjectId}/map`);
    if (!res.ok) throw new Error("Failed to load curriculum map");
    return res.json();
  },

  async generateMoreActiveRecall(subjectId: number, type: 'flashcards' | 'quizzes', materialId: number | 'all', count: number = 3): Promise<any[]> {
    const payload: any = { item_type: type, count };
    if (materialId !== 'all') {
      payload.material_id = materialId;
    }
    const res = await fetch(`${API_BASE}/subjects/${subjectId}/generate-more`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Failed to generate more ${type}`);
    return res.json();
  },

  async generateKnowledgeMap(subjectId: number): Promise<KnowledgeMap> {
    const res = await fetch(`${API_BASE}/subjects/${subjectId}/generate-map`, {
      method: "POST"
    });
    if (!res.ok) throw new Error("Failed to generate curriculum map");
    return res.json();
  }
};

export interface MockExamQuestion {
  id: number;
  mock_exam_id: number;
  question: string;
  user_answer?: string;
  ai_grade?: number;
  ai_feedback?: string;
  reference_source?: string;
}

export interface MockExam {
  id: number;
  subject_id: number;
  score: number;
  duration_seconds: number;
  completed_at?: string;
  status: 'in_progress' | 'graded';
  created_at: string;
  questions: MockExamQuestion[];
}

export interface Formula {
  id: number;
  subject_id: number;
  name: string;
  latex_code: string;
  description?: string;
  variables_json?: string;
  derivation_steps_json?: string;
  created_at: string;
}

export interface ResourceConnection {
  id: number;
  subject_id: number;
  source_material_id: number;
  target_material_id: number;
  connection_type: string;
  description?: string;
}

export interface KnowledgeMap {
  nodes: Material[];
  edges: ResourceConnection[];
}

