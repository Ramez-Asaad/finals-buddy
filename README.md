# Finals Buddy: AI-Powered Finals Preparation Assistant

Finals Buddy is a premium, adaptive university finals study companion and academic coach built using **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS**, and **FastAPI** with **SQLite** and **Groq/OpenAI** models.

The system ingests lecture slides, PDFs, notes, and lab sheets, parses text chunks, extracts key concepts, dynamically constructs custom Leitner flashcards and active-recall quizzes, schedules study tasks, and offers specialized RAG tutoring mode selections.

---

## 🚀 Key Features

1. **AI Material Ingestion**: Upload course materials (`.pdf`, `.docx`, `.txt`) to generate structured topic maps, learning complexity indicators, and custom Leitner flashcards automatically.
2. **Adaptive Study Planner**: Custom task checklists that dynamically adjust priority ratings as final exam dates approach.
3. **Agentic Recommendation Engine**: Recommends the highest ROI task to work on next, calculating a custom priority score:
   $$\text{Score} = (\text{Exam Urgency} \times 0.4) + (\text{Topic Importance} \times 0.3) + ((100 - \text{Confidence}) \times 0.2) + (\text{Incompletion} \times 0.1)$$
4. **AI RAG Tutor**: Converse with your materials under custom mode adjustments:
   - *Standard*: Detailed academic answers.
   - *Teach Me Like I'm 5*: Extremely supportive, step-by-step simple terms.
   - *Analogies*: Grounded in concrete real-world comparisons.
5. **Smart Spaced Repetition**: Spaced active recall reviews using standard Leitner Box increments (1, 2, 3, 4, 5 days intervals).
6. **Distraction-Free Focus Mode**: Full-screen study canvas with built-in Pomodoro clock and brown noise sound generator.

---

## 🛠️ Tech Stack & Setup

### Requirements
- **Node.js**: v18+ (tested on v24)
- **Python**: v3.9+ (tested on v3.13)

### 1. Backend Server Setup
Navigate to the `backend/` folder:
```bash
cd backend
```

Create a virtual environment and activate it:
```bash
python -m venv venv
# On Windows Powershell
.\venv\Scripts\Activate.ps1
```

Install backend dependencies:
```bash
pip install -r requirements.txt
```

Create a `.env` file in the `backend/` directory:
```env
DATABASE_URL=sqlite:///./finals_buddy.db
GROQ_API_KEY=your-groq-api-key-here
OPENAI_API_KEY=your-openai-api-key-here
```
> **Note**: If you don't configure API keys, the backend automatically runs in a local-only deterministic mock mode, making the entire application fully browsable, interactive, and functional immediately!

Start the FastAPI application:
```bash
python -m uvicorn app.main:app --reload --port 8000
```
FastAPI Swagger documentation will be available at: [http://localhost:8000/docs](http://localhost:8000/docs).

---

### 2. Frontend Next.js Setup
Navigate to the `frontend/` folder:
```bash
cd ../frontend
```

Install dependencies:
```bash
npm install
```

Start the local development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to start preparation.

---

## 📂 Project Architecture

```
finals-buddy/
├── backend/
│   ├── app/
│   │   ├── main.py              # Central FastAPI endpoints
│   │   ├── config.py            # Environment configurations
│   │   ├── database.py          # SQLAlchemy Session mapping
│   │   ├── models.py            # Database tables
│   │   ├── schemas.py           # Pydantic schema validation
│   │   ├── services/
│   │   │   ├── vector_store.py  # Vector index and embeddings
│   │   │   └── agents.py        # Multi-agent orchestrators
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/                 
│   │   │   ├── page.tsx         # Global linear dashboard
│   │   │   ├── layout.tsx       # Fonts and dark mode HTML configs
│   │   │   └── subject/         
│   │   │       └── [id]/        
│   │   │           └── page.tsx # Interactive Subject Portal
│   │   ├── lib/
│   │   │   └── api.ts           # Fetch API client integration
│   ├── package.json
│   └── tailwind.config.ts
└── README.md
```
