import json
import re
from typing import List, Dict, Any
from ..key_context import get_current_key, groq_client_for
from ..errors import AIServiceError


def safe_parse_json(response: str) -> Any:
    """Parse JSON from an LLM response that may be wrapped in markdown code fences."""
    text = response.strip()
    # Strip ```json ... ``` or ``` ... ``` wrappers that some models add
    text = re.sub(r'^```[a-zA-Z]*\s*', '', text)
    text = re.sub(r'\s*```$', '', text.rstrip())
    return json.loads(text.strip())

def run_llm(system_prompt: str, user_prompt: str, response_format: str = "text") -> str:
    """Query Groq for a chat completion. Raises AIServiceError on any failure
    (missing key, API error) instead of ever falling back to fabricated content."""

    # Compress the pasted document/context text before it reaches Groq.
    # Only user_prompt (the raw material) is compressed, never system_prompt
    # (the agent's instructions) — several agents here (e.g. SummarizationAgent)
    # explicitly require exhaustive detail, so target_ratio is kept conservative
    # rather than headroom's aggressive ~15%-kept default.
    try:
        from headroom import compress as headroom_compress
        _compressed = headroom_compress(
            [{"role": "user", "content": user_prompt}],
            model="llama-3.3-70b-versatile",
            compress_user_messages=True,
            protect_recent=0,
            target_ratio=0.6,
        )
        if _compressed.tokens_saved > 0:
            print(f"  🗜️ Headroom: {_compressed.tokens_before} → {_compressed.tokens_after} tokens "
                  f"({_compressed.compression_ratio:.0%} saved) on run_llm() prompt.")
        user_prompt = _compressed.messages[0]["content"]
    except Exception as e:
        print(f"Headroom compression failed: {e}. Using uncompressed prompt.")

    # Resolve the key for THIS request: the user's own key, or the server key
    # during their free trial (set by key_context.ai_action on the endpoint).
    key = get_current_key()
    if not key:
        raise AIServiceError("AI features are unavailable: no Groq API key is configured.")
    groq_client = groq_client_for(key)

    try:
        # Standard versatile Groq reasoning model
        model = "llama-3.3-70b-versatile"

        kwargs = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.3,
        }
        if response_format == "json":
            kwargs["response_format"] = {"type": "json_object"}

        chat_completion = groq_client.chat.completions.create(**kwargs)
        return chat_completion.choices[0].message.content
    except Exception as e:
        raise AIServiceError(f"The AI request failed: {e}. Please try again in a moment.") from e

# 1. Summarization Agent
class SummarizationAgent:
    def process_material(self, name: str, text: str) -> Dict[str, Any]:
        """Summarizes document, extracts key concepts, difficulty, and exam importance."""
        truncated_text = text[:8000] # standard prompt limit
        system_prompt = (
            "You are a Senior Academic Summarization Agent. Perform an exhaustive, deep-dive academic digestion of the provided lecture/notes text. "
            "Your output MUST contain:\n"
            "1. An extremely extensive, detailed-to-the-point-of-absolute-completeness summary explaining every single technical detail, mechanism, formula, case study, algorithm, and conceptual point without skipping or glossing over anything.\n"
            "2. Beautiful, detailed structural systems diagrams drawn using inline Mermaid flowcharts (e.g. ```mermaid ... ```) representing structures, loops, pipelines, flowcharts, or system processes.\n"
            "3. Detailed ASCII-art visual schemas or layout plans inside ```diagram ... ``` blocks to clarify complex concepts (such as memory tables, register states, or CPU pipelines) where helpful.\n"
            "4. Annotations on every technical claim, section, concept, or process in this summary with a direct, precise citation tag linking to its original location in the source context (e.g. `[Slide 3]`, `[Page 7]`, or `[Section 1.2]`) derived from the text slide indicators or headers.\n"
            "5. A JSON array of key concepts containing 'concept', 'explanation' (explaining deeply with a precise citation tag e.g. `[Slide 5]`), and 'difficulty_weight' (1 to 5).\n"
            "6. An overall estimated learning complexity (1 to 5) and an estimated importance level for final exams (1 to 5).\n"
            "Return the response in strictly valid JSON format with keys: 'summary', 'key_concepts', 'learning_complexity', 'importance_level'."
        )
        user_prompt = f"Material Title: {name}\nContent:\n{truncated_text}"

        response = run_llm(system_prompt, user_prompt, response_format="json")
        try:
            return safe_parse_json(response)
        except (json.JSONDecodeError, ValueError) as e:
            raise AIServiceError("The AI returned a response that couldn't be parsed. Please try again.") from e

