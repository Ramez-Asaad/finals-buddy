"""
Hybrid Token-Compressing RAG Chat.

Architecture:
- The Brain: Groq (llama-3.3-70b-versatile) handles tool-calling and reasoning.
- The Compressor: Local Ollama (llama3.2) reads massive RAG chunks and summarizes them
  to save Groq tokens and reduce cloud cost.
"""
import json
import traceback
from typing import Dict, Any, List

from langchain_groq import ChatGroq
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool

from .vector_store import vector_store
from ..config import GROQ_API_KEY, GROQ_API_KEY_2


# ─── Global Tool Context ─────────────────────────────────────────────────────

_tool_context: Dict[str, Any] = {}


# ─── Tools ───────────────────────────────────────────────────────────────────

@tool
def search_course_materials(query: str) -> str:
    """Search the student's uploaded course materials (lectures, slides, textbooks) for relevant content. 
    Use this tool whenever the student asks an academic question about their course topics.
    The tool returns a dense summary of the relevant facts."""
    
    subject_id = _tool_context.get("subject_id")
    if subject_id is None:
        return "No subject context available. Cannot search materials."

    print(f"  🔍 RAG Search: Querying vector store for '{query}'...")
    matches = vector_store.query(
        query_text=query,
        filter_metadata={"subject_id": subject_id},
        k=6
    )

    if not matches:
        return "No relevant course materials found. The student may not have uploaded materials for this topic."

    # Build the raw chunks string
    raw_chunks = []
    sources_seen = set()
    for idx, (doc, similarity) in enumerate(matches):
        source_name = doc["metadata"].get("name", "Unknown")
        chunk_idx = doc["metadata"].get("chunk_index", "?")
        text_preview = doc["text"][:800]
        raw_chunks.append(f"[Source {idx+1}: {source_name} (chunk {chunk_idx})]\n{text_preview}")
        sources_seen.add(source_name)

    _tool_context["last_sources"] = list(sources_seen)
    raw_text_payload = "\n\n---\n\n".join(raw_chunks)

    # ─── The Token Compressor (Local Llama 3.2) ───
    # We ask the local model to read the massive payload and summarize it.
    print(f"  🗜️ Token Compressor: Local model summarizing {len(raw_text_payload)} chars of raw chunks...")
    try:
        compressor = ChatOllama(
            model="llama3.2",
            base_url="http://localhost:11434",
            temperature=0.0,
            num_ctx=4096,
        )
        
        compress_prompt = f"""You are a data extraction assistant.
A user asked about: "{query}"

Here are raw excerpts from their textbooks and lectures:
{raw_text_payload}

INSTRUCTIONS:
Extract ONLY the facts relevant to the user's query from the excerpts above.
Ignore irrelevant information. Do not add outside knowledge. 
Include [Source X: Name] citations inline.
Keep the summary incredibly dense, using bullet points, and UNDER 100 words strictly to save tokens."""

        compressed_response = compressor.invoke([HumanMessage(content=compress_prompt)])
        compressed_text = compressed_response.content
        print(f"  ✅ Token Compressor: Reduced to {len(compressed_text)} chars payload.")
        return compressed_text

    except Exception as e:
        print(f"  ⚠️ Token Compressor failed: {e}. Returning raw chunks instead.")
        return raw_text_payload


@tool
def get_subject_info() -> str:
    """Get information about the current subject including name, exam date, priority level, difficulty, and confidence score. Use this when the student asks about their exam schedule or subject details."""
    db_session = _tool_context.get("db")
    subject_id = _tool_context.get("subject_id")
    if not db_session or not subject_id:
        return "No subject context available."

    from .. import models
    subject = db_session.query(models.Subject).filter(models.Subject.id == subject_id).first()
    if not subject:
        return f"Subject with ID {subject_id} not found."

    return json.dumps({
        "name": subject.name,
        "exam_date": subject.exam_date or "Not set",
        "priority": f"{subject.priority_level}/5",
        "difficulty": f"{subject.difficulty}/5",
        "confidence": f"{subject.confidence_score}%",
    })