# 2. Planning & Recommendation Agent
class PlanningRecommendationAgent:
    def calculate_recommendations(self, subject: Any, tasks: List[Any]) -> List[Dict[str, Any]]:
        """
        Calculates recommendation score for each task.
        priority_score = (exam_urgency * 0.4) + (topic_importance * 0.3) + (low_confidence * 0.2) + (incompletion * 0.1)
        """
        import datetime

        # 1. Calculate exam urgency (days remaining)
        days_remaining = 14.0 # default to 2 weeks if no exam date
        if subject.exam_date:
            try:
                exam_dt = datetime.datetime.strptime(subject.exam_date, "%Y-%m-%d")
                delta = exam_dt - datetime.datetime.now()
                days_remaining = max(0.1, delta.days + (delta.seconds / 86400.0))
            except Exception:
                pass

        # Lower days remaining = higher urgency score (bounded 0 to 10)
        # 1 day = 10, 10 days = 2, 20 days = 1
        urgency_score = 10.0 if days_remaining <= 1 else max(1.0, 10.0 - (days_remaining * 0.8))

        recommendations = []
        for task in tasks:
            if task.status == "completed":
                continue

            # Importance score (defaults to subject difficulty or manual task priority, 1-5 scale mapped to 0-10)
            importance_score = task.importance_score if task.importance_score > 0 else float(subject.priority_level * 2)

            # Low confidence score: (100 - subject confidence) / 10
            low_confidence_score = (100.0 - subject.confidence_score) / 10.0

            # Incompletion: higher score if subject has very few tasks completed
            incompletion_score = 10.0 # simple default for now

            # Scoring Formula
            score = (urgency_score * 0.4) + (importance_score * 0.3) + (low_confidence_score * 0.2) + (incompletion_score * 0.1)

            # Generate actionable advice
            reason = "High urgency due to approaching exam."
            if low_confidence_score > 7:
                reason = "Focus is recommended because your confidence in this subject is currently low."
            elif importance_score > 8:
                reason = "This covers a high-importance fundamental topic."

            recommendations.append({
                "subject_id": subject.id,
                "task_id": task.id,
                "score": round(score * 10, 1), # Scale to 0-100 for presentation
                "reason": reason
            })

        # Sort by score descending
        recommendations.sort(key=lambda x: x["score"], reverse=True)
        return recommendations

# 3. Quiz & Flashcard Generation Agent
class QuizGenerationAgent:
    def generate_quiz_and_flashcards(self, material_name: str, text: str, summary: str = "") -> Dict[str, Any]:
        """Generates flashcards and multiple choice quizzes from text context and summary."""
        truncated_text = text[:4000]
        truncated_summary = summary[:4000]
        system_prompt = (
            "You are a Senior Academic Quiz and Active Recall Generation Agent. "
            "Based on the provided document text AND the detailed cited summary, generate a set of highly rigorous, concept-testing study materials.\n"
            "CRITICAL DIRECTIVES:\n"
            "1. You MUST use the detailed summary as your key reference to pull precise original slide/page citations (e.g. `[Slide 3]`, `[Page 8]`).\n"
            "2. For EVERY single generated flashcard front, you MUST explicitly include the bracketed source citation directly inside the question/concept front text (e.g. `'front': 'Explain virtual address offset mapping. [Slide 3]'`).\n"
            "3. For EVERY single generated multiple-choice quiz question, you MUST explicitly include the bracketed source citation directly inside the question text (e.g. `'question': 'Which page replacement algorithm exhibits Belady's Anomaly? [Slide 5]'`).\n"
            "4. For EVERY single quiz question, you MUST also generate a detailed 'explanation' field explaining why the correct answer is correct and citing the exact source context (e.g. `'explanation': 'Belady's Anomaly occurs in FIFO paging where adding page frames increases faults. [Slide 5]'`).\n\n"
            "Generate:\n"
            "- A list of 4 flashcards, each containing 'front' and 'back'.\n"
            "- A list of 3 multiple-choice quizzes, each containing 'question', 'options' (array of 4 choices), 'correct_answer' (matching one option exactly), and 'explanation'.\n"
            "Return the output in strictly valid JSON format with keys: 'flashcards', 'quizzes'."
        )
        user_prompt = (
            f"Material Title: {material_name}\n"
            f"Enriched Summary with Citations:\n{truncated_summary}\n\n"
            f"Raw Content Snippet:\n{truncated_text}"
        )

        response = run_llm(system_prompt, user_prompt, response_format="json")
        try:
            return safe_parse_json(response)
        except (json.JSONDecodeError, ValueError) as e:
            raise AIServiceError("The AI returned a response that couldn't be parsed. Please try again.") from e

    def generate_more_items(self, context_summary: str, existing_questions: List[str], item_type: str, count: int = 3) -> Dict[str, Any]:
        """Generates additional flashcards or quizzes while avoiding existing questions."""
        truncated_summary = context_summary[:6000]

        system_prompt = (
            f"You are a Senior Academic {item_type.capitalize()} Generation Agent. "
            "Based on the provided document summary, generate a set of highly rigorous, concept-testing study materials.\n"
            "CRITICAL DIRECTIVES:\n"
            "1. You MUST use the detailed summary as your key reference to pull precise original slide/page citations (e.g. `[Slide 3]`, `[Page 8]`).\n"
        )

        if item_type == 'flashcards':
            system_prompt += (
                "2. For EVERY single generated flashcard front, you MUST explicitly include the bracketed source citation directly inside the question/concept front text (e.g. `'front': 'Explain virtual address offset mapping. [Slide 3]'`).\n"
                f"3. Generate exactly {count} flashcards, each containing 'front' and 'back'.\n"
                "Return the output in strictly valid JSON format with the key: 'flashcards'.\n"
            )
        else:
            system_prompt += (
                "2. For EVERY single generated multiple-choice quiz question, you MUST explicitly include the bracketed source citation directly inside the question text.\n"
                "3. For EVERY single quiz question, you MUST also generate a detailed 'explanation' field explaining why the correct answer is correct and citing the exact source context.\n"
                f"4. Generate exactly {count} multiple-choice quizzes, each containing 'question', 'options' (array of 4 choices), 'correct_answer' (matching one option exactly), and 'explanation'.\n"
                "Return the output in strictly valid JSON format with the key: 'quizzes'.\n"
            )

        existing_prompt = ""
        if existing_questions:
            existing_str = "\n- ".join(existing_questions)
            existing_prompt = f"\n\nCRITICAL AVOIDANCE CONSTRAINT:\nDO NOT generate questions similar to the following existing items:\n- {existing_str}\n"

        user_prompt = (
            f"Enriched Summary with Citations:\n{truncated_summary}\n"
            f"{existing_prompt}"
        )

        response = run_llm(system_prompt, user_prompt, response_format="json")
        try:
            return safe_parse_json(response)
        except (json.JSONDecodeError, ValueError) as e:
            raise AIServiceError("The AI returned a response that couldn't be parsed. Please try again.") from e

# Instantiate global agents
summarizer_agent = SummarizationAgent()
planner_recommender_agent = PlanningRecommendationAgent()
quiz_agent = QuizGenerationAgent()

# 4. Mock Exam Agent
class MockExamAgent:
    def generate_mock_exam(self, subject_name: str, texts: List[str]) -> Dict[str, Any]:
        """Generates exactly 3 comprehensive open-ended final exam questions based on materials."""
        combined_text = "\n\n".join(texts)[:8000] if texts else ""
        system_prompt = (
            "You are an Exam Design Professor. Generate exactly 3 highly technical, conceptual, or analytical "
            "open-ended final exam questions suitable for a university-level final exam. "
            "For each question, also identify the general 'reference_source' topic name from the slides (e.g., 'Virtual Memory Paging'). "
            "Return the output in strictly valid JSON format with a single key 'questions' containing an array of objects "
            "with keys: 'question', 'reference_source'."
        )
        user_prompt = f"Subject Name: {subject_name}\nLecture materials text:\n{combined_text}"

        response = run_llm(system_prompt, user_prompt, response_format="json")
        try:
            return json.loads(response)
        except json.JSONDecodeError as e:
            raise AIServiceError("The AI returned a response that couldn't be parsed. Please try again.") from e

    def grade_mock_exam(self, questions_data: List[Dict[str, Any]], user_answers: List[str], texts: List[str]) -> Dict[str, Any]:
        """Grades typed answers against source materials using a constructive cognitive rubric."""
        combined_text = "\n\n".join(texts)[:6000] if texts else ""
        system_prompt = (
            "You are an Academic Exam Autograder. Compare the user's answer for each question against "
            "the provided lecture text contexts. Grade each answer out of 100 based on Fact Accuracy, "
            "Completeness, and proper Technical Terminology. Provide direct, encouraging, constructive feedback. "
            "Return the output in strictly valid JSON format with keys: 'overall_score' (float average), "
            "and 'graded_questions' (array of objects with keys: 'question_id', 'ai_grade' (float), 'ai_feedback' (string), "
            "'reference_source' (specific text or chapter slide source they should review if they lost points))."
        )

        exam_payload = []
        for idx, q in enumerate(questions_data):
            ans = user_answers[idx] if idx < len(user_answers) else "[No Answer Provided]"
            exam_payload.append({
                "question_id": q.get("id"),
                "question": q.get("question"),
                "user_answer": ans
            })

        user_prompt = f"Exam Data:\n{json.dumps(exam_payload)}\n\nCourse Notes Context:\n{combined_text}"

        response = run_llm(system_prompt, user_prompt, response_format="json")
        try:
            return json.loads(response)
        except json.JSONDecodeError as e:
            raise AIServiceError("The AI returned a response that couldn't be parsed. Please try again.") from e