@tool
def get_study_progress() -> str:
    """Get the student's study progress for this subject: material count, flashcard count, quiz count, completion percentage, and task status. Use this when the student asks about their progress or what to study next."""
    db_session = _tool_context.get("db")
    subject_id = _tool_context.get("subject_id")
    if not db_session or not subject_id:
        return "No subject context available."

    from .. import models
    materials = db_session.query(models.Material).filter(models.Material.subject_id == subject_id).all()
    flashcards = db_session.query(models.Flashcard).filter(models.Flashcard.subject_id == subject_id).all()
    quizzes = db_session.query(models.Quiz).filter(models.Quiz.subject_id == subject_id).all()
    tasks = db_session.query(models.Task).filter(models.Task.subject_id == subject_id).all()

    completed = [t for t in tasks if t.status == "completed"]
    mastered = [fc for fc in flashcards if hasattr(fc, 'box') and fc.box >= 3]

    return json.dumps({
        "materials": len(materials),
        "material_names": [m.name for m in materials],
        "mastered_flashcards": f"{len(mastered)} / {len(flashcards)}",
        "quizzes_taken": len(quizzes),
        "tasks_completed": f"{len(completed)} / {len(tasks)}",
    })


# ─── Chat History Loader ─────────────────────────────────────────────────────

def _build_chat_history(db_session, subject_id: int, max_messages: int = 4) -> List:
    """Load last N chat messages from DB into LangChain format."""
    from .. import models
    msgs = (
        db_session.query(models.ChatMessage)
        .filter(models.ChatMessage.subject_id == subject_id)
        .order_by(models.ChatMessage.created_at.desc())
        .limit(max_messages)
        .all()
    )
    msgs = list(reversed(msgs))
    return [
        HumanMessage(content=m.content) if m.role == "user" else AIMessage(content=m.content)
        for m in msgs
    ]


# ─── Main Entry Point (Groq Brain) ───────────────────────────────────────────

GROQ_SYSTEM = """You are **Finals Buddy**, an elite AI Academic Coach and Tutor.
You have access to tools to search the student's course materials, check their exam schedule, and review their study progress.

INSTRUCTIONS:
1. ALWAYS call `search_course_materials` if the student asks a question about their academic content.
2. When calling tools, you MUST ONLY output the JSON tool call matching the schema exactly. Do not output conversational text or extra properties.
2. The `search_course_materials` tool will return a highly compressed summary of the relevant facts. Base your answer heavily on it.
3. Cite sources naturally (e.g. "According to Lecture 4...").
4. If you don't know the answer and the tool finds nothing, be honest and provide your best academic knowledge as a supplement.
5. For exam/schedule questions, use `get_subject_info`.
6. For progress questions, use `get_study_progress`.
7. Do NOT call `search_course_materials` more than twice per message. If you don't find the exact answer after 2 tries, tell the student the information isn't in their materials.
8. Be encouraging, precise, and exam-focused. Use markdown formatting.
9. You have full memory of this conversation — reference earlier messages when relevant."""

def run_langchain_chat(
    subject_id: int,
    query: str,
    mode: str,
    db_session
) -> Dict[str, Any]:
    """
    Main entry point: runs the Groq manual tool-calling loop.
    Tools execute locally, with `search_course_materials` using Ollama for token compression.
    """
    global _tool_context
    _tool_context = {
        "subject_id": subject_id,
        "db": db_session,
        "last_sources": []
    }

    try:
        from .. import models
        import json
        
        # Build material topic mapping to help LLM formulate better search queries
        materials = db_session.query(models.Material).filter(models.Material.subject_id == subject_id).all()
        material_context_lines = []
        for m in materials:
            topics = []
            if m.key_concepts:
                try:
                    parsed = json.loads(m.key_concepts)
                    topics = [c.get("concept", "") for c in parsed]
                except:
                    pass
            topic_str = ", ".join(topics) if topics else "General concepts"
            material_context_lines.append(f"- File '{m.name}': Covers topics ({topic_str})")
            
        material_context_str = "\n".join(material_context_lines) if material_context_lines else "No materials uploaded yet."

        dynamic_system_prompt = GROQ_SYSTEM + f"\n\nAVAILABLE COURSE MATERIALS:\n{material_context_str}\n\nCRITICAL SEARCH RULE: If the student asks about a specific file (e.g. 'lecture 5'), DO NOT just search for the file name. Look at the AVAILABLE COURSE MATERIALS above, find the matching file, and search for the specific TOPICS it covers to retrieve the correct chunks."

        chat_history = _build_chat_history(db_session, subject_id, max_messages=10)

        tools = [search_course_materials, get_subject_info, get_study_progress]
        tools_by_name = {t.name: t for t in tools}

        llm_primary = ChatGroq(
            model="llama-3.3-70b-versatile",
            api_key=GROQ_API_KEY,
            temperature=0.0,
        ).bind_tools(tools)

        llm_fallback = ChatGroq(
            model="llama-3.3-70b-versatile",
            api_key=GROQ_API_KEY_2,
            temperature=0.0,
        ).bind_tools(tools) if GROQ_API_KEY_2 else None

        mode_suffix = ""
        if mode == "simplified":
            mode_suffix = "\n\nMODE: 'Teach Me Like I'm Weak' — use very simple language, step-by-step breakdowns, and be extremely supportive."
        elif mode == "analogies":
            mode_suffix = "\n\nMODE: 'Analogies' — Ground every explanation in rich, real-world analogies and concrete visual examples."

        messages = (
            [SystemMessage(content=dynamic_system_prompt + mode_suffix)]
            + chat_history
            + [HumanMessage(content=query)]
        )

        print(f"\n🧠 Groq Agent: Processing query for subject {subject_id}: '{query[:60]}...'")

        # Use a pointer to the active LLM so we don't keep hitting the rate-limited key
        current_llm = llm_primary
        search_count = 0

        # Tool-calling loop: max 5 iterations to prevent infinite loops
        for i in range(5):
            response = None
            retry_count = 0
            
            # Inner retry loop for API errors (rate limits or 400 syntax hallucinations)
            while response is None and retry_count < 2:
                try:
                    response = current_llm.invoke(messages)
                except Exception as e:
                    err_str = str(e).lower()
                    
                    if "rate limit" in err_str or "429" in err_str:
                        if current_llm != llm_fallback and llm_fallback:
                            print("⚠️ Groq primary key hit rate limit. Switching to fallback key (GROQ_API_KEY_2).")
                            current_llm = llm_fallback
                            continue # Retry with new key
                        else:
                            raise e # Both keys exhausted
                            
                    elif "tool call validation failed" in err_str or "400" in err_str or "invalid" in err_str:
                        print(f"⚠️ Groq hallucinated tool syntax. Retrying generation (Attempt {retry_count+1}/2)...")
                        retry_count += 1
                        # Temporarily append a strict formatting reminder for the retry
                        if len(messages) == 0 or not isinstance(messages[-1], SystemMessage) or "ERROR: Tool" not in messages[-1].content:
                            messages.append(SystemMessage(content="ERROR: Tool call validation failed. You MUST output a valid JSON tool call matching the exact schema. Do not output conversational text or extra arguments."))
                        continue # Retry with same key to get clean JSON
                        
                    else:
                        raise e # Unknown error
            
            if response is None:
                print("❌ Groq failed repeatedly. Breaking tool loop.")
                break

            messages.append(response)

            # If no tool calls, we have the final answer
            if not response.tool_calls:
                break

            # Execute each tool call and append results
            for tc in response.tool_calls:
                tool_name = tc["name"]
                tool_args = tc["args"]
                print(f"  🔧 Groq calls tool: {tool_name}({tool_args})")

                # Hard limit: prevent infinite search looping
                if tool_name == "search_course_materials":
                    search_count += 1
                    if search_count > 2:
                        print("  🛑 Hard limit reached. Intercepting tool call.")
                        result = "SYSTEM OVERRIDE: You have reached the maximum allowed searches. The exact information is NOT in the database. Formulate your final answer immediately based on your general knowledge and the context you already have."
                        messages.append(ToolMessage(content=result, tool_call_id=tc["id"]))
                        continue

                tool_fn = tools_by_name.get(tool_name)
                if tool_fn:
                    result = tool_fn.invoke(tool_args)
                else:
                    result = f"Unknown tool: {tool_name}"

                messages.append(ToolMessage(content=str(result), tool_call_id=tc["id"]))

        # Extract final answer
        if response is None:
            answer = "I'm sorry, I encountered an internal error while trying to process the tools. Please try asking your question differently."
        else:
            answer = response.content if response.content else "I couldn't generate a response. Please try again."
            
        sources = _tool_context.get("last_sources", [])

        print(f"✅ Groq Agent: Final response generated ({len(answer)} chars)")

        return {
            "answer": answer,
            "sources": sources
        }

    except Exception as e:
        print(f"❌ LangChain Chat error: {e}")
        traceback.print_exc()

        # Ultimate fallback to legacy agent
        print("🔄 Falling back to legacy RAG tutor agent...")
        from .agents import tutor_agent
        return tutor_agent.answer_query(subject_id, query, mode)