# 5. Formula Extractor Agent
class FormulaExtractorAgent:
    def extract_formulas(self, subject_name: str, texts: List[str]) -> Dict[str, Any]:
        """Parses course texts to extract equations, variables, and step derivations."""
        combined_text = "\n\n".join(texts)[:6000] if texts else ""
        system_prompt = (
            "You are a Mathematical & Technical Parsing Agent. Extract all critical formulas, "
            "algorithmic expressions, or mathematical theorems from the lecture notes. "
            "For each formula, structure a LaTeX representation, a clear descriptive name, "
            "a JSON array of variables (each with key 'symbol' and 'meaning'), and "
            "a JSON array of derivation steps showing how to apply the formula. "
            "Return the output in strictly valid JSON format with a single key 'formulas' "
            "containing an array of objects with keys: 'name', 'latex_code', 'description', 'variables', 'derivation_steps'."
        )
        user_prompt = f"Subject Name: {subject_name}\nContent:\n{combined_text}"

        response = run_llm(system_prompt, user_prompt, response_format="json")
        try:
            return json.loads(response)
        except json.JSONDecodeError as e:
            raise AIServiceError("The AI returned a response that couldn't be parsed. Please try again.") from e

class DeepResearchAgent:
    def enrich_material(self, name: str, text: str) -> str:
        """Generates an extensive, highly intelligent research supplement for the material."""
        truncated_text = text[:9000]
        system_prompt = (
            "You are a Deep Research Agent specializing in academic curriculum analysis. "
            "Your goal is to read the lecture material text and compile an advanced, high-fidelity research supplement "
            "that fills gaps, uncovers deep technical implementation mechanics, warns about exam pitfalls, and explains real-world system deployments. "
            "You MUST structure the output in clean, gorgeous Github Markdown, utilizing beautiful Tip/Important alerts, code blocks, or ASCII flow diagrams if needed. "
            "Structure the sections exactly as follows:\n"
            "### ⚙️ Under-the-Hood Mechanics & Architecture Breakdown\n"
            "(Detail exactly how these concepts operate at a low-level, e.g. register states, memory layouts, CPU cycles, or mathematical foundations)\n\n"
            "### ⚠️ Exam Pitfalls & Tricky Conceptual Traps\n"
            "(List at least 3 conceptual errors or calculation traps students fall into during final exams, with correct explanations)\n\n"
            "### 🌐 Real-World Industry Deployments & Case Studies\n"
            "(Explain how this specific lecture concept is utilized in production systems, e.g. the Linux kernel, PostgreSQL buffers, modern CPU pipelines, or industry frameworks)"
        )
        user_prompt = f"Material Title: {name}\nContent:\n{truncated_text}"

        return run_llm(system_prompt, user_prompt, response_format="text")

class CurriculumMapperAgent:
    def generate_material_map(self, materials_info: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Scans all available material summaries and maps their conceptual connections."""
        system_prompt = (
            "You are a Curriculum Mapper Agent. Your goal is to analyze a list of lecture files and their summaries, "
            "and compute logical conceptual connections (edges) between them to form a Knowledge Graph.\n"
            "For each connection, you MUST identify:\n"
            "1. 'source_material_name': The exact name of the source material.\n"
            "2. 'target_material_name': The exact name of the target material that builds upon or connects to the source.\n"
            "3. 'connection_type': One of: 'Prerequisite' (source is required to learn target), 'Extension' (target extends source concepts), 'Foundational' (source lays foundational rules for target).\n"
            "4. 'description': A clear 1-2 sentence explanation of how these two lectures relate.\n"
            "Return your response in strictly valid JSON format with a single key 'connections' pointing to an array of these relationship objects."
        )
        user_prompt = f"Curriculum Lectures to Map:\n{json.dumps(materials_info, indent=2)}"

        response = run_llm(system_prompt, user_prompt, response_format="json")
        try:
            return json.loads(response)
        except json.JSONDecodeError as e:
            raise AIServiceError("The AI returned a response that couldn't be parsed. Please try again.") from e

mock_exam_agent = MockExamAgent()
formula_extractor_agent = FormulaExtractorAgent()
deep_research_agent = DeepResearchAgent()
curriculum_mapper_agent = CurriculumMapperAgent()
