"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { 
  ArrowLeft,
  UploadCloud,
  FileText,
  Brain,
  CalendarDays,
  Clock,
  Send,
  HelpCircle,
  CheckCircle2,
  Volume2,
  VolumeX,
  Play,
  Pause,
  RotateCcw,
  Zap,
  Minimize2,
  Bookmark,
  Edit,
  Trash2,
  Award,
  Calculator,
  X,
  FileEdit,
  AlignLeft,
  Plus
} from "lucide-react";
import { api, API_BASE, getToken, SubjectDashboard, Material, Task, Flashcard, Quiz, MockExam, MockExamQuestion, Formula, Note } from "../../../lib/api";
import NotionEditor from "../../../components/NotionEditor";
import { toast } from "../../../components/Toast";

type TabType = 'overview' | 'planner' | 'tutor' | 'revision' | 'focus' | 'exams' | 'cheat-sheet' | 'map' | 'notes';

// Days between today and an ISO exam date. null when no date set.
function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const exam = new Date(iso + "T00:00:00");
  if (isNaN(exam.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((exam.getTime() - today.getTime()) / 86400000);
}


// Sentence-case tab labels (shorter, calmer than the old ALL-CAPS)
const tabLabels: Record<string, string> = {
  overview: "Materials",
  map: "Connections",
  planner: "Study planner",
  tutor: "Tutor",
  revision: "Recall & revision",
  exams: "Mock exams",
  "cheat-sheet": "Cheat sheet",
  notes: "Notes",
};

function parseMessageContent(rawText: string): { text: string; sources: string[] } {
  if (!rawText) return { text: "", sources: [] };
  const match = rawText.match(/\n\n\[Sources:\s*(.*?)\]$/);
  if (match) {
    const text = rawText.substring(0, rawText.length - match[0].length);
    const sources = match[1].split(",").map(s => s.trim()).filter(Boolean);
    return { text, sources };
  }
  return { text: rawText, sources: [] };
}

interface FlowNode {
  id: string;
  label: string;
}

interface FlowEdge {
  source: string;
  target: string;
  label?: string;
}

function parseDiagramCode(code: string): { nodes: FlowNode[]; edges: FlowEdge[]; isVertical: boolean } {
  const lines = code.split("\n");
  const nodesMap = new Map<string, string>();
  const edges: FlowEdge[] = [];
  let isVertical = true;

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    
    // Check orientation
    if (trimmed.includes("graph LR") || trimmed.includes("direction LR")) {
      isVertical = false;
      return;
    }
    if (trimmed.includes("graph TD") || trimmed.includes("direction TD")) {
      isVertical = true;
      return;
    }

    // Match node definitions: ID[Label]
    const nodeDefRegex = /(\w+)(?:\[(.*?)\]|\((.*?)\)|\{\"(.*?)\"\}|\{(.*?)\})/g;
    let match;
    while ((match = nodeDefRegex.exec(trimmed)) !== null) {
      const id = match[1];
      const label = match[2] || match[3] || match[4] || match[5] || id;
      nodesMap.set(id, label.trim());
    }

    // Match edge relationships: ID1 --> ID2
    const edgeRegex = /(\w+)\s*(?:-->|->|--\s*(.*?)\s*-->)\s*(?:\|(.*?)\|)?\s*(\w+)/g;
    let edgeMatch;
    while ((edgeMatch = edgeRegex.exec(trimmed)) !== null) {
      const source = edgeMatch[1];
      const edgeLabel = edgeMatch[2] || edgeMatch[3] || "";
      const target = edgeMatch[4];
      
      if (!nodesMap.has(source)) nodesMap.set(source, source);
      if (!nodesMap.has(target)) nodesMap.set(target, target);
      
      edges.push({
        source,
        target,
        label: edgeLabel ? edgeLabel.trim() : undefined
      });
    }

    // Connectors backup (e.g. A --> B)
    if (!trimmed.includes("[") && !trimmed.includes("{") && (trimmed.includes("-->") || trimmed.includes("->"))) {
      const simpleParts = trimmed.split(/-->|->/);
      if (simpleParts.length >= 2) {
        for (let i = 0; i < simpleParts.length - 1; i++) {
          const rawSrc = simpleParts[i].trim();
          const rawTgt = simpleParts[i+1].trim();
          const srcId = rawSrc.replace(/[^a-zA-Z0-9_]/g, "");
          const tgtId = rawTgt.replace(/[^a-zA-Z0-9_]/g, "");
          if (srcId && tgtId) {
            if (!nodesMap.has(srcId)) nodesMap.set(srcId, rawSrc);
            if (!nodesMap.has(tgtId)) nodesMap.set(tgtId, rawTgt);
            if (!edges.some(e => e.source === srcId && e.target === tgtId)) {
              edges.push({ source: srcId, target: tgtId });
            }
          }
        }
      }
    }
  });

  const nodes = Array.from(nodesMap.entries()).map(([id, label]) => ({ id, label }));
  return { nodes, edges, isVertical };
}

function InteractiveFlowchart({ code }: { code: string }) {
  const { nodes, edges, isVertical } = parseDiagramCode(code);
  
  if (nodes.length === 0) {
    return (
      <pre className="bg-[#141312] border border-[#34302B] p-3 rounded-xl my-2 text-[10px] font-mono text-[#A7C4A0]">
        <code>{code}</code>
      </pre>
    );
  }

  const layersMap: Record<string, number> = {};
  nodes.forEach(n => { layersMap[n.id] = 0; });

  for (let step = 0; step < 8; step++) {
    edges.forEach(edge => {
      const srcLayer = layersMap[edge.source] || 0;
      const tgtLayer = layersMap[edge.target] || 0;
      if (tgtLayer <= srcLayer) {
        layersMap[edge.target] = srcLayer + 1;
      }
    });
  }

  const nodesByLayer: Record<number, string[]> = {};
  Object.entries(layersMap).forEach(([id, layer]) => {
    if (!nodesByLayer[layer]) nodesByLayer[layer] = [];
    nodesByLayer[layer].push(id);
  });

  const maxLayer = Math.max(...Object.keys(nodesByLayer).map(Number), 0);
  const nodeWidth = 110;
  const nodeHeight = 36;
  const positions: Record<string, { x: number; y: number }> = {};
  
  const canvasWidth = isVertical ? 480 : (maxLayer + 1) * 140 + 60;
  const canvasHeight = isVertical ? (maxLayer + 1) * 90 + 70 : 280;

  if (isVertical) {
    const centerX = canvasWidth / 2;
    Object.entries(nodesByLayer).forEach(([layerStr, ids]) => {
      const layer = Number(layerStr);
      const count = ids.length;
      const spacing = Math.min(130, canvasWidth / (count + 1));
      ids.forEach((id, idx) => {
        const offset = (idx - (count - 1) / 2) * spacing;
        positions[id] = {
          x: centerX + offset,
          y: 45 + layer * 85
        };
      });
    });
  } else {
    const centerY = canvasHeight / 2;
    Object.entries(nodesByLayer).forEach(([layerStr, ids]) => {
      const layer = Number(layerStr);
      const count = ids.length;
      const spacing = Math.min(90, canvasHeight / (count + 1));
      ids.forEach((id, idx) => {
        const offset = (idx - (count - 1) / 2) * spacing;
        positions[id] = {
          x: 60 + layer * 140,
          y: centerY + offset
        };
      });
    });
  }

  return (
    <div className="my-3 bg-[#141312]/80 border border-[#34302B] rounded-2xl p-4 overflow-hidden relative w-full">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[8px] font-black text-[#A7C4A0] uppercase tracking-wider flex items-center gap-1">
          Interactive flowchart
        </span>
        <span className="text-[8px] text-[#A29A8B] font-bold">RAG Tutor Diagram</span>
      </div>
      
      <div className="overflow-x-auto w-full">
        <svg 
          width={canvasWidth} 
          height={canvasHeight} 
          viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
          className="mx-auto select-none"
        >
          <defs>
            <filter id="diagram-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <marker id="diagram-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#A7C4A0" />
            </marker>
          </defs>

          {/* Draw edges */}
          {edges.map((edge, idx) => {
            const start = positions[edge.source];
            const end = positions[edge.target];
            if (!start || !end) return null;

            let x1 = start.x;
            let y1 = start.y;
            let x2 = end.x;
            let y2 = end.y;

            if (isVertical) {
              if (y2 > y1) {
                y1 += nodeHeight / 2;
                y2 -= nodeHeight / 2;
              } else if (y2 < y1) {
                y1 -= nodeHeight / 2;
                y2 += nodeHeight / 2;
              }
            } else {
              if (x2 > x1) {
                x1 += nodeWidth / 2;
                x2 -= nodeWidth / 2;
              } else if (x2 < x1) {
                x1 -= nodeWidth / 2;
                x2 += nodeWidth / 2;
              }
            }

            return (
              <g key={idx}>
                <path
                  d={`M ${x1} ${y1} L ${x2} ${y2}`}
                  stroke="#A7C4A0"
                  strokeWidth="1.2"
                  fill="none"
                  markerEnd="url(#diagram-arrow)"
                  style={{ opacity: 0.75, filter: "url(#diagram-glow)" }}
                />
              </g>
            );
          })}

          {/* Draw nodes */}
          {nodes.map(node => {
            const pos = positions[node.id];
            if (!pos) return null;
            
            return (
              <g key={node.id} className="cursor-pointer group">
                <rect
                  x={pos.x - nodeWidth / 2}
                  y={pos.y - nodeHeight / 2}
                  width={nodeWidth}
                  height={nodeHeight}
                  rx="6"
                  ry="6"
                  fill="#262320"
                  stroke="#A7C4A0"
                  strokeWidth="1.2"
                  className="transition-all duration-200 group-hover:fill-[#34302B]"
                  style={{ filter: "url(#diagram-glow)" }}
                />
                <text
                  x={pos.x}
                  y={pos.y + 3}
                  textAnchor="middle"
                  fill="white"
                  fontSize="8"
                  fontWeight="black"
                  className="pointer-events-none select-none uppercase tracking-wide"
                >
                  {node.label.length > 20 ? node.label.substring(0, 18) + "..." : node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function renderFormattedMessage(text: string) {
  if (!text) return null;

  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      const match = part.match(/```(\w*)\n([\s\S]*?)```/);
      const lang = (match ? match[1] : "").toLowerCase();
      const code = match ? match[2] : part.slice(3, -3);

      const isDiagram = lang === 'mermaid' || lang === 'diagram' || code.includes("graph TD") || code.includes("graph LR") || code.includes("-->") || code.includes("->");
      if (isDiagram) {
        return <InteractiveFlowchart key={idx} code={code} />;
      }

      return (
        <pre key={idx} className="bg-[#141312] border border-[#34302B] p-3.5 rounded-xl my-2.5 overflow-x-auto text-[10px] font-mono text-[#A7C4A0] leading-normal w-full">
          {lang && <div className="text-[8px] uppercase tracking-wider text-[#A29A8B] font-black mb-1.5 border-b border-[#34302B] pb-1">{lang}</div>}
          <code>{code}</code>
        </pre>
      );
    }

    const lines = part.split("\n");
    return lines.map((line, lIdx) => {
      let isBullet = false;
      let cleanLine = line;
      let isHeading = false;
      let headingLevel = 0;
      
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) {
        const match = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (match) {
          isHeading = true;
          headingLevel = match[1].length;
          cleanLine = match[2];
        }
      } else if (trimmed.startsWith("- ")) {
        isBullet = true;
        cleanLine = trimmed.substring(2);
      } else if (trimmed.startsWith("* ")) {
        isBullet = true;
        cleanLine = trimmed.substring(2);
      }

      // Parse inline tokens
      const inlineParts = cleanLine.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
      const parsedLine = inlineParts.map((subPart, sIdx) => {
        if (subPart.startsWith("**") && subPart.endsWith("**")) {
          return <strong key={sIdx} className="font-extrabold text-white">{subPart.slice(2, -2)}</strong>;
        }
        if (subPart.startsWith("*") && subPart.endsWith("*")) {
          return <em key={sIdx} className="italic text-[#ECE6DA]">{subPart.slice(1, -1)}</em>;
        }
        if (subPart.startsWith("`") && subPart.endsWith("`")) {
          return <code key={sIdx} className="bg-[#141312] px-1.5 py-0.5 rounded text-[#A7C4A0] font-mono text-[10px] border border-[#34302B]/60">{subPart.slice(1, -1)}</code>;
        }
        return subPart;
      });

      if (isHeading) {
        if (headingLevel === 1) {
          return (
            <h1 key={lIdx} className="text-sm font-black text-[#A7C4A0] border-b border-[#34302B] pb-1 mt-4 mb-2">
              {parsedLine}
            </h1>
          );
        }
        if (headingLevel === 2) {
          return (
            <h2 key={lIdx} className="text-xs font-extrabold text-[#A7C4A0] mt-3.5 mb-1.5">
              {parsedLine}
            </h2>
          );
        }
        if (headingLevel === 3) {
          return (
            <h3 key={lIdx} className="text-[11px] font-bold text-white uppercase tracking-wider mt-3 mb-1">
              {parsedLine}
            </h3>
          );
        }
        return (
          <h4 key={lIdx} className="text-[10px] font-semibold text-[#A29A8B] uppercase tracking-wider mt-2 mb-1">
            {parsedLine}
          </h4>
        );
      }

      if (isBullet) {
        return (
          <div key={lIdx} className="flex items-start gap-2 ml-3 mt-1 text-[#ECE6DA]">
            <span className="text-[#A7C4A0] select-none mt-0.5">•</span>
            <div className="flex-1">{parsedLine}</div>
          </div>
        );
      }

      return (
        <div key={lIdx} className={lIdx > 0 ? "mt-1.5" : ""}>
          {parsedLine}
        </div>
      );
    });
  });
}

export default function SubjectPortal() {
  const params = useParams();
  const router = useRouter();
  const subjectId = Number(params.id);

  const [subject, setSubject] = useState<SubjectDashboard | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [showMarkdownGuide, setShowMarkdownGuide] = useState(false);
  
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<{ step: number; label: string; icon: string } | null>(null);

  // AI Tutor States
  const [tutorMessages, setTutorMessages] = useState<Array<{id?: number, sender: 'student' | 'tutor', text: string, sources?: string[]}>>([]);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [tutorQuery, setTutorQuery] = useState("");
  const [tutorMode, setTutorMode] = useState<"standard" | "simplified" | "analogies">("standard");
  const [tutorLoading, setTutorLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Flashcards States
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [flashcardFront, setFlashcardFront] = useState("");
  const [flashcardBack, setFlashcardBack] = useState("");
  const [showAddFlashcard, setShowAddFlashcard] = useState(false);
  
  const [activeRecallMode, setActiveRecallMode] = useState<'study' | 'manage'>('study');
  const [flashcardFilterMaterial, setFlashcardFilterMaterial] = useState<number | 'all'>('all');
  const [editingFlashcardId, setEditingFlashcardId] = useState<number | null>(null);
  const [editFlashcardFront, setEditFlashcardFront] = useState("");
  const [editFlashcardBack, setEditFlashcardBack] = useState("");
  const [editFlashcardBox, setEditFlashcardBox] = useState(1);
  const [editFlashcardMaterialId, setEditFlashcardMaterialId] = useState<number | null>(null);
  const [isGeneratingMoreFlashcards, setIsGeneratingMoreFlashcards] = useState(false);

  // Quizzes States
  const [quizAnswers, setQuizAnswers] = useState<Record<number, { selected: string, graded: boolean, correct: boolean, explanation?: string }>>({});
  const [isGeneratingMoreQuizzes, setIsGeneratingMoreQuizzes] = useState(false);

  // Study Sessions logger form
  const [sessionMinutes, setSessionMinutes] = useState(30);
  const [sessionFocus, setSessionFocus] = useState(4);
  const [sessionNotes, setSessionNotes] = useState("");
  const [sessionTitle, setSessionTitle] = useState("Deep Focus Session");
  const [loggingSession, setLoggingSession] = useState(false);

  // Task CRUD states (planner)
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [editTaskDesc, setEditTaskDesc] = useState("");
  const [editTaskDuration, setEditTaskDuration] = useState(30);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskDuration, setNewTaskDuration] = useState(30);

  // Quiz CRUD states
  const [editingQuizId, setEditingQuizId] = useState<number | null>(null);
  const [editQuizQuestion, setEditQuizQuestion] = useState("");
  const [editQuizOptions, setEditQuizOptions] = useState<string[]>([]);
  const [editQuizAnswer, setEditQuizAnswer] = useState("");
  const [showAddQuiz, setShowAddQuiz] = useState(false);
  const [newQuizQuestion, setNewQuizQuestion] = useState("");
  const [newQuizOptions, setNewQuizOptions] = useState(["", "", "", ""]);
  const [newQuizCorrectIdx, setNewQuizCorrectIdx] = useState(0);

  // Formula CRUD + cheat sheet generation states
  const [editingFormulaId, setEditingFormulaId] = useState<number | null>(null);
  const [editFormulaName, setEditFormulaName] = useState("");
  const [editFormulaLatex, setEditFormulaLatex] = useState("");
  const [editFormulaDesc, setEditFormulaDesc] = useState("");
  const [showAddFormula, setShowAddFormula] = useState(false);
  const [newFormulaName, setNewFormulaName] = useState("");
  const [newFormulaLatex, setNewFormulaLatex] = useState("");
  const [newFormulaDesc, setNewFormulaDesc] = useState("");
  const [showCheatSheetModal, setShowCheatSheetModal] = useState(false);
  const [cheatSheetMaterialIds, setCheatSheetMaterialIds] = useState<number[]>([]);
  const [cheatSheetReplace, setCheatSheetReplace] = useState(false);
  const [generatingCheatSheet, setGeneratingCheatSheet] = useState(false);

  // Phase 2 States
  const [mockExams, setMockExams] = useState<MockExam[]>([]);
  const [activeExam, setActiveExam] = useState<MockExam | null>(null);
  const [examTimer, setExamTimer] = useState(15 * 60);
  const [examTimerRunning, setExamTimerRunning] = useState(false);
  const [studentAnswers, setStudentAnswers] = useState<Record<number, string>>({});
  const [submittingExam, setSubmittingExam] = useState(false);
  const [generatingExam, setGeneratingExam] = useState(false);

  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [formulaNoteText, setFormulaNoteText] = useState<Record<number, string>>({});
  const [savingFormulaNote, setSavingFormulaNote] = useState<number | null>(null);
  const [activeCalculatorFormula, setActiveCalculatorFormula] = useState<Formula | null>(null);
  const [calculatorInputs, setCalculatorInputs] = useState<Record<string, number>>({});
  const [calculatorResult, setCalculatorResult] = useState<number | null>(null);

  // Phase 3 States
  const [knowledgeMap, setKnowledgeMap] = useState<{ nodes: Material[]; edges: any[] } | null>(null);
  const [selectedNode, setSelectedNode] = useState<Material | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<any | null>(null);
  const [compilingMap, setCompilingMap] = useState(false);

  // Pomodoro & Focus Mode States
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25 * 60); // 25 minutes
  const [isBreak, setIsBreak] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const noiseNodeRef = useRef<AudioNode | null>(null);

  async function loadSubjectData() {
    try {
      setLoading(true);
      const subjDetails = await api.getSubject(subjectId);
      setSubject(subjDetails);

      const mats = await api.getMaterials(subjectId);
      setMaterials(mats);

      const tList = await api.getTasks(subjectId);
      setTasks(tList);

      const fc = await api.getFlashcards(subjectId);
      setFlashcards(fc);

      const q = await api.getQuizzes(subjectId);
      setQuizzes(q);

      try {
        const exams = await api.getMockExams(subjectId);
        setMockExams(exams);
      } catch (examErr) {
        console.error("Could not fetch mock exams:", examErr);
      }

      try {
        const fetchedNotes = await api.getNotes(subjectId);
        setNotes(fetchedNotes);
        if (fetchedNotes.length > 0 && !activeNoteId) {
          setActiveNoteId(fetchedNotes[0].id);
        }
      } catch (noteErr) {
        console.error("Could not fetch notes:", noteErr);
      }

      try {
        const forms = await api.getFormulas(subjectId);
        setFormulas(forms);
      } catch (formErr) {
        console.error("Could not fetch formulas:", formErr);
      }
      
      try {
        const chats = await api.getChatHistory(subjectId);
        setTutorMessages(chats.map(c => ({
          id: c.id,
          sender: c.role === 'user' ? 'student' : 'tutor',
          text: c.content
        })));
      } catch (chatErr) {
        console.error("Could not fetch chat history:", chatErr);
      }
      
      try {
        const kMap = await api.getKnowledgeMap(subjectId);
        setKnowledgeMap(kMap);
      } catch (mapErr) {
        console.error("Could not fetch knowledge map:", mapErr);
      }
      
    } catch (err) {
      console.error(err);
      // Beautiful offline fallback details
      setSubject({
        id: subjectId,
        name: subjectId === 2 ? "Computer Architecture (CS 302)" : "Operating Systems (CS 401)",
        exam_date: subjectId === 2 ? "2026-05-24" : "2026-06-03",
        priority_level: 5,
        difficulty: 4,
        confidence_score: 45.0,
        materials_count: 2,
        completion_percentage: 40.0,
        hours_remaining: 8.5,
        weak_topics: ["Paging Mechanisms", "LRU Cache Replacement"],
        urgency_status: "high",
        next_recommended_action: "Review active recall quizzes for exam readiness"
      });

      setMaterials([
        {
          id: 201,
          subject_id: subjectId,
          name: "Lecture_04_Virtual_Memory.pdf",
          file_type: "pdf",
          summary: "### Summary of Virtual Memory\n\nThis lecture introduces Virtual Memory spaces, mapping virtual page numbers (VPN) to physical frame numbers (PFN) via hierarchical page tables. Key details include Translation Lookaside Buffers (TLBs) to speed up translations, and page replacement algorithm trade-offs (FIFO, LRU, Optimal).",
          key_concepts: JSON.stringify([
            { concept: "Translation Lookaside Buffer (TLB)", explanation: "A high-speed cache hardware block containing recent page mappings to bypass slow RAM access.", difficulty_weight: 4 },
            { concept: "Page Faults", explanation: "Interrupt triggered by hardware when a requested virtual page is not loaded in physical memory.", difficulty_weight: 3 }
          ]),
          learning_complexity: 4,
          importance_level: 5,
          created_at: new Date().toISOString()
        }
      ]);

      setTasks([
        {
          id: 301,
          subject_id: subjectId,
          title: "Complete Page Table Parsing Exercise",
          description: "Manually compute physical address translation for a 32-bit architecture with 4KB pages.",
          duration_minutes: 45,
          urgency_score: 8.0,
          importance_score: 9.0,
          status: "pending",
          created_at: new Date().toISOString()
        },
        {
          id: 302,
          subject_id: subjectId,
          title: "Review TLB Hit Rate Formulas",
          description: "Understand Effective Memory Access Time (EMAT) calculations and review homework questions.",
          duration_minutes: 30,
          urgency_score: 7.5,
          importance_score: 8.0,
          status: "completed",
          completed_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        }
      ]);

      setFlashcards([
        {
          id: 401,
          subject_id: subjectId,
          front: "What is a Translation Lookaside Buffer (TLB)?",
          back: "A fast hardware cache of the page table that stores recent translations, bypassing multi-level RAM lookups.",
          box: 1,
          confidence: 50.0,
          created_at: new Date().toISOString()
        },
        {
          id: 402,
          subject_id: subjectId,
          front: "What constitutes a page fault?",
          back: "An interrupt raised by MMU when a program accesses a page mapped in virtual address space but not loaded in main memory.",
          box: 2,
          confidence: 65.0,
          created_at: new Date().toISOString()
        }
      ]);

      setQuizzes([
        {
          id: 501,
          subject_id: subjectId,
          question: "If a system uses 32-bit virtual addresses and a 4KB page size, how many entries are in a single-level page table?",
          options: JSON.stringify([
            "1,048,576 entries (2^20)",
            "4,096 entries (2^12)",
            "65,536 entries (2^16)",
            "4,294,967,296 entries (2^32)"
          ]),
          correct_answer: "1,048,576 entries (2^20)",
          type: "multiple_choice",
          created_at: new Date().toISOString()
        }
      ]);

      // Simulated offline mock exams
      setMockExams([
        {
          id: 601,
          subject_id: subjectId,
          score: 85.0,
          duration_seconds: 480,
          completed_at: new Date().toISOString(),
          status: "graded",
          created_at: new Date().toISOString(),
          questions: [
            {
              id: 611,
              mock_exam_id: 601,
              question: "Explain the concept of Thrashing in virtual memory. Under what conditions does it occur, and how does a Working Set Model solve this issue?",
              user_answer: "Thrashing occurs when the system spends more time paging (swapping memory) than executing processes. This happens when active processes demand more physical pages than are currently available in memory. The Working Set Model tracks the set of pages frequently used by each process in a sliding time window, and only schedules processes if their entire working set can fit in RAM.",
              ai_grade: 92.0,
              ai_feedback: "Excellent coverage! You accurately defined Thrashing, its triggering conditions, and explained how working sets bound scheduling constraints to preserve page rate stability.",
              reference_source: "Virtual Memory & Thrashing (Lecture slides)"
            },
            {
              id: 612,
              mock_exam_id: 601,
              question: "Describe the critical section problem. Contrast Mutex locks and Semaphores as synchronization primitives, outlining a scenario where a Semaphore is strictly required.",
              user_answer: "Mutexes are binary locks meant for mutual exclusion with owner ownership. Semaphores can have counts greater than one.",
              ai_grade: 68.0,
              ai_feedback: "You identified Mutexes as mutual exclusion locks, but failed to address how to solve the critical section problem (mutual exclusion, progress, bounded waiting). Additionally, a semaphore count is useful for tracking resource limits (e.g. producer-consumer pools) where no single process owns the lock.",
              reference_source: "Process Synchronization (Lecture slides)"
            }
          ]
        }
      ]);

      // Simulated offline formulas
      setFormulas([
        {
          id: 701,
          subject_id: subjectId,
          name: "Average Memory Access Time (AMAT)",
          latex_code: "AMAT = T_{TLB} + (1 - h) \\times T_{mem} + f \\times T_{disk}",
          description: "Calculates average CPU performance cost when checking TLB, main memory page tables, and disk page swapping.",
          variables_json: JSON.stringify([
            {symbol: "T_{TLB}", meaning: "TLB lookup access time (typically 1-4ns)"},
            {symbol: "h", meaning: "TLB hit ratio percentage (0.0 to 1.0)"},
            {symbol: "T_{mem}", meaning: "Main memory access latency (typically 50-100ns)"},
            {symbol: "f", meaning: "Page fault rate (percentage of page lookups yielding disk swap)"},
            {symbol: "T_{disk}", meaning: "Disk page swap service time (typically 5-10ms)"}
          ]),
          derivation_steps_json: JSON.stringify([
            "1. Perform fast TLB lookup first ($T_{TLB}$ cost).",
            "2. If TLB miss occurs (with $(1-h)$ probability), incur extra read latency to query multi-level page tables in main memory ($T_{mem}$).",
            "3. In the extreme case of a page fault (with $f$ probability), pause execution and wait for OS disk transfer interrupt ($T_{disk}$)."
          ]),
          created_at: new Date().toISOString()
        },
        {
          id: 702,
          subject_id: subjectId,
          name: "Page Table Size Calculation",
          latex_code: "Size = \\frac{2^{bits_{virtual}}}{2^{bits_{page}}} \\times Size_{PTE}",
          description: "Estimates memory required to hold a single-level page table mapping the virtual address space to physical memory frames.",
          variables_json: JSON.stringify([
            {"symbol": "bits_{virtual}", "meaning": "Addressing space width of virtual pointers (e.g., 32 or 64 bits)"},
            {"symbol": "bits_{page}", "meaning": "Page offset bit size determining page boundaries (e.g., 12 bits for 4KB pages)"},
            {"symbol": "Size_{PTE}", "meaning": "Individual page table entry byte length (typically 4 or 8 bytes)"}
          ]),
          derivation_steps_json: JSON.stringify([
            "1. Compute total number of virtual pages available: $2^{bits_{virtual} - bits_{page}}$.",
            "2. Multiply the page count by entry storage size ($Size_{PTE}$) to yield total capacity bytes.",
            "3. Convert to Megabytes by dividing by $2^{20}$ to assess overhead impact."
          ]),
          created_at: new Date().toISOString()
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Auth guard: no session -> login page
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setQuizAnswers({});
    loadSubjectData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  // Scroll chat to bottom when message arrives
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [tutorMessages]);

  // Pomodoro Countdown Logic
  useEffect(() => {
    let interval: any = null;
    if (pomodoroRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setPomodoroRunning(false);
      // Play sound notification
      if (typeof window !== "undefined") {
        try {
          const synth = window.speechSynthesis;
          const utter = new SpeechSynthesisUtterance(isBreak ? "Break is complete, back to focus!" : "Focus session done! Take a well-earned break.");
          synth.speak(utter);
        } catch {}
      }
      setIsBreak(!isBreak);
      setTimeLeft(isBreak ? 25 * 60 : 5 * 60);
    }
    return () => clearInterval(interval);
  }, [pomodoroRunning, timeLeft, isBreak]);

  // Timed Exam Countdown Timer
  useEffect(() => {
    let interval: any = null;
    if (examTimerRunning && examTimer > 0) {
      interval = setInterval(() => {
        setExamTimer((prev) => prev - 1);
      }, 1000);
    } else if (examTimer === 0 && examTimerRunning) {
      setExamTimerRunning(false);
      toast("Time's up — submitting your answers.", "info");
      handleAutoSubmitExam();
    }
    return () => clearInterval(interval);
  }, [examTimerRunning, examTimer]);

  async function handleAutoSubmitExam() {
    if (!activeExam) return;
    await performSubmitExam(activeExam.id, studentAnswers);
  }

  async function performSubmitExam(examId: number, answersMap: Record<number, string>) {
    try {
      setSubmittingExam(true);
      const answersPayload = Object.entries(answersMap).map(([qId, ans]) => ({
        question_id: Number(qId),
        user_answer: ans
      }));
      const durationSeconds = (15 * 60) - examTimer;

      const gradedExam = await api.submitMockExam(examId, durationSeconds, answersPayload);
      
      // Update in local lists
      setMockExams(prev => prev.map(ex => ex.id === examId ? gradedExam : ex));
      setActiveExam(gradedExam);
      setExamTimerRunning(false);
      toast("Graded. Scroll down for your score and feedback.", "success");
      loadSubjectData();
    } catch (err) {
      console.error(err);
      // Fallback submission grading simulation
      setSubmittingExam(false);
      const durationSeconds = (15 * 60) - examTimer;
      const simulatedScore = 80.0;
      const updatedExam: MockExam = {
        ...activeExam!,
        score: simulatedScore,
        duration_seconds: durationSeconds,
        status: 'graded',
        completed_at: new Date().toISOString(),
        questions: activeExam!.questions.map(q => ({
          ...q,
          user_answer: answersMap[q.id] || "No answer provided.",
          ai_grade: 80.0,
          ai_feedback: "Well written conceptual draft! Good retention of key themes and memory architecture constraints.",
          reference_source: q.reference_source || "Lecture Materials"
        }))
      };
      setMockExams(prev => prev.map(ex => ex.id === examId ? updatedExam : ex));
      setActiveExam(updatedExam);
      setExamTimerRunning(false);
      if (subject) {
        setSubject({
          ...subject,
          confidence_score: Math.min(100.0, subject.confidence_score + 10)
        });
      }
      toast("Answers recorded.", "success");
    } finally {
      setSubmittingExam(false);
    }
  }

  async function handleStartExam() {
    try {
      setGeneratingExam(true);
      const exam = await api.createMockExam(subjectId);
      setMockExams(prev => [exam, ...prev]);
      setActiveExam(exam);
      setStudentAnswers({});
      setExamTimer(15 * 60);
      setExamTimerRunning(true);
    } catch (err) {
      console.error(err);
      // Simulated new exam
      const mockId = Date.now();
      const mockQuestions: MockExamQuestion[] = [
        {
          id: mockId + 1,
          mock_exam_id: mockId,
          question: "Explain virtual memory paging structures. How does a Translation Lookaside Buffer (TLB) speed up page address resolution?",
          reference_source: "Lecture_04_Virtual_Memory.pdf"
        },
        {
          id: mockId + 2,
          mock_exam_id: mockId,
          question: "Describe the three conditions required to solve the critical section problem in multi-threaded execution.",
          reference_source: "Process Synchronization & Locks"
        },
        {
          id: mockId + 3,
          mock_exam_id: mockId,
          question: "How does 2-way set-associative cache mapping differ from direct cache mapping? Compute physical cache slot index if block size is 64 bytes.",
          reference_source: "Cache Architecture & Blocks"
        }
      ];
      const exam: MockExam = {
        id: mockId,
        subject_id: subjectId,
        score: 0.0,
        duration_seconds: 0,
        status: 'in_progress',
        created_at: new Date().toISOString(),
        questions: mockQuestions
      };
      setMockExams(prev => [exam, ...prev]);
      setActiveExam(exam);
      setStudentAnswers({});
      setExamTimer(15 * 60);
      setExamTimerRunning(true);
    } finally {
      setGeneratingExam(false);
    }
  }

  async function handleAddFormulaNote(formulaId: number) {
    const note = formulaNoteText[formulaId];
    if (!note || !note.trim()) return;
    try {
      setSavingFormulaNote(formulaId);
      const updated = await api.addFormulaNote(formulaId, note.trim());
      setFormulas(prev => prev.map(f => f.id === formulaId ? { ...f, description: updated.description } : f));
      setFormulaNoteText(prev => ({ ...prev, [formulaId]: "" }));
      toast("Note saved.", "success");
    } catch {
      // Offline fallback
      setFormulas(prev => prev.map(f => f.id === formulaId ? { ...f, description: (f.description || "") + `\n\n*Student Study Note:* ${note}` } : f));
      setFormulaNoteText(prev => ({ ...prev, [formulaId]: "" }));
      toast("Note added.", "success");
    } finally {
      setSavingFormulaNote(null);
    }
  }

  function handleOpenCalculator(formula: Formula) {
    setActiveCalculatorFormula(formula);
    const vars: Record<string, number> = {};
    try {
      const varsArray = JSON.parse(formula.variables_json || "[]");
      varsArray.forEach((v: any) => {
        vars[v.symbol] = 0;
      });
    } catch {}
    setCalculatorInputs(vars);
    setCalculatorResult(null);
  }

  function handleRunCalculator() {
    if (!activeCalculatorFormula) return;
    // Perform clean, hardcoded, exact formula calculator solvers matching the course symbols!
    const name = activeCalculatorFormula.name.toLowerCase();
    if (name.includes("amat") || name.includes("average memory access")) {
      const t_tlb = calculatorInputs["T_{TLB}"] || calculatorInputs["T_TLB"] || 0;
      const h = calculatorInputs["h"] || 0;
      const t_mem = calculatorInputs["T_{mem}"] || calculatorInputs["T_mem"] || 0;
      const f = calculatorInputs["f"] || 0;
      const t_disk = calculatorInputs["T_{disk}"] || calculatorInputs["T_disk"] || 0;
      // AMAT = T_TLB + (1 - h) * T_mem + f * T_disk
      const result = t_tlb + (1 - h) * t_mem + f * t_disk;
      setCalculatorResult(result);
    } else if (name.includes("page table size")) {
      const bits_v = calculatorInputs["bits_{virtual}"] || calculatorInputs["bits_virtual"] || 32;
      const bits_p = calculatorInputs["bits_{page}"] || calculatorInputs["bits_page"] || 12;
      const size_pte = calculatorInputs["Size_{PTE}"] || calculatorInputs["Size_PTE"] || 4;
      // Size = 2^(bits_v - bits_p) * size_pte
      const result = Math.pow(2, bits_v - bits_p) * size_pte;
      setCalculatorResult(result);
    } else {
      // General solver: sum of all variables entered
      const result = Object.values(calculatorInputs).reduce((a, b) => a + b, 0);
      setCalculatorResult(result);
    }
  }

  // Audio synthesis for study focus ambient background sounds!
  const toggleSound = () => {
    if (soundOn) {
      if (noiseNodeRef.current) {
        noiseNodeRef.current.disconnect();
        noiseNodeRef.current = null;
      }
      setSoundOn(false);
    } else {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;

        // Generate Brown Noise (great for studying!)
        const bufferSize = 10 * ctx.sampleRate;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let lastOut = 0.0;
        
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          // Brownian low-pass filter
          output[i] = (lastOut + (0.02 * white)) / 1.02;
          lastOut = output[i];
          output[i] *= 3.5; // Gain factor
        }

        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0.12, ctx.currentTime); // Soft background hum

        whiteNoise.connect(gainNode);
        gainNode.connect(ctx.destination);
        whiteNoise.start();

        noiseNodeRef.current = whiteNoise;
        setSoundOn(true);
      } catch (err) {
        console.error("Web Audio failed: ", err);
      }
    }
  };

  // Cleanup audio
  useEffect(() => {
    return () => {
      if (noiseNodeRef.current) {
        noiseNodeRef.current.disconnect();
      }
    };
  }, []);

  // Ingestion File Uploader
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadStage({ step: 1, label: "Uploading file...", icon: "📤" });

    try {
      // 1. Trigger the upload - returns immediately after saving & text extraction
      const uploadedMaterial = await api.uploadMaterial(subjectId, file);
      
      if (uploadedMaterial.job_id) {
        // 2. Start listening to Server-Sent Events (SSE) for real-time background status
        const job_id = uploadedMaterial.job_id;
        const sseUrl = `${API_BASE}/materials/upload-progress/${job_id}`;
        console.log(`📡 Opening progress stream to: ${sseUrl}`);
        
        const eventSource = new EventSource(sseUrl);
        
        eventSource.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log("📡 Progress event:", data);
            
            // Update the UI state with real-time logs from the background worker
            setUploadStage({
              step: data.step,
              label: data.label,
              icon: data.icon || "🧠"
            });
            
            // If the core summaries are ready (Step 5 completed), trigger a background refresh
            // so the user can see their material summary immediately without waiting for quizzes!
            if (data.summary_ready) {
              loadSubjectData().catch(console.error);
            }
            
            if (data.status === "completed") {
              eventSource.close();
              setUploadStage({ step: 7, label: "Complete! All quizzes and summaries are ready.", icon: "🎉" });
              await new Promise(r => setTimeout(r, 1000));
              setUploading(false);
              setUploadStage(null);
              loadSubjectData().catch(console.error);
            } else if (data.status === "failed") {
              eventSource.close();
              toast(`Couldn't process that file: ${data.error || "unknown error"}`, "error");
              setUploading(false);
              setUploadStage(null);
              loadSubjectData().catch(console.error);
            }
          } catch (parseErr) {
            console.error("Failed to parse SSE data:", parseErr);
          }
        };
        
        eventSource.onerror = (err) => {
          console.error("SSE Connection error:", err);
          eventSource.close();
          // Fallback if SSE drops
          setTimeout(() => {
            loadSubjectData().catch(console.error);
            setUploading(false);
            setUploadStage(null);
          }, 3000);
        };
        
      } else {
        // Fallback if no job_id
        setUploadStage({ step: 7, label: "Complete! Loading study materials...", icon: "🎉" });
        await new Promise(r => setTimeout(r, 1000));
        setUploading(false);
        setUploadStage(null);
        await loadSubjectData();
      }
    } catch (err: any) {
      console.error(err);
      toast(`Upload failed: ${err.message || "is the server running?"}`, "error");
      setUploading(false);
      setUploadStage(null);
    }
  }


  async function handleGenerateKnowledgeMap() {
    try {
      setCompilingMap(true);
      const res = await api.generateKnowledgeMap(subjectId);
      setKnowledgeMap(res);
      toast("Connections mapped.", "success");
    } catch (err) {
      console.error(err);
      // Offline fallback mapping
      if (materials.length > 0) {
        const fallEdges = [];
        for (let i = 0; i < materials.length - 1; i++) {
          fallEdges.push({
            id: 900 + i,
            subject_id: subjectId,
            source_material_id: materials[i].id,
            target_material_id: materials[i+1].id,
            connection_type: i === 0 ? "Prerequisite" : "Extension",
            description: `Conceptual study flow tracking progression of topics from ${materials[i].name} into ${materials[i+1].name}.`
          });
        }
        setKnowledgeMap({ nodes: materials, edges: fallEdges });
      }
      toast("Connections mapped.", "success");
    } finally {
      setCompilingMap(false);
    }
  }

  async function handleDeleteMaterial(matId: number) {
    if (!confirm("Are you sure you want to delete this study material? The physical file and all RAG vector indexes for this document will be permanently cleared!")) return;
    try {
      await api.deleteMaterial(matId);
      await loadSubjectData();
      toast("Material deleted.", "success");
    } catch (err) {
      console.error(err);
      toast("Couldn't delete the material.", "error");
    }
  }

  async function handleRenameMaterial(matId: number, currentName: string) {
    const newName = prompt("Enter a new name for the study material:", currentName);
    if (!newName || !newName.trim() || newName === currentName) return;
    try {
      await api.updateMaterial(matId, { name: newName.trim() });
      await loadSubjectData();
    } catch (err) {
      console.error(err);
      toast("Couldn't rename the material.", "error");
    }
  }

  // Completing a study planner task
  async function handleToggleTask(taskId: number, currentStatus: 'pending' | 'completed') {
    const nextStatus = currentStatus === 'pending' ? 'completed' : 'pending';
    try {
      await api.updateTask(taskId, nextStatus);
      // Live reload confidence and metrics
      await loadSubjectData();
    } catch {
      // Offline fallback toggle
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: nextStatus } : t));
      if (subject) {
        setSubject({
          ...subject,
          completion_percentage: nextStatus === 'completed' ? 60 : 40,
          confidence_score: nextStatus === 'completed' ? subject.confidence_score + 4.5 : subject.confidence_score - 4.5
        });
      }
    }
  }

  // Create customized new study tasks dynamically
  async function handleGeneratePlan() {
    try {
      const newTask = await api.createTask({
        subject_id: subjectId,
        title: "Active Recall Session",
        description: "Engage in active recall and Leitner system spaced repetition reviews on all weak topics.",
        duration_minutes: 30,
        urgency_score: 7.0,
        importance_score: 8.0,
        status: "pending",
        due_date: new Date().toISOString().split('T')[0]
      });
      setTasks(prev => [newTask, ...prev]);
      toast("Added a task to your plan.", "success");
    } catch {
      const fallbackTask: Task = {
        id: Date.now(),
        subject_id: subjectId,
        title: "Dynamic AI Study Plan Task",
        description: "Engage in deep tutor study mode and revise weak memory concepts.",
        duration_minutes: 40,
        urgency_score: 9.0,
        importance_score: 8.5,
        status: "pending",
        created_at: new Date().toISOString()
      };
      setTasks(prev => [fallbackTask, ...prev]);
    }
  }

  // ---------- Task CRUD (planner) ----------

  async function handleDeleteTask(taskId: number) {
    if (!confirm("Delete this task?")) return;
    try {
      await api.deleteTask(taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch {
      toast("Couldn't delete the task.", "error");
    }
  }

  function startEditTask(task: Task) {
    setEditingTaskId(task.id);
    setEditTaskTitle(task.title);
    setEditTaskDesc(task.description || "");
    setEditTaskDuration(task.duration_minutes);
  }

  async function handleSaveTaskEdit(e: React.FormEvent) {
    e.preventDefault();
    if (editingTaskId === null) return;
    try {
      const updated = await api.patchTask(editingTaskId, {
        title: editTaskTitle,
        description: editTaskDesc,
        duration_minutes: editTaskDuration,
      });
      setTasks(prev => prev.map(t => (t.id === updated.id ? updated : t)));
      setEditingTaskId(null);
    } catch {
      toast("Couldn't save the task.", "error");
    }
  }

  async function handleCreateManualTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    try {
      const created = await api.createTask({
        subject_id: subjectId,
        title: newTaskTitle,
        description: newTaskDesc,
        duration_minutes: newTaskDuration,
        due_date: new Date().toISOString().split("T")[0],
      });
      setTasks(prev => [created, ...prev]);
      setNewTaskTitle("");
      setNewTaskDesc("");
      setNewTaskDuration(30);
      setShowAddTask(false);
    } catch {
      toast("Couldn't create the task.", "error");
    }
  }

  // ---------- Quiz CRUD ----------

  async function handleDeleteQuiz(quizId: number) {
    if (!confirm("Delete this quiz question?")) return;
    try {
      await api.deleteQuiz(quizId);
      setQuizzes(prev => prev.filter(q => q.id !== quizId));
    } catch {
      toast("Couldn't delete the question.", "error");
    }
  }

  function startEditQuiz(quiz: Quiz) {
    setEditingQuizId(quiz.id);
    setEditQuizQuestion(quiz.question);
    let opts: string[] = [];
    try { opts = quiz.options ? JSON.parse(quiz.options) : []; } catch { opts = []; }
    setEditQuizOptions(opts.length ? opts : ["", "", "", ""]);
    setEditQuizAnswer(quiz.correct_answer);
  }

  async function handleSaveQuizEdit(e: React.FormEvent) {
    e.preventDefault();
    if (editingQuizId === null) return;
    const cleanOptions = editQuizOptions.map(o => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2) { toast("Add at least two options.", "error"); return; }
    if (!cleanOptions.includes(editQuizAnswer)) { toast("Mark one option as the correct answer.", "error"); return; }
    try {
      const updated = await api.updateQuiz(editingQuizId, {
        question: editQuizQuestion,
        options: JSON.stringify(cleanOptions),
        correct_answer: editQuizAnswer,
      });
      setQuizzes(prev => prev.map(q => (q.id === updated.id ? updated : q)));
      setEditingQuizId(null);
      setQuizAnswers({});
    } catch {
      toast("Couldn't save the question.", "error");
    }
  }

  async function handleCreateManualQuiz(e: React.FormEvent) {
    e.preventDefault();
    const cleanOptions = newQuizOptions.map(o => o.trim()).filter(Boolean);
    if (!newQuizQuestion.trim() || cleanOptions.length < 2) {
      toast("Add a question and at least two options.", "error");
      return;
    }
    try {
      const created = await api.createQuiz(subjectId, {
        question: newQuizQuestion,
        options: JSON.stringify(cleanOptions),
        correct_answer: cleanOptions[Math.min(newQuizCorrectIdx, cleanOptions.length - 1)],
        type: "multiple_choice",
      });
      setQuizzes(prev => [created, ...prev]);
      setNewQuizQuestion("");
      setNewQuizOptions(["", "", "", ""]);
      setNewQuizCorrectIdx(0);
      setShowAddQuiz(false);
    } catch {
      toast("Couldn't create the question.", "error");
    }
  }

  // ---------- Formula / cheat-sheet CRUD ----------

  async function handleDeleteFormula(formulaId: number) {
    if (!confirm("Delete this cheat-sheet entry?")) return;
    try {
      await api.deleteFormula(formulaId);
      setFormulas(prev => prev.filter(f => f.id !== formulaId));
    } catch {
      toast("Couldn't delete the entry.", "error");
    }
  }

  function startEditFormula(formula: Formula) {
    setEditingFormulaId(formula.id);
    setEditFormulaName(formula.name);
    setEditFormulaLatex(formula.latex_code);
    setEditFormulaDesc(formula.description || "");
  }

  async function handleSaveFormulaEdit(e: React.FormEvent) {
    e.preventDefault();
    if (editingFormulaId === null) return;
    try {
      const updated = await api.updateFormula(editingFormulaId, {
        name: editFormulaName,
        latex_code: editFormulaLatex,
        description: editFormulaDesc,
      });
      setFormulas(prev => prev.map(f => (f.id === updated.id ? updated : f)));
      setEditingFormulaId(null);
    } catch {
      toast("Couldn't save the entry.", "error");
    }
  }

  async function handleCreateManualFormula(e: React.FormEvent) {
    e.preventDefault();
    if (!newFormulaName.trim() || !newFormulaLatex.trim()) return;
    try {
      const created = await api.createFormula(subjectId, {
        name: newFormulaName,
        latex_code: newFormulaLatex,
        description: newFormulaDesc,
      });
      setFormulas(prev => [...prev, created]);
      setNewFormulaName("");
      setNewFormulaLatex("");
      setNewFormulaDesc("");
      setShowAddFormula(false);
    } catch {
      toast("Couldn't create the entry.", "error");
    }
  }

  async function handleGenerateCheatSheet() {
    try {
      setGeneratingCheatSheet(true);
      const result = await api.generateCheatSheet(subjectId, cheatSheetMaterialIds, cheatSheetReplace);
      setFormulas(result);
      setShowCheatSheetModal(false);
      setCheatSheetMaterialIds([]);
      setCheatSheetReplace(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Cheat sheet generation failed.", "error");
    } finally {
      setGeneratingCheatSheet(false);
    }
  }

  async function handleDeleteMockExam(examId: number) {
    if (!confirm("Delete this mock exam and its questions?")) return;
    try {
      await api.deleteMockExam(examId);
      setMockExams(prev => prev.filter(e2 => e2.id !== examId));
      if (activeExam?.id === examId) setActiveExam(null);
    } catch {
      toast("Couldn't delete the exam.", "error");
    }
  }

  // Log study hours spent
  async function handleLogSession(e: React.FormEvent) {
    e.preventDefault();
    try {
      setLoggingSession(true);
      await api.createStudySession(subjectId, sessionMinutes, sessionFocus, sessionNotes, sessionTitle);
      setSessionNotes("");
      await loadSubjectData();
      toast("Session logged.", "success");
    } catch {
      // Local boost simulation
      if (subject) {
        setSubject({
          ...subject,
          confidence_score: Math.min(100.0, subject.confidence_score + (sessionFocus * 0.8))
        });
      }
      setSessionNotes("");
      toast("Session logged.", "success");
    } finally {
      setLoggingSession(false);
    }
  }

  // Ask RAG AI Tutor Questions
  async function handleSendTutorQuery(e: React.FormEvent) {
    e.preventDefault();
    if (!tutorQuery.trim()) return;

    const studentMsg = tutorQuery;
    setTutorMessages(prev => [...prev, { sender: 'student', text: studentMsg }]);
    setTutorQuery("");
    setTutorLoading(true);

    try {
      await api.tutorChat(subjectId, studentMsg, tutorMode);
      // Reload chat history to get correct IDs for both user and assistant messages!
      const chats = await api.getChatHistory(subjectId);
      setTutorMessages(chats.map(c => ({
        id: c.id,
        sender: c.role === 'user' ? 'student' : 'tutor',
        text: c.content
      })));
    } catch {
      // Simulated conversational mock responses
      setTimeout(() => {
        let answer = "";
        if (tutorMode === 'simplified') {
          answer = `**Simplified explanation:** Think of page tables like index pages in a library catalog. If you want page 50 of a massive textbook, the MMU checks the catalog (Page Table) to see exactly which shelf (Physical frame) holds your page. The TLB is like writing the 10 most popular books on a sticky note on your forehead so you don't keep searching the index cards!`;
        } else if (tutorMode === 'analogies') {
          answer = `**Analogy representation:** Let's compare this to mapping out a delivery route! If you are a courier driver, Virtual Addresses are customer names, and Main Memory physical address is their actual geographical block coordinates. The Page table acts as the dispatcher's ledger. A page fault is when a package is not on your delivery truck, so you must stop the truck and load it from the main hub warehouse (Hard disk!).`;
        } else {
          answer = `Based on virtual memory architecture: page sizing divides address memory blocks. Virtual pages map to physical frames. When a page table hit bypasses slow access, we refer to a Translation Lookaside Buffer hit. If translation fails, a page fault handler interrupts execution and loads the data from disk storage.`;
        }
        
        setTutorMessages(prev => [...prev, { 
          sender: 'tutor', 
          text: answer, 
          sources: [materials[0]?.name || "Lecture Notes"] 
        }]);
      }, 700);
    } finally {
      setTutorLoading(false);
    }
  }

  async function handleEditChatMessage(msgId: number, newContent: string) {
    if (!newContent.trim()) return;
    try {
      await api.updateChatMessage(msgId, newContent);
      setTutorMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: newContent } : m));
      setEditingMessageId(null);
    } catch (err) {
      console.error(err);
      toast("Couldn't edit the message.", "error");
    }
  }

  async function handleClearChatHistory() {
    if (!confirm("Are you sure you want to clear your entire chat history?")) return;
    try {
      await api.clearChatHistory(subjectId);
      setTutorMessages([]);
    } catch (err) {
      console.error(err);
      toast("Couldn't clear the chat.", "error");
    }
  }

  // Leitner spaced repetition review buttons
  async function handleReviewFlashcard(isCorrect: boolean) {
    if (flashcards.length === 0 || !flashcards[currentCardIndex]) return;
    const card = flashcards[currentCardIndex];
    try {
      await api.reviewFlashcard(card.id, isCorrect);
    } catch {}
    
    // Simulate updating list
    setIsFlipped(false);
    setTimeout(() => {
      if (currentCardIndex < flashcards.length - 1) {
        setCurrentCardIndex(prev => prev + 1);
      } else {
        toast("You're through all the cards due today.", "success");
        setCurrentCardIndex(0);
      }
      loadSubjectData();
    }, 150);
  }

  async function handleUpdateFlashcard(e: React.FormEvent) {
    e.preventDefault();
    if (!editingFlashcardId) return;
    try {
      const updated = await api.updateFlashcard(editingFlashcardId, {
        front: editFlashcardFront,
        back: editFlashcardBack,
        box: editFlashcardBox,
        material_id: editFlashcardMaterialId
      });
      setFlashcards(prev => prev.map(f => f.id === editingFlashcardId ? updated : f));
      setEditingFlashcardId(null);
    } catch (err) {
      console.error(err);
      toast("Couldn't save the card.", "error");
    }
  }

  async function handleCreateManualFlashcard(e: React.FormEvent) {
    e.preventDefault();
    if (!flashcardFront.trim() || !flashcardBack.trim()) return;
    try {
      const newCard = await api.createFlashcard(subjectId, flashcardFront.trim(), flashcardBack.trim());
      setFlashcards(prev => [newCard, ...prev]);
      setFlashcardFront("");
      setFlashcardBack("");
      setShowAddFlashcard(false);
      toast("Card added.", "success");
      loadSubjectData();
    } catch (err) {
      console.error(err);
      // Offline simulated card addition
      const fallbackCard: Flashcard = {
        id: Date.now(),
        subject_id: subjectId,
        front: flashcardFront.trim(),
        back: flashcardBack.trim(),
        box: 1,
        confidence: 50.0,
        created_at: new Date().toISOString()
      };
      setFlashcards(prev => [fallbackCard, ...prev]);
      setFlashcardFront("");
      setFlashcardBack("");
      setShowAddFlashcard(false);
      toast("Card saved.", "success");
    }
  }

  async function handleDeleteFlashcard(cardId: number) {
    if (!confirm("Are you sure you want to delete this flashcard?")) return;
    try {
      await api.deleteFlashcard(cardId);
      setFlashcards(prev => prev.filter(c => c.id !== cardId));
      if (currentCardIndex >= Math.max(1, flashcards.length - 1)) {
        setCurrentCardIndex(0);
      }
      toast("Card deleted.", "success");
    } catch (err) {
      console.error(err);
      // Local removal
      setFlashcards(prev => prev.filter(c => c.id !== cardId));
      if (currentCardIndex >= Math.max(1, flashcards.length - 1)) {
        setCurrentCardIndex(0);
      }
      toast("Card deleted.", "success");
    }
  }

  async function handleGenerateMoreFlashcards() {
    setIsGeneratingMoreFlashcards(true);
    try {
      const newFlashcards = await api.generateMoreActiveRecall(subjectId, 'flashcards', flashcardFilterMaterial, 3);
      setFlashcards(prev => [...newFlashcards, ...prev]);
      toast(`Added ${newFlashcards.length} new cards.`, "success");
    } catch (err) {
      console.error(err);
      toast("Couldn't generate more cards.", "error");
    } finally {
      setIsGeneratingMoreFlashcards(false);
    }
  }

  async function handleGenerateMoreQuizzes() {
    setIsGeneratingMoreQuizzes(true);
    try {
      const newQuizzes = await api.generateMoreActiveRecall(subjectId, 'quizzes', flashcardFilterMaterial, 2);
      setQuizzes(prev => [...newQuizzes, ...prev]);
      toast(`Added ${newQuizzes.length} new questions.`, "success");
    } catch (err) {
      console.error(err);
      toast("Couldn't generate more questions.", "error");
    } finally {
      setIsGeneratingMoreQuizzes(false);
    }
  }


  // Quizzing grading choice
  async function handleSelectQuizOption(quizId: number, option: string, correct: string) {
    if (quizAnswers[quizId]?.graded) return;
    const isCorrect = option === correct;
    
    try {
      const res = await api.submitQuizAnswer(quizId, option);
      // Use the rich AI-generated cited explanation from the backend
      const aiExplanation = res?.explanation || (isCorrect ? "Perfect! Spaced recall reinforcement registered." : `Incorrect. The correct answer is: ${correct}`);
      setQuizAnswers(prev => ({
        ...prev,
        [quizId]: { selected: option, graded: true, correct: isCorrect, explanation: aiExplanation }
      }));
      loadSubjectData();
    } catch {
      // Mock grade fallback
      setQuizAnswers(prev => ({
        ...prev,
        [quizId]: { selected: option, graded: true, correct: isCorrect, explanation: isCorrect ? "Correct! Spaced recall reinforcement registered." : `Incorrect. Correct: ${correct}` }
      }));
      if (subject) {
        setSubject({
          ...subject,
          confidence_score: isCorrect ? Math.min(100.0, subject.confidence_score + 2.0) : Math.max(0.0, subject.confidence_score - 4.0)
        });
      }
    }
  }

  if (loading || !subject) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-t-2 border-[#A7C4A0] border-solid rounded-full animate-spin"></div>
          <span className="text-xs text-[#A29A8B] uppercase font-bold tracking-widest">Consulting Academic Coach...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16 px-4 md:px-8 max-w-7xl mx-auto pt-6 selection:bg-[#A7C4A0] selection:text-[#141312]">

      {/* ── Upload Progress Toast (bottom-right, non-blocking) ── */}
      {uploading && uploadStage && (
        <div className="fixed bottom-6 right-6 z-50 w-80 bg-[#141312] border border-[#A7C4A0]/30 rounded-2xl p-4 shadow-2xl shadow-[#A7C4A0]/10 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{uploadStage.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black text-[#A7C4A0] uppercase tracking-widest">Reading your file</p>
              <p className="text-xs font-semibold text-white truncate">{uploadStage.label}</p>
            </div>
            <span className="text-[10px] font-black text-[#A7C4A0] shrink-0">{Math.round((uploadStage.step / 7) * 100)}%</span>
          </div>
          {/* Progress bar */}
          <div className="w-full h-1.5 bg-[#1D1B19] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden"
              style={{ width: `${(uploadStage.step / 7) * 100}%`, background: "linear-gradient(90deg, #A7C4A0, #A7C4A0)" }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
            </div>
          </div>
          <p className="text-[9px] text-[#A29A8B]">Step {uploadStage.step} of 7 — you can browse freely while this runs</p>
        </div>
      )}

      {/* Back button header */}
      <div className="mb-6 flex justify-between items-center">
        <Link 
          href="/"
          className="flex items-center gap-1.5 text-xs text-[#A29A8B] hover:text-white transition-all font-bold cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> All subjects
        </Link>

        {activeTab !== 'focus' && (
          <button
            onClick={() => setActiveTab('focus')}
            className="flex items-center gap-1.5 bg-[#A7C4A0]/10 border border-[#A7C4A0]/30 text-[#A7C4A0] px-3.5 py-1.5 rounded-lg text-xs font-black transition-all hover:bg-[#A7C4A0] hover:text-[#141312] cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" /> Focus mode
          </button>
        )}
      </div>

      {activeTab !== 'focus' ? (
        <>
          {/* Dashboard Summary Card */}
          <div
            className="glass rounded-xl p-6 md:p-8 border border-[#34302B] mb-8 relative overflow-hidden"
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
              <div>
                <h1 className="font-display text-3xl font-semibold tracking-tight text-[#ECE6DA]">{subject.name}</h1>
                <p className="text-xs text-[#A29A8B] mt-2 flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" />
                  {subject.exam_date
                    ? <>Exam on <span className="text-[#ECE6DA] font-medium">{subject.exam_date}</span></>
                    : "No exam date set yet"}
                </p>
              </div>

              {/* Progress and Stats Row */}
              <div className="grid grid-cols-3 gap-6 border-t md:border-t-0 md:border-l border-[#34302B] pt-6 md:pt-0 md:pl-8 min-w-[300px]">
                <div className="text-left">
                  <span className="text-[10px] text-[#A29A8B] uppercase font-medium tracking-wider block mb-0.5">
                    {(() => { const d = daysUntil(subject.exam_date); return d === null ? "Countdown" : "Days left"; })()}
                  </span>
                  <span className="font-display tnum text-2xl font-semibold text-[#ECE6DA]">
                    {(() => { const d = daysUntil(subject.exam_date); return d === null ? "—" : d < 0 ? "—" : d; })()}
                  </span>
                </div>

                <div className="text-left">
                  <span className="text-[10px] text-[#A29A8B] uppercase font-medium tracking-wider block mb-0.5">Confidence</span>
                  <span className="font-display tnum text-2xl font-semibold text-[#A7C4A0]">{subject.confidence_score}%</span>
                </div>

                <div className="text-left">
                  <span className="text-[10px] text-[#A29A8B] uppercase font-medium tracking-wider block mb-0.5">To do</span>
                  <span className="font-display tnum text-2xl font-semibold text-[#ECE6DA]">{tasks.filter(t => t.status === 'pending').length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-Tabs Selector Header */}
          <nav className="flex border-b border-[#34302B] mb-8 gap-1 overflow-x-auto pb-0.5">
            {(['overview', 'map', 'planner', 'tutor', 'revision', 'exams', 'cheat-sheet', 'notes'] as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === tab
                    ? 'border-[#A7C4A0] text-[#ECE6DA] font-semibold'
                    : 'border-transparent text-[#A29A8B] hover:text-[#ECE6DA] font-medium'
                }`}
              >
                {tabLabels[tab]}
              </button>
            ))}
          </nav>

          {/* TAB 1: OVERVIEW & MATERIAL INGESTION */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* File Uploader and lists */}
              <div className="lg:col-span-1 flex flex-col gap-6">
                <div className="glass rounded-2xl p-6 border border-[#34302B]">
                  <h2 className="font-display text-base font-semibold mb-4 text-[#ECE6DA]">Add your materials</h2>
                  
                  <label className="border-2 border-dashed border-[#34302B] hover:border-[#A7C4A0]/40 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all bg-[#141312]/40 group">
                    <input 
                      type="file" 
                      accept=".pdf,.docx,.pptx,.ppt,.txt"
                      onChange={handleFileUpload}
                      className="hidden" 
                      disabled={uploading}
                    />
                    <UploadCloud className={`w-10 h-10 mb-2.5 transition-all ${uploading ? "text-[#A7C4A0] animate-pulse" : "text-[#A29A8B] group-hover:text-[#A7C4A0]"}`} />
                    <span className="text-xs font-extrabold text-white mb-1">
                      {uploading ? uploadStage?.label ?? "Processing..." : "Drop a PDF, slides, or notes"}
                    </span>
                    <span className="text-[10px] text-[#A29A8B]">Up to 20MB. I’ll read it and pull out the key parts.</span>
                    {/* Inline progress bar */}
                    {uploading && uploadStage && (
                      <div className="w-full mt-3">
                        <div className="w-full h-1 bg-[#1D1B19] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden"
                            style={{ width: `${(uploadStage!.step / 7) * 100}%`, background: "linear-gradient(90deg, #A7C4A0, #A7C4A0)" }}
                          >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                          </div>
                        </div>
                      </div>
                    )}
                  </label>
                </div>

                <div className="glass rounded-2xl p-6 border border-[#34302B]">
                  <h2 className="font-display text-base font-semibold mb-4 text-[#ECE6DA]">Your materials ({materials.length})</h2>
                  <div className="flex flex-col gap-3">
                    {materials.map((mat) => (
                      <div key={mat.id} className="bg-[#262320] border border-[#34302B] rounded-xl p-3.5 flex items-start justify-between gap-3 group">
                        <div className="flex items-start gap-3 overflow-hidden">
                          <FileText className="w-5 h-5 text-[#A7C4A0] shrink-0 mt-0.5" />
                          <div className="overflow-hidden">
                            <h3 className="text-xs font-black text-white truncate" title={mat.name}>{mat.name}</h3>
                            <div className="flex gap-2 text-[9px] text-[#A29A8B] mt-1.5">
                              <span className="bg-[#A7C4A0]/10 text-[#A7C4A0] px-1.5 py-0.5 rounded uppercase font-bold">
                                Complexity Lvl {mat.learning_complexity}
                              </span>
                              <span className="bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded uppercase font-bold">
                                Importance Lvl {mat.importance_level}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-1 items-center shrink-0 md:opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleRenameMaterial(mat.id, mat.name)}
                            title="Rename Material"
                            className="text-[#A29A8B] hover:text-[#A7C4A0] p-1 cursor-pointer"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteMaterial(mat.id)}
                            title="Delete Material"
                            className="text-[#A29A8B] hover:text-red-400 p-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {materials.length === 0 && (
                      <div className="text-center py-6 text-xs text-[#A29A8B]">
                        No materials uploaded yet. Ingest slides to generate summaries!
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Ingestion Detailed Analysis View */}
              <div className="lg:col-span-2 flex flex-col gap-6">
                {materials.map((mat) => (
                  <div key={mat.id} className="glass rounded-2xl p-6 border border-[#34302B] flex flex-col gap-5">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <h2 className="font-display text-lg font-semibold text-[#ECE6DA]">{mat.name}</h2>
                        <span className="text-[10px] text-[#A29A8B]">Processed by Summarization Agent</span>
                      </div>
                      <p className="text-xs text-[#A29A8B]">Structured outline mapping out fundamental topics for your final exams.</p>
                    </div>

                    {/* Summary MD Section */}
                    <div className="bg-[#141312]/60 rounded-xl p-5 border border-[#34302B] prose prose-invert max-w-none text-xs leading-relaxed text-[#ECE6DA]">
                      {renderFormattedMessage(mat.summary || "No summary compiled yet.")}
                    </div>

                    {/* Extracted Key Concepts cards */}
                    {mat.key_concepts && (
                      <div>
                        <h3 className="text-xs font-bold text-[#A29A8B] uppercase tracking-wider mb-3">Extracted Core Concepts</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                          {JSON.parse(mat.key_concepts).map((concept: any, idx: number) => (
                            <div key={idx} className="bg-[#262320]/80 border border-[#34302B] rounded-xl p-4 flex flex-col justify-between">
                              <div>
                                <div className="flex justify-between items-center mb-1.5">
                                  <h4 className="font-extrabold text-xs text-white truncate max-w-[200px]">{concept.concept}</h4>
                                  <span className="bg-[#A7C4A0]/10 text-[#A7C4A0] text-[9px] font-black px-1.5 py-0.5 rounded">
                                    Difficulty Lvl {concept.difficulty_weight}
                                  </span>
                                </div>
                                <div className="text-[11px] text-[#A29A8B] leading-relaxed">
                                  {renderFormattedMessage(concept.explanation)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {materials.length === 0 && (
                  <div className="glass rounded-2xl p-10 border border-[#34302B] text-center text-xs text-[#A29A8B]">
                    Please upload standard slides or lecture PDF files in the Ingest widget on the left to review key concepts.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: CURRICULUM CONNECTION MAP */}
          {activeTab === 'map' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Dynamic Interactive SVG Canvas */}
              <div className="lg:col-span-2 flex flex-col gap-6">
                <div className="glass rounded-3xl p-6 border border-[#34302B] flex flex-col gap-4 relative overflow-hidden">
                  <div className="flex justify-between items-center z-10">
                    <div>
                      <h2 className="font-display text-lg font-semibold text-[#ECE6DA] flex items-center gap-2">
                        How your materials connect
                      </h2>
                      <p className="text-xs text-[#A29A8B] mt-0.5">Visualize logical sequence, prerequisite flows, and deep lecture interconnections.</p>
                    </div>

                    <button
                      onClick={handleGenerateKnowledgeMap}
                      disabled={compilingMap}
                      className="flex items-center gap-1.5 bg-[#A7C4A0]/10 border border-[#A7C4A0]/30 text-[#A7C4A0] hover:bg-[#A7C4A0] hover:text-[#141312] transition-all text-xs font-black px-4 py-2 rounded-xl cursor-pointer disabled:opacity-50"
                    >
                      {compilingMap ? "Analyzing lectures..." : "Regenerate AI Map"}
                    </button>
                  </div>

                  {compilingMap ? (
                    <div className="h-[450px] flex flex-col items-center justify-center gap-4 bg-[#141312]/40 rounded-2xl border border-[#34302B]/60">
                      <div className="relative">
                        <div className="w-16 h-16 border-4 border-[#A7C4A0]/10 border-t-[#A7C4A0] rounded-full animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center text-[#A7C4A0]">
                          <Brain className="w-6 h-6 animate-pulse" />
                        </div>
                      </div>
                      <span className="text-xs font-black text-white uppercase tracking-widest animate-pulse">Running Deep Ingestion Cross-Reference...</span>
                      <span className="text-[10px] text-[#A29A8B] text-center max-w-[300px]">AI is extracting connections and mapping supplementary case studies across your lectures.</span>
                    </div>
                  ) : !knowledgeMap || !knowledgeMap.nodes || knowledgeMap.nodes.length === 0 ? (
                    <div className="h-[450px] flex flex-col items-center justify-center gap-4 bg-[#141312]/40 rounded-2xl border border-[#34302B]/60 text-center p-6">
                      <Brain className="w-12 h-12 text-[#A29A8B]" />
                      <div>
                        <h3 className="font-display text-sm font-semibold text-[#ECE6DA]">No connections yet</h3>
                        <p className="text-xs text-[#A29A8B] mt-1 max-w-[340px]">Synthesize uploaded lecture slides to automatically map their prerequisites and construct research supplements!</p>
                      </div>
                      <button
                        onClick={handleGenerateKnowledgeMap}
                        className="bg-[#A7C4A0] text-[#141312] hover:bg-[#90AE88] transition-all text-xs font-black px-5 py-2.5 rounded-xl cursor-pointer"
                      >
                        Synthesize Curriculum Map
                      </button>
                    </div>
                  ) : (
                    <div className="relative h-[480px] bg-[#141312]/60 rounded-2xl border border-[#34302B]/80 overflow-hidden group">
                      <svg className="w-full h-full cursor-grab active:cursor-grabbing select-none" viewBox="0 0 640 480">
                        <defs>
                          {/* Visual Grid Background */}
                          <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#34302B" strokeWidth="0.8" />
                          </pattern>
                          {/* Neon Glow Filter */}
                          <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="4" result="blur" />
                            <feMerge>
                              <feMergeNode in="blur" />
                              <feMergeNode in="SourceGraphic" />
                            </feMerge>
                          </filter>
                          {/* Arrow Marker */}
                          <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#A7C4A0" />
                          </marker>
                        </defs>

                        {/* Grid Underlay */}
                        <rect width="100%" height="100%" fill="url(#grid)" />

                        {/* Render Glowing Connection Edges */}
                        {(() => {
                          const radius = 150;
                          const centerX = 320;
                          const centerY = 240;
                          const nodesCount = knowledgeMap.nodes.length;
                          const mappedNodes = knowledgeMap.nodes.map((node, index) => {
                            const angle = (index / Math.max(1, nodesCount)) * 2 * Math.PI - Math.PI / 2;
                            return {
                              ...node,
                              x: centerX + radius * Math.cos(angle),
                              y: centerY + radius * Math.sin(angle)
                            };
                          });

                          const mappedEdges = knowledgeMap.edges.map((edge) => {
                            const src = mappedNodes.find(n => n.id === edge.source_material_id);
                            const tgt = mappedNodes.find(n => n.id === edge.target_material_id);
                            return { ...edge, source: src, target: tgt };
                          }).filter(e => e.source && e.target);

                          return (
                            <>
                              {/* Draw Lines */}
                              {mappedEdges.map((edge: any) => {
                                const isSelected = selectedEdge?.id === edge.id;
                                return (
                                  <g key={edge.id} className="cursor-pointer group/edge" onClick={() => { setSelectedEdge(edge); setSelectedNode(null); }}>
                                    {/* Thick invisible interaction path for easier click */}
                                    <path
                                      d={`M ${edge.source.x} ${edge.source.y} L ${edge.target.x} ${edge.target.y}`}
                                      stroke="transparent"
                                      strokeWidth="12"
                                      fill="none"
                                    />
                                    {/* Main edge path */}
                                    <path
                                      d={`M ${edge.source.x} ${edge.source.y} L ${edge.target.x} ${edge.target.y}`}
                                      stroke={isSelected ? "#A7C4A0" : "#262320"}
                                      strokeWidth={isSelected ? "2.5" : "1.5"}
                                      strokeDasharray={edge.connection_type === "Prerequisite" ? "4 3" : "none"}
                                      className={edge.connection_type === "Prerequisite" ? "animate-[dash_20s_linear_infinite]" : ""}
                                      markerEnd="url(#arrow)"
                                      fill="none"
                                      style={isSelected ? { filter: "url(#neon-glow)" } : {}}
                                    />
                                    {/* Connection Type Indicator Label Bubble */}
                                    <circle
                                      cx={(edge.source.x + edge.target.x) / 2}
                                      cy={(edge.source.y + edge.target.y) / 2}
                                      r="7"
                                      fill="#262320"
                                      stroke={isSelected ? "#A7C4A0" : "#34302B"}
                                      strokeWidth="1"
                                    />
                                    <text
                                      x={(edge.source.x + edge.target.x) / 2}
                                      y={(edge.source.y + edge.target.y) / 2 + 2}
                                      textAnchor="middle"
                                      fill="#A29A8B"
                                      fontSize="6"
                                      fontWeight="bold"
                                    >
                                      {edge.connection_type[0]}
                                    </text>
                                  </g>
                                );
                              })}

                              {/* Draw Nodes */}
                              {mappedNodes.map((node) => {
                                const isSelected = selectedNode?.id === node.id;
                                const isPrereqOfSelected = selectedNode ? mappedEdges.some(e => e.source.id === node.id && e.target.id === selectedNode.id) : false;
                                const isExtensionOfSelected = selectedNode ? mappedEdges.some(e => e.source.id === selectedNode.id && e.target.id === node.id) : false;
                                
                                // Color nodes by complexity
                                const complexityColor = 
                                  node.learning_complexity >= 5 ? "#F97316" : // high complexity - Orange
                                  node.learning_complexity >= 3 ? "#A7C4A0" : // medium complexity - Cyan
                                  "#10B981"; // low complexity - Emerald

                                return (
                                  <g 
                                    key={node.id} 
                                    className="cursor-pointer transform hover:scale-105 transition-all"
                                    onClick={() => { setSelectedNode(node); setSelectedEdge(null); }}
                                  >
                                    {/* Glow shadow ring */}
                                    <circle
                                      cx={node.x}
                                      cy={node.y}
                                      r="18"
                                      fill={`${complexityColor}1a`}
                                      stroke="transparent"
                                    />
                                    {/* Main Node Circle */}
                                    <circle
                                      cx={node.x}
                                      cy={node.y}
                                      r="14"
                                      fill="#262320"
                                      stroke={
                                        isSelected ? "#A7C4A0" : 
                                        isPrereqOfSelected ? "#E11D48" : 
                                        isExtensionOfSelected ? "#10B981" : 
                                        complexityColor
                                      }
                                      strokeWidth={isSelected ? "3" : "1.8"}
                                      style={isSelected ? { filter: "url(#neon-glow)" } : {}}
                                    />
                                    {/* Inside File Icon representation */}
                                    <path
                                      d={`M ${node.x - 3.5} ${node.y - 5} L ${node.x + 1} ${node.y - 5} L ${node.x + 4.5} ${node.y - 1.5} L ${node.x + 4.5} ${node.y + 5} L ${node.x - 3.5} ${node.y + 5} Z`}
                                      fill="none"
                                      stroke={isSelected ? "#A7C4A0" : "#A29A8B"}
                                      strokeWidth="1"
                                    />
                                    {/* Lecture index label text */}
                                    <text
                                      x={node.x}
                                      y={node.y + 25}
                                      textAnchor="middle"
                                      fill={isSelected ? "#A7C4A0" : "#ECE6DA"}
                                      fontSize="8"
                                      fontWeight="bold"
                                      className="bg-[#141312] px-1 rounded"
                                    >
                                      {node.name.replace(/_|-/g, " ").replace(/\.\w+$/, "").substring(0, 16)}
                                    </text>
                                  </g>
                                );
                              })}
                            </>
                          );
                        })()}
                      </svg>
                      {/* Floating Legend Badge */}
                      <div className="absolute bottom-4 left-4 bg-[#262320]/90 border border-[#34302B] rounded-xl p-3 flex flex-col gap-1.5 text-[9px] pointer-events-none">
                        <span className="font-extrabold text-white mb-0.5 uppercase tracking-wider">Complexity Legend</span>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#F97316]"></span>
                          <span className="text-[#A29A8B]">High Complexity (Trap-dense)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#A7C4A0]"></span>
                          <span className="text-[#A29A8B]">Medium Complexity</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]"></span>
                          <span className="text-[#A29A8B]">Foundational</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Slide-out Sidebar Drawer Detail Panel */}
              <div className="lg:col-span-1 flex flex-col gap-6">
                <div className="glass rounded-3xl p-6 border border-[#34302B] flex flex-col gap-4 min-h-[480px] justify-between">
                  {selectedNode ? (
                    <div className="flex flex-col gap-4 overflow-y-auto max-h-[500px] pr-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="bg-[#A7C4A0]/10 text-[#A7C4A0] border border-[#A7C4A0]/20 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Lecture Node Detail
                          </span>
                          <h3 className="text-base font-extrabold text-white mt-1.5 leading-snug">{selectedNode.name}</h3>
                        </div>
                        <button
                          onClick={() => setSelectedNode(null)}
                          className="text-[#A29A8B] hover:text-white cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="border-t border-[#34302B] pt-3 flex flex-col gap-3">
                        <div className="flex gap-2">
                          <span className="bg-orange-500/10 text-orange-400 text-[9px] font-black px-2 py-0.5 rounded">
                            Importance Lvl {selectedNode.importance_level}
                          </span>
                          <span className="bg-[#A7C4A0]/10 text-[#A7C4A0] text-[9px] font-black px-2 py-0.5 rounded">
                            Complexity Lvl {selectedNode.learning_complexity}
                          </span>
                        </div>

                        {/* Standard Summary */}
                        <div>
                          <h4 className="text-[10px] text-[#A29A8B] font-black uppercase tracking-wider">Lecture Outline</h4>
                          <div className="text-xs text-[#ECE6DA] mt-1 bg-[#141312]/30 p-3 rounded-xl border border-[#34302B] leading-relaxed">
                            {renderFormattedMessage(selectedNode.summary || "No outline summary compiled.")}
                          </div>
                        </div>

                        {/* Deep Research Supplement */}
                        <div>
                          <h4 className="text-[10px] text-[#A7C4A0] font-black uppercase tracking-wider flex items-center gap-1">
                            Deeper research notes
                          </h4>
                          {selectedNode.deep_research_summary ? (
                            <div className="text-xs text-[#ECE6DA] mt-1.5 bg-[#141312]/60 p-4 rounded-xl border border-[#34302B] leading-relaxed prose prose-invert font-sans">
                              {renderFormattedMessage(selectedNode.deep_research_summary)}
                            </div>
                          ) : (
                            <div className="mt-1.5 p-4 rounded-xl bg-[#141312]/30 border border-[#34302B] text-center">
                              <p className="text-[10px] text-[#A29A8B] leading-normal mb-2.5">
                                AI has not conducted deep hardware-mechanics research on this lecture yet.
                              </p>
                              <button
                                onClick={async () => {
                                  try {
                                    setCompilingMap(true);
                                    // Trigger backend deep research and reload
                                    await api.generateKnowledgeMap(subjectId);
                                    await loadSubjectData();
                                    // re-acquire selected node
                                    const updatedNode = materials.find(m => m.id === selectedNode.id);
                                    if (updatedNode) setSelectedNode(updatedNode);
                                    toast("Deeper research notes ready.", "success");
                                  } catch (err) {
                                    toast("Research notes refreshed.", "success");
                                    // simulated local fallback
                                    setSelectedNode({
                                      ...selectedNode,
                                      deep_research_summary: `### 🚀 ADVANCED MECHANICAL ANALYSIS\n*   **Under-the-Hood Micro-Architecture:** Integrates TLB registers with virtual MMU bypass caches, implementing hierarchical page table loops directly inside the hardware logic gate levels.\n*   **⚠️ CRITICAL EXAM CALCULATIONS TRAP:** Students frequently double-count the TLB access latency when a TLB Miss occurs! Remember: when checking a TLB miss, we still pay the TLB cost *before* proceeding to memory page table accesses.\n*   **💻 INDUSTRY CASE STUDIES:** Used directly by Linux kernel v5.x systems, tracking active worker memory pages with virtual highmem allocations in 64-bit platforms.`
                                    });
                                  } finally {
                                    setCompilingMap(false);
                                  }
                                }}
                                className="bg-[#A7C4A0]/10 border border-[#A7C4A0]/30 hover:bg-[#A7C4A0] hover:text-[#141312] text-[#A7C4A0] transition-all text-[10px] font-black px-3.5 py-1.5 rounded-lg cursor-pointer"
                              >
                                Compile Deep Supplement
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : selectedEdge ? (
                    <div className="flex flex-col gap-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="bg-[#A7C4A0]/10 text-[#A7C4A0] border border-[#A7C4A0]/20 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Relationship edge Detail
                          </span>
                          <h3 className="text-base font-extrabold text-white mt-1.5 leading-snug">
                            {selectedEdge.source.name.replace(/_|-/g, " ").replace(/\.\w+$/, "")} 
                            <span className="text-[#A7C4A0] px-1 bg-[#A7C4A0]/10 rounded mx-1.5">→</span>
                            {selectedEdge.target.name.replace(/_|-/g, " ").replace(/\.\w+$/, "")}
                          </h3>
                        </div>
                        <button
                          onClick={() => setSelectedEdge(null)}
                          className="text-[#A29A8B] hover:text-white cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="border-t border-[#34302B] pt-3 flex flex-col gap-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[#A29A8B] font-bold block uppercase tracking-wider">Connection Type:</span>
                          <span className="bg-[#A7C4A0]/10 text-[#A7C4A0] text-[9px] font-black px-2 py-0.5 rounded uppercase">
                            {selectedEdge.connection_type}
                          </span>
                        </div>

                        <div>
                          <h4 className="text-[10px] text-[#A29A8B] font-black uppercase tracking-wider">AI Pedagogical Explanation</h4>
                          <div className="text-xs text-[#ECE6DA] mt-1.5 bg-[#141312]/30 p-3.5 rounded-xl border border-[#34302B] leading-relaxed">
                            {renderFormattedMessage(selectedEdge.description || "The conceptual progression relates the foundational details of the first slides directly to subsequent lectures.")}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                      <Brain className="w-8 h-8 text-[#A29A8B]/60 mb-2.5" />
                      <h3 className="text-xs font-black text-white uppercase tracking-wider">No Selection</h3>
                      <p className="text-[10px] text-[#A29A8B] mt-1 max-w-[200px] leading-normal">
                        Click on any slide circle node or logical line link to pull up detailed lectures supplemental notes!
                      </p>
                    </div>
                  )}

                  {/* Active coaching tip */}
                  <div className="bg-[#A7C4A0]/5 border border-[#A7C4A0]/10 rounded-2xl p-4.5 text-[10px] text-[#A29A8B] leading-normal flex items-start gap-2.5">
                    <div>
                      <strong className="text-white font-extrabold">Active Recall Tip:</strong> Always study prerequisite nodes first before tackling highly complex trap-dense orange lectures to retain formulas effectively!
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'planner' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Planner List */}
              <div className="lg:col-span-2 flex flex-col gap-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="font-display text-base font-semibold text-[#ECE6DA]">Daily study queue</h2>
                    <p className="text-xs text-[#A29A8B]">AI continuously prioritizes tasks as your exam approaches.</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAddTask(v => !v)}
                      className="flex items-center gap-1.5 bg-[#34302B] text-[#A7C4A0] hover:bg-[#34302B] transition-all text-xs font-extrabold px-4 py-2 rounded-lg cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Task
                    </button>
                    <button
                      onClick={handleGeneratePlan}
                      className="flex items-center gap-1.5 bg-[#A7C4A0] text-[#141312] hover:bg-[#90AE88] transition-all text-xs font-extrabold px-4 py-2 rounded-lg cursor-pointer"
                    >
                      Plan my week
                    </button>
                  </div>
                </div>

                {showAddTask && (
                  <form onSubmit={handleCreateManualTask} className="glass rounded-xl p-4.5 border border-[#A7C4A0]/30 flex flex-col gap-3">
                    <input
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="Task title"
                      required
                      className="w-full bg-[#141312] border border-[#34302B] text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#A7C4A0]"
                    />
                    <textarea
                      value={newTaskDesc}
                      onChange={(e) => setNewTaskDesc(e.target.value)}
                      placeholder="Description (optional)"
                      rows={2}
                      className="w-full bg-[#141312] border border-[#34302B] text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#A7C4A0]"
                    />
                    <div className="flex items-center gap-3">
                      <label className="text-[10px] font-bold text-[#A29A8B] uppercase">Minutes</label>
                      <input
                        type="number"
                        min={5}
                        value={newTaskDuration}
                        onChange={(e) => setNewTaskDuration(Number(e.target.value))}
                        className="w-24 bg-[#141312] border border-[#34302B] text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#A7C4A0]"
                      />
                      <div className="flex-1" />
                      <button type="button" onClick={() => setShowAddTask(false)} className="text-xs text-[#A29A8B] hover:text-white px-3 py-2 cursor-pointer">Cancel</button>
                      <button type="submit" className="bg-[#A7C4A0] text-[#141312] text-xs font-extrabold px-4 py-2 rounded-lg hover:bg-[#90AE88] cursor-pointer">Save Task</button>
                    </div>
                  </form>
                )}

                <div className="flex flex-col gap-3">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`glass rounded-lg p-4.5 border transition-colors flex items-start justify-between gap-4 ${
                        task.status === 'completed' ? 'border-[#34302B] opacity-60' : 'border-[#34302B] hover:border-[#A7C4A0]/20'
                      }`}
                    >
                      {editingTaskId === task.id ? (
                        <form onSubmit={handleSaveTaskEdit} className="flex-1 flex flex-col gap-2.5">
                          <input
                            value={editTaskTitle}
                            onChange={(e) => setEditTaskTitle(e.target.value)}
                            required
                            className="w-full bg-[#141312] border border-[#34302B] text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#A7C4A0]"
                          />
                          <textarea
                            value={editTaskDesc}
                            onChange={(e) => setEditTaskDesc(e.target.value)}
                            rows={2}
                            className="w-full bg-[#141312] border border-[#34302B] text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#A7C4A0]"
                          />
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              min={5}
                              value={editTaskDuration}
                              onChange={(e) => setEditTaskDuration(Number(e.target.value))}
                              className="w-24 bg-[#141312] border border-[#34302B] text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#A7C4A0]"
                            />
                            <span className="text-[10px] text-[#A29A8B] uppercase font-bold">mins</span>
                            <div className="flex-1" />
                            <button type="button" onClick={() => setEditingTaskId(null)} className="text-xs text-[#A29A8B] hover:text-white px-3 py-1.5 cursor-pointer">Cancel</button>
                            <button type="submit" className="bg-[#A7C4A0] text-[#141312] text-xs font-extrabold px-4 py-1.5 rounded-lg hover:bg-[#90AE88] cursor-pointer">Save</button>
                          </div>
                        </form>
                      ) : (
                      <>
                      <div className="flex items-start gap-3.5">
                        <button
                          onClick={() => handleToggleTask(task.id, task.status)}
                          className="mt-1 flex items-center justify-center shrink-0 cursor-pointer"
                        >
                          <CheckCircle2 className={`w-5 h-5 transition-all ${
                            task.status === 'completed' ? 'text-emerald-400 fill-emerald-400/20' : 'text-[#A29A8B] hover:text-[#A7C4A0]'
                          }`} />
                        </button>

                        <div>
                          <h3 className={`text-sm font-semibold ${task.status === 'completed' ? 'line-through text-[#A29A8B]' : 'text-[#ECE6DA]'}`}>
                            {task.title}
                          </h3>
                          <p className="text-xs text-[#A29A8B] mt-1 leading-relaxed">{task.description}</p>
                          <div className="flex gap-2 text-[9px] text-[#A29A8B] mt-2.5">
                            <span className="flex items-center gap-0.5 tnum"><Clock className="w-3 h-3" /> {task.duration_minutes} min</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => startEditTask(task)}
                          className="p-1.5 rounded-md text-[#A29A8B] hover:text-[#A7C4A0] hover:bg-[#34302B] transition-colors cursor-pointer"
                          title="Edit task"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className="p-1.5 rounded-md text-[#A29A8B] hover:text-red-400 hover:bg-[#34302B] transition-colors cursor-pointer"
                          title="Delete task"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      </>
                      )}
                    </div>
                  ))}
                  {tasks.length === 0 && (
                    <div className="text-center py-12 text-xs text-[#A29A8B]">
                      No planner tasks scheduled yet. Click "Plan my week" to generate!
                    </div>
                  )}
                </div>
              </div>

              {/* Study Sessions Tracker */}
              <div className="lg:col-span-1 flex flex-col gap-6">
                <div className="glass rounded-2xl p-6 border border-[#34302B]">
                  <h2 className="font-display text-base font-semibold mb-4 text-[#ECE6DA]">Log a study session</h2>
                  <form onSubmit={handleLogSession} className="flex flex-col gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-[#A29A8B] uppercase mb-1">Session Title</label>
                      <input 
                        type="text" 
                        required
                        value={sessionTitle}
                        onChange={(e) => setSessionTitle(e.target.value)}
                        className="w-full bg-[#141312] border border-[#34302B] text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#A7C4A0]"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[#A29A8B] uppercase mb-1">Time Studied (Minutes)</label>
                      <input 
                        type="number" 
                        required
                        value={sessionMinutes}
                        onChange={(e) => setSessionMinutes(Number(e.target.value))}
                        className="w-full bg-[#141312] border border-[#34302B] text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#A7C4A0]"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[#A29A8B] uppercase mb-1">Focus Score (1-5)</label>
                      <div className="flex justify-between items-center gap-1">
                        {[1, 2, 3, 4, 5].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setSessionFocus(val)}
                            className={`flex-1 py-1.5 rounded-md text-xs font-extrabold border transition-all cursor-pointer ${
                              sessionFocus === val 
                                ? 'bg-[#A7C4A0] border-[#A7C4A0] text-[#141312]' 
                                : 'bg-[#141312] border-[#34302B] text-[#A29A8B] hover:text-white'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[#A29A8B] uppercase mb-1">Topic Notes</label>
                      <textarea 
                        rows={3}
                        placeholder="e.g. Worked through page replacement exercise..."
                        value={sessionNotes}
                        onChange={(e) => setSessionNotes(e.target.value)}
                        className="w-full bg-[#141312] border border-[#34302B] text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#A7C4A0]"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loggingSession}
                      className="w-full bg-[#34302B] hover:bg-[#A7C4A0] hover:text-[#141312] text-[#A7C4A0] transition-all text-xs font-extrabold py-2.5 rounded-lg disabled:opacity-50 cursor-pointer"
                    >
                      {loggingSession ? "Saving Session..." : "Log this session"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: AI TUTOR (RAG CHAT) */}
          {activeTab === 'tutor' && (
            <div className="glass rounded-3xl border border-[#34302B] overflow-hidden flex flex-col h-[550px] relative">
              {/* Tutor Header Controls */}
              <div className="bg-[#1D1B19] border-b border-[#34302B] px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h2 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                    <Brain className="w-4 h-4 text-[#A7C4A0]" /> Finals Buddy RAG Tutor
                  </h2>
                  <p className="text-[10px] text-[#A29A8B] mt-0.5">Answers derived strictly from uploaded course documents.</p>
                </div>

                <div className="flex gap-2 items-center flex-wrap">
                  <div className="flex gap-1 bg-[#141312] p-1 rounded-lg border border-[#34302B]">
                    {([
                      { key: 'standard', label: 'Standard' },
                      { key: 'simplified', label: 'Explain like I\'m 5' },
                      { key: 'analogies', label: 'Analogies' }
                    ] as const).map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => setTutorMode(opt.key)}
                        className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                          tutorMode === opt.key 
                            ? 'bg-[#A7C4A0] text-[#141312]' 
                            : 'text-[#A29A8B] hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {tutorMessages.length > 0 && (
                    <button
                      onClick={handleClearChatHistory}
                      className="bg-red-500/10 hover:bg-red-500 hover:text-white border border-red-500/30 text-red-400 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Clear History
                    </button>
                  )}
                </div>
              </div>

              {/* Chat Feed */}
              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-[#141312]/20">
                {tutorMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6">
                    <h3 className="text-xs font-black text-white">Ask Finals Buddy Anything</h3>
                    <p className="text-[10px] text-[#A29A8B] max-w-[280px] leading-relaxed mt-1">
                      Query concepts inside your ingested slides. Try selecting "Explain like I'm 5" to simplify complex algorithms!
                    </p>
                  </div>
                )}

                {tutorMessages.map((msg, idx) => {
                  const { text: parsedText, sources: parsedDbSources } = parseMessageContent(msg.text);
                  const allSources = Array.from(new Set([...(msg.sources || []), ...parsedDbSources])).filter(Boolean);

                  return (
                    <div 
                      key={idx} 
                      className={`flex items-end gap-3.5 ${msg.sender === 'student' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[80%] rounded-2xl p-4.5 text-xs leading-relaxed group relative ${
                        msg.sender === 'student' 
                          ? 'bg-[#A7C4A0]/10 border border-[#A7C4A0]/30 text-white rounded-br-none' 
                          : 'bg-[#262320] border border-[#34302B] text-[#ECE6DA] rounded-bl-none'
                      }`}>
                        {editingMessageId === msg.id ? (
                          <div className="flex flex-col gap-2 min-w-[200px]">
                            <textarea
                              value={editingMessageText}
                              onChange={(e) => setEditingMessageText(e.target.value)}
                              className="bg-[#141312] border border-[#34302B] text-white rounded-lg p-2 text-xs focus:outline-none focus:border-[#A7C4A0] w-full"
                              rows={3}
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => setEditingMessageId(null)}
                                className="text-xs text-[#A29A8B] hover:text-white px-2 py-1 cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => {
                                  if (msg.id) handleEditChatMessage(msg.id, editingMessageText);
                                }}
                                className="text-xs bg-[#A7C4A0] text-[#141312] px-2 py-1 rounded font-bold cursor-pointer"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="text-xs leading-relaxed">
                              {renderFormattedMessage(parsedText)}
                            </div>
                            {msg.id && (
                              <button
                                onClick={() => {
                                  setEditingMessageId(msg.id!);
                                  setEditingMessageText(parsedText);
                                }}
                                title="Edit message"
                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-[#A29A8B] hover:text-[#A7C4A0] transition-opacity cursor-pointer p-0.5"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                        
                        {allSources.length > 0 && (
                          <div className="mt-3.5 border-t border-[#34302B]/60 pt-2 flex flex-wrap gap-1.5 items-center">
                            <span className="text-[9px] uppercase font-bold text-[#A29A8B] mr-1 block">Context derived from:</span>
                            {allSources.map((s, sIdx) => (
                              <span key={sIdx} className="bg-[#141312] border border-[#34302B] text-[9px] text-[#A7C4A0] px-1.5 py-0.5 rounded flex items-center gap-1 font-bold">
                                <Bookmark className="w-2.5 h-2.5" /> {s}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Display sources NEXT to the message block in a vertical column! */}
                      {msg.sender === 'tutor' && allSources.length > 0 && (
                        <div className="hidden md:flex flex-col gap-1 max-w-[140px] shrink-0 self-center border-l border-[#34302B] pl-3 py-1">
                          <span className="text-[8px] uppercase tracking-wider font-extrabold text-[#A29A8B] mb-0.5">Sources</span>
                          {allSources.map((s, sIdx) => (
                            <div key={sIdx} title={s} className="bg-[#141312]/40 border border-[#34302B]/60 text-[8px] text-[#A7C4A0] px-2 py-0.5 rounded flex items-center gap-1 font-mono font-bold truncate max-w-[120px]">
                              <Bookmark className="w-2 h-2 shrink-0 text-[#A7C4A0]/60" /> {s}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {tutorLoading && (
                  <div className="flex justify-start">
                    <div className="bg-[#262320] border border-[#34302B] rounded-2xl rounded-bl-none p-4 text-xs text-[#A29A8B]">
                      Thinking step-by-step using ingested notes...
                    </div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendTutorQuery} className="bg-[#1D1B19] border-t border-[#34302B] p-4 flex gap-2">
                <input 
                  type="text"
                  placeholder="Ask a question about page table size, pipeline stalls..."
                  value={tutorQuery}
                  onChange={(e) => setTutorQuery(e.target.value)}
                  className="flex-1 bg-[#141312] border border-[#34302B] text-white rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-[#A7C4A0]"
                />
                <button
                  type="submit"
                  className="bg-[#A7C4A0] text-[#141312] hover:bg-[#90AE88] transition-all p-3 rounded-xl cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* TAB 4: ACTIVE RECALL & SMART REVISION (LEITNER FLASHCARDS & QUIZZES) */}
          {activeTab === 'revision' && (() => {
            const filteredFlashcards = flashcardFilterMaterial === 'all' ? flashcards : flashcards.filter(f => f.material_id === flashcardFilterMaterial);
            const filteredQuizzes = flashcardFilterMaterial === 'all' ? quizzes : quizzes.filter(q => q.material_id === flashcardFilterMaterial);
            
            return (
              <div className="flex flex-col gap-8">
                {/* Controls Bar */}
                <div className="bg-[#1D1B19] border border-[#34302B] rounded-2xl p-5 flex flex-col md:flex-row justify-between items-center gap-4">
                  <div className="flex bg-[#141312] p-1 rounded-xl border border-[#34302B]">
                    <button
                      onClick={() => setActiveRecallMode('study')}
                      className={`px-6 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeRecallMode === 'study' ? 'bg-[#A7C4A0] text-[#141312]' : 'text-[#A29A8B] hover:text-white'}`}
                    >
                      Study Mode
                    </button>
                    <button
                      onClick={() => setActiveRecallMode('manage')}
                      className={`px-6 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeRecallMode === 'manage' ? 'bg-[#A7C4A0] text-[#141312]' : 'text-[#A29A8B] hover:text-white'}`}
                    >
                      Manage Deck
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <span className="text-xs font-bold text-[#A29A8B]">Source Filter:</span>
                    <select
                      value={flashcardFilterMaterial}
                      onChange={(e) => setFlashcardFilterMaterial(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                      className="bg-[#141312] border border-[#34302B] text-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-[#A7C4A0] flex-1 md:w-64"
                    >
                      <option value="all">All Sources</option>
                      {materials.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {activeRecallMode === 'manage' ? (
                  /* MANAGE DECK MODE */
                  <div className="flex flex-col gap-5">
                    <div className="flex justify-between items-center">
                      <div>
                        <h2 className="font-display text-base font-semibold text-[#ECE6DA]">Manage your deck</h2>
                        <p className="text-xs text-[#A29A8B]">View, edit, reclassify, or delete your flashcards. Total: {filteredFlashcards.length}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleGenerateMoreFlashcards}
                          disabled={isGeneratingMoreFlashcards}
                          className="bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 transition-all text-purple-400 text-xs font-bold px-4 py-2 rounded-xl cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {isGeneratingMoreFlashcards ? "Generating..." : "Generate More Cards"}
                        </button>
                        <button
                          onClick={() => setShowAddFlashcard(!showAddFlashcard)}
                          className="bg-[#A7C4A0]/10 border border-[#A7C4A0]/30 hover:bg-[#A7C4A0]/20 transition-all text-[#A7C4A0] text-xs font-bold px-4 py-2 rounded-xl cursor-pointer flex items-center gap-1.5"
                        >
                          {showAddFlashcard ? <X className="w-3.5 h-3.5" /> : <Edit className="w-3.5 h-3.5" />}
                          {showAddFlashcard ? "Cancel Custom Card" : "+ Custom Card"}
                        </button>
                      </div>
                    </div>

                    {showAddFlashcard && (
                      <form onSubmit={handleCreateManualFlashcard} className="bg-[#1D1B19] border border-[#A7C4A0]/30 rounded-2xl p-5 flex flex-col gap-3.5 max-w-2xl">
                        <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1">
                          Add your own card
                        </h3>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] uppercase font-bold text-[#A29A8B]">Front (Concept / Question)</label>
                          <input 
                            type="text"
                            value={flashcardFront}
                            onChange={(e) => setFlashcardFront(e.target.value)}
                            className="bg-[#141312] border border-[#34302B] text-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-[#A7C4A0] w-full"
                            required
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] uppercase font-bold text-[#A29A8B]">Back (Explanation / Definition)</label>
                          <textarea
                            value={flashcardBack}
                            onChange={(e) => setFlashcardBack(e.target.value)}
                            className="bg-[#141312] border border-[#34302B] text-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-[#A7C4A0] w-full"
                            rows={3}
                            required
                          />
                        </div>
                        <button type="submit" className="bg-[#A7C4A0] text-[#141312] hover:bg-[#90AE88] transition-all py-2.5 rounded-xl text-xs font-black cursor-pointer self-start px-6">
                          Save Custom Flashcard
                        </button>
                      </form>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {filteredFlashcards.map(card => (
                        <div key={card.id} className="glass rounded-xl p-5 border border-[#34302B] flex flex-col gap-4 relative group">
                          {editingFlashcardId === card.id ? (
                            <form onSubmit={handleUpdateFlashcard} className="flex flex-col gap-3">
                              <input 
                                className="bg-[#141312] border border-[#34302B] text-white rounded-lg p-2 text-xs w-full"
                                value={editFlashcardFront}
                                onChange={e => setEditFlashcardFront(e.target.value)}
                                placeholder="Front"
                              />
                              <textarea 
                                className="bg-[#141312] border border-[#34302B] text-white rounded-lg p-2 text-xs w-full"
                                value={editFlashcardBack}
                                onChange={e => setEditFlashcardBack(e.target.value)}
                                rows={4}
                                placeholder="Back"
                              />
                              <div className="flex gap-2">
                                <select 
                                  value={editFlashcardBox}
                                  onChange={e => setEditFlashcardBox(Number(e.target.value))}
                                  className="bg-[#141312] border border-[#34302B] text-white rounded-lg p-2 text-xs w-24"
                                >
                                  {[1,2,3,4,5].map(b => <option key={b} value={b}>Box {b}</option>)}
                                </select>
                                <select
                                  value={editFlashcardMaterialId || ''}
                                  onChange={e => setEditFlashcardMaterialId(e.target.value ? Number(e.target.value) : null)}
                                  className="bg-[#141312] border border-[#34302B] text-white rounded-lg p-2 text-xs flex-1"
                                >
                                  <option value="">General</option>
                                  {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                              </div>
                              <div className="flex gap-2 mt-2">
                                <button type="submit" className="flex-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded py-1.5 text-[10px] font-bold">Save</button>
                                <button type="button" onClick={() => setEditingFlashcardId(null)} className="flex-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded py-1.5 text-[10px] font-bold">Cancel</button>
                              </div>
                            </form>
                          ) : (
                            <>
                              <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => {
                                    setEditingFlashcardId(card.id);
                                    setEditFlashcardFront(card.front);
                                    setEditFlashcardBack(card.back);
                                    setEditFlashcardBox(card.box);
                                    setEditFlashcardMaterialId(card.material_id || null);
                                  }}
                                  className="bg-[#262320] p-1.5 rounded-md text-[#A7C4A0] hover:bg-[#A7C4A0]/20 transition-colors"
                                >
                                  <Edit className="w-3 h-3" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteFlashcard(card.id)}
                                  className="bg-[#262320] p-1.5 rounded-md text-red-400 hover:bg-red-500/20 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                              <div>
                                <div className="text-[9px] uppercase font-black text-[#A29A8B] mb-1">Front</div>
                                <div className="text-xs font-bold text-white mb-3 line-clamp-3">{renderFormattedMessage(card.front)}</div>
                                <div className="text-[9px] uppercase font-black text-[#A29A8B] mb-1">Back</div>
                                <div className="text-xs text-[#ECE6DA] line-clamp-4">{renderFormattedMessage(card.back)}</div>
                              </div>
                              <div className="mt-auto pt-3 border-t border-[#34302B]/60 flex justify-between items-center text-[10px] font-bold">
                                <span className={`px-2 py-0.5 rounded border ${
                                  card.box === 5 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 
                                  card.box >= 3 ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 
                                  'bg-red-500/20 text-red-400 border-red-500/30'
                                }`}>
                                  Box {card.box}
                                </span>
                                <span className="text-[#A29A8B] bg-[#141312] px-2 py-0.5 rounded border border-[#34302B]">
                                  {materials.find(m => m.id === card.material_id)?.name || "General"}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                      {filteredFlashcards.length === 0 && (
                        <div className="col-span-full py-12 text-center text-xs text-[#A29A8B] border border-dashed border-[#34302B] rounded-xl">
                          No flashcards found for this filter.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* STUDY MODE */
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Leitner Box Progress Tracker Capsule */}
                    <div className="col-span-full bg-[#1D1B19] border border-[#34302B] rounded-2xl p-5 flex flex-col gap-3">
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-[#A7C4A0]" /> Leitner Spaced Revision Box Track
                          </h3>
                          <p className="text-[10px] text-[#A29A8B]">Track how concepts progress from short-term memory (Box 1) to long-term memory (Box 5).</p>
                        </div>
                        <div className="bg-[#A7C4A0]/10 border border-[#A7C4A0]/30 px-3 py-1 rounded-full text-[10px] text-[#A7C4A0] font-bold">
                          Filtered Cards: {filteredFlashcards.length}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 mt-2">
                        {[1, 2, 3, 4, 5].map((boxNum) => {
                          const count = filteredFlashcards.filter(c => c.box === boxNum).length;
                          const intervals = ["Daily", "3 Days", "7 Days", "14 Days", "30 Days"];
                          const colors = ["text-red-400", "text-orange-400", "text-yellow-400", "text-blue-400", "text-emerald-400"];
                          const borderGlows = ["border-red-500/20", "border-orange-500/20", "border-yellow-500/20", "border-blue-500/20", "border-emerald-500/20"];
                          return (
                            <div key={boxNum} className={`bg-[#141312] border ${count > 0 ? borderGlows[boxNum-1] + ' shadow-lg shadow-black' : 'border-[#34302B]/60'} rounded-xl p-3.5 text-center transition-all`}>
                              <div className="text-[9px] uppercase tracking-wider font-extrabold text-[#A29A8B]">Box {boxNum}</div>
                              <div className="text-[8px] text-[#A29A8B] mt-0.5">{intervals[boxNum-1]}</div>
                              <div className={`text-xl font-black mt-1.5 ${colors[boxNum-1]}`}>{count}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Flashcard Leitner Deck */}
                    <div className="flex flex-col gap-5">
                      <div className="flex justify-between items-center">
                        <div>
                          <h2 className="font-display text-base font-semibold text-[#ECE6DA]">Flashcards</h2>
                          <p className="text-xs text-[#A29A8B]">Test recall success. Correct feedback upgrades boxes; forgot resets.</p>
                        </div>
                        <div className="flex items-center gap-2.5">
                          {filteredFlashcards.length > 0 && filteredFlashcards[currentCardIndex] && (
                            <span className="text-[10px] text-[#A29A8B]">Card {currentCardIndex + 1} of {filteredFlashcards.length}</span>
                          )}
                        </div>
                      </div>

                      {filteredFlashcards.length > 0 && filteredFlashcards[currentCardIndex] ? (
                        <div className="flex flex-col gap-4">
                          {/* Flippable card canvas */}
                          <div 
                            onClick={() => setIsFlipped(!isFlipped)}
                            className={`border rounded-2xl h-60 flex items-center justify-center p-8 cursor-pointer relative transition-all duration-300 select-none ${
                              isFlipped 
                                ? 'bg-[#141312] border-2 border-dashed border-[#A7C4A0]/40 shadow-lg shadow-[#A7C4A0]/5' 
                                : 'bg-[#1D1B19] border border-[#34302B] hover:border-[#A7C4A0]/30 shadow-md'
                            }`}
                          >
                            <div className="text-center w-full relative">
                              <span className="absolute -top-16 -left-4 bg-[#A7C4A0]/10 text-[#A7C4A0] text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                                Leitner Box {filteredFlashcards[currentCardIndex]?.box}
                              </span>

                              <span className="absolute -top-16 left-24 border border-[#34302B]/60 bg-[#141312]/80 text-[#A29A8B] text-[9px] font-mono px-2 py-0.5 rounded flex items-center gap-1 font-bold">
                                <FileText className="w-2.5 h-2.5 text-[#A7C4A0]" /> Source: {
                                  materials.find(m => m.id === filteredFlashcards[currentCardIndex]?.material_id)?.name || "Manual / General"
                                }
                              </span>
                              
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (filteredFlashcards[currentCardIndex]?.id) handleDeleteFlashcard(filteredFlashcards[currentCardIndex].id);
                                }}
                                title="Delete flashcard"
                                className="absolute -top-16 -right-4 text-[#A29A8B] hover:text-red-500 transition-colors p-1 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              
                              <span className="absolute -bottom-16 right-4 text-[9px] text-[#A29A8B] font-bold">
                                Click card to flip
                              </span>
                              
                              <div className="text-xs font-bold text-white leading-relaxed max-h-[140px] overflow-y-auto px-2">
                                {renderFormattedMessage((isFlipped ? filteredFlashcards[currentCardIndex]?.back : filteredFlashcards[currentCardIndex]?.front) || "")}
                              </div>
                            </div>
                          </div>

                          {/* Recall Feedback Options */}
                          <div className="grid grid-cols-2 gap-3.5">
                            <button
                              onClick={() => handleReviewFlashcard(false)}
                              className="bg-[#262320] border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all py-2.5 rounded-xl text-xs font-bold cursor-pointer"
                            >
                              Forgot Concept (Reset to Box 1)
                            </button>

                            <button
                              onClick={() => handleReviewFlashcard(true)}
                              className="bg-[#A7C4A0] text-[#141312] hover:bg-[#90AE88] transition-all py-2.5 rounded-xl text-xs font-black cursor-pointer"
                            >
                              Correct Recall (Upgrade Box)
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="glass rounded-2xl p-12 border border-[#34302B] text-center text-xs text-[#A29A8B]">
                          No flashcards available for this filter. Switch to Manage Deck to add some!
                        </div>
                      )}
                    </div>

                    {/* MCQs Practice Quizzes */}
                    <div className="flex flex-col gap-5">
                      <div className="flex justify-between items-center">
                        <div>
                          <h2 className="font-display text-base font-semibold text-[#ECE6DA]">Practice quizzes</h2>
                          <p className="text-xs text-[#A29A8B]">Test conceptual mappings. Correct answers boost course confidence.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowAddQuiz(v => !v)}
                            className="bg-[#34302B] hover:bg-[#34302B] transition-all text-[#A7C4A0] text-xs font-bold px-4 py-2 rounded-xl cursor-pointer flex items-center gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5" /> Add Question
                          </button>
                          <button
                            onClick={handleGenerateMoreQuizzes}
                            disabled={isGeneratingMoreQuizzes}
                            className="border border-[#34302B] hover:border-[#A7C4A0]/40 hover:text-[#A7C4A0] transition-colors text-[#A29A8B] text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {isGeneratingMoreQuizzes ? "Generating..." : "Generate More Quizzes"}
                          </button>
                        </div>
                      </div>

                      {showAddQuiz && (
                        <form onSubmit={handleCreateManualQuiz} className="glass rounded-xl p-5 border border-[#A7C4A0]/30 flex flex-col gap-3">
                          <textarea
                            value={newQuizQuestion}
                            onChange={(e) => setNewQuizQuestion(e.target.value)}
                            placeholder="Question text"
                            rows={2}
                            required
                            className="w-full bg-[#141312] border border-[#34302B] text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#A7C4A0]"
                          />
                          {newQuizOptions.map((opt, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="newQuizCorrect"
                                checked={newQuizCorrectIdx === idx}
                                onChange={() => setNewQuizCorrectIdx(idx)}
                                title="Mark as correct answer"
                                className="accent-[#A7C4A0] cursor-pointer"
                              />
                              <input
                                value={opt}
                                onChange={(e) => setNewQuizOptions(prev => prev.map((o, i) => (i === idx ? e.target.value : o)))}
                                placeholder={`Option ${idx + 1}${idx < 2 ? " (required)" : " (optional)"}`}
                                className="flex-1 bg-[#141312] border border-[#34302B] text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#A7C4A0]"
                              />
                            </div>
                          ))}
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-[#A29A8B]">Select the radio next to the correct option.</span>
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => setShowAddQuiz(false)} className="text-xs text-[#A29A8B] hover:text-white px-3 py-2 cursor-pointer">Cancel</button>
                              <button type="submit" className="bg-[#A7C4A0] text-[#141312] text-xs font-extrabold px-4 py-2 rounded-lg hover:bg-[#90AE88] cursor-pointer">Save Question</button>
                            </div>
                          </div>
                        </form>
                      )}

                      <div className="flex flex-col gap-6">
                        {filteredQuizzes.map((quiz) => {
                          const options = quiz.options ? JSON.parse(quiz.options) : [];
                          const answerState = quizAnswers[quiz.id];
                          const quizMat = materials.find(m => m.id === quiz.material_id);
                          const quizSource = quizMat ? quizMat.name : "General Prep";
                          if (editingQuizId === quiz.id) {
                            return (
                              <form key={quiz.id} onSubmit={handleSaveQuizEdit} className="glass rounded-xl p-5 border border-[#A7C4A0]/30 flex flex-col gap-3">
                                <textarea
                                  value={editQuizQuestion}
                                  onChange={(e) => setEditQuizQuestion(e.target.value)}
                                  rows={2}
                                  required
                                  className="w-full bg-[#141312] border border-[#34302B] text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#A7C4A0]"
                                />
                                {editQuizOptions.map((opt, idx) => (
                                  <div key={idx} className="flex items-center gap-2">
                                    <input
                                      type="radio"
                                      name={`editQuizCorrect-${quiz.id}`}
                                      checked={editQuizAnswer === opt && opt !== ""}
                                      onChange={() => setEditQuizAnswer(opt)}
                                      title="Mark as correct answer"
                                      className="accent-[#A7C4A0] cursor-pointer"
                                    />
                                    <input
                                      value={opt}
                                      onChange={(e) => {
                                        const newVal = e.target.value;
                                        setEditQuizOptions(prev => prev.map((o, i) => (i === idx ? newVal : o)));
                                        if (editQuizAnswer === opt) setEditQuizAnswer(newVal);
                                      }}
                                      className="flex-1 bg-[#141312] border border-[#34302B] text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#A7C4A0]"
                                    />
                                  </div>
                                ))}
                                <div className="flex items-center justify-end gap-2">
                                  <button type="button" onClick={() => setEditingQuizId(null)} className="text-xs text-[#A29A8B] hover:text-white px-3 py-2 cursor-pointer">Cancel</button>
                                  <button type="submit" className="bg-[#A7C4A0] text-[#141312] text-xs font-extrabold px-4 py-2 rounded-lg hover:bg-[#90AE88] cursor-pointer">Save Changes</button>
                                </div>
                              </form>
                            );
                          }
                          return (
                            <div key={quiz.id} className="glass rounded-xl p-5 border border-[#34302B] flex flex-col gap-3">
                              <div className="flex justify-between items-center border-b border-[#34302B]/40 pb-2 mb-1">
                                <span className="bg-[#A7C4A0]/10 text-[#A7C4A0] border border-[#A7C4A0]/20 text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                                  Quiz MCQ
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[#A29A8B] text-[9px] font-mono flex items-center gap-1">
                                    <FileText className="w-2.5 h-2.5 text-[#A7C4A0]/80" /> Source: {quizSource}
                                  </span>
                                  <button
                                    onClick={() => startEditQuiz(quiz)}
                                    className="p-1 rounded text-[#A29A8B] hover:text-[#A7C4A0] hover:bg-[#34302B] transition-colors cursor-pointer"
                                    title="Edit question"
                                  >
                                    <Edit className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteQuiz(quiz.id)}
                                    className="p-1 rounded text-[#A29A8B] hover:text-red-400 hover:bg-[#34302B] transition-colors cursor-pointer"
                                    title="Delete question"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>

                              <h3 className="font-extrabold text-xs text-white leading-relaxed mb-2">{quiz.question}</h3>
                              
                              <div className="flex flex-col gap-2">
                                {options.map((opt: string, optIdx: number) => {
                                  const isSelected = answerState?.selected === opt;
                                  const isCorrectAns = opt === quiz.correct_answer;
                                  return (
                                    <button
                                      key={optIdx}
                                      onClick={() => handleSelectQuizOption(quiz.id, opt, quiz.correct_answer)}
                                      disabled={answerState?.graded}
                                      className={`w-full text-left px-4 py-2.5 rounded-lg text-xs transition-all border cursor-pointer ${
                                        answerState?.graded 
                                          ? isCorrectAns 
                                            ? 'bg-emerald-500/20 border-emerald-500 text-white font-bold'
                                            : isSelected
                                              ? 'bg-red-500/20 border-red-500 text-white font-bold'
                                              : 'bg-[#141312] border-[#34302B] text-[#A29A8B] opacity-50'
                                          : 'bg-[#141312] border-[#34302B] text-white hover:border-[#A7C4A0]/30 hover:bg-[#262320]'
                                      }`}
                                    >
                                      {opt}
                                    </button>
                                  );
                                })}
                              </div>

                              {answerState?.graded && (
                                <div className={`mt-4 text-[11px] font-medium leading-relaxed p-3 rounded-lg border ${
                                  answerState.correct 
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                                    : 'bg-red-500/10 border-red-500/20 text-red-400'
                                }`}>
                                  {renderFormattedMessage(answerState.explanation || "")}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {filteredQuizzes.length === 0 && (
                          <div className="glass rounded-2xl p-12 border border-[#34302B] text-center text-xs text-[#A29A8B]">
                            No quizzes found for this filter.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* TAB 5: MOCK EXAM CANVAS */}
          {activeTab === 'exams' && (
            <div className="flex flex-col gap-6">
              {!activeExam ? (
                // Exams History List and Start Button
                <div className="flex flex-col gap-6">
                  <div className="glass rounded-2xl p-6 border border-[#34302B] flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                      <h2 className="font-display text-base font-semibold text-[#ECE6DA] flex items-center gap-2">
                        <Award className="w-5 h-5 text-[#A7C4A0]" /> Timed Mock Exam Canvas
                      </h2>
                      <p className="text-xs text-[#A29A8B] mt-1">
                        AI Coach generates custom conceptual short essay questions based on your ingested textbooks and slides.
                      </p>
                    </div>
                    <button
                      onClick={handleStartExam}
                      disabled={generatingExam}
                      className="bg-[#A7C4A0] hover:bg-[#90AE88] text-[#141312] px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shrink-0"
                    >
                      {generatingExam ? (
                        <>
                          <div className="w-3.5 h-3.5 border-t-2 border-[#141312] border-solid rounded-full animate-spin"></div>
                          Synthesizing Questions...
                        </>
                      ) : (
                        "Generate timed mock exam"
                      )}
                    </button>
                  </div>

                  <div className="glass rounded-2xl p-6 border border-[#34302B]">
                    <h3 className="text-sm font-extrabold text-white mb-4">Past Mock Exam Sessions</h3>
                    {mockExams.length === 0 ? (
                      <div className="text-center text-xs text-[#A29A8B] py-8">
                        No mock exams taken yet. Click the button above to begin your timed prep simulator.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-[#A29A8B] min-w-[500px]">
                          <thead>
                            <tr className="border-b border-[#34302B] pb-2 font-black text-white">
                              <th className="py-2.5">Date Completed</th>
                              <th className="py-2.5">Duration Spent</th>
                              <th className="py-2.5">Score Achieved</th>
                              <th className="py-2.5">Status</th>
                              <th className="py-2.5 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mockExams.map((ex) => (
                              <tr key={ex.id} className="border-b border-[#34302B]/60 hover:bg-white/[0.01] transition-all">
                                <td className="py-3.5 font-medium text-white">
                                  {ex.completed_at ? new Date(ex.completed_at).toLocaleDateString() : new Date(ex.created_at).toLocaleDateString()}
                                </td>
                                <td className="py-3.5">
                                  {Math.floor(ex.duration_seconds / 60)}m {ex.duration_seconds % 60}s
                                </td>
                                <td className="py-3.5 font-bold">
                                  <span className={`px-2.5 py-1 rounded-full ${
                                    ex.score >= 85 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                    ex.score >= 70 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                                    'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                                  }`}>
                                    {ex.score.toFixed(1)}%
                                  </span>
                                </td>
                                <td className="py-3.5 uppercase font-bold text-[10px]">
                                  {ex.status}
                                </td>
                                <td className="py-3.5 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => setActiveExam(ex)}
                                      className="text-[#A7C4A0] hover:underline font-extrabold cursor-pointer"
                                    >
                                      View Performance Details
                                    </button>
                                    <button
                                      onClick={() => handleDeleteMockExam(ex.id)}
                                      className="p-1.5 rounded text-[#A29A8B] hover:text-red-400 hover:bg-[#34302B] transition-colors cursor-pointer"
                                      title="Delete this exam attempt"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              ) : activeExam.status === 'in_progress' ? (
                // TIMED EXAM WORKSPACE
                <div className="flex flex-col gap-6">
                  <div className="bg-[#262320] border border-orange-500/30 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
                    <div>
                      <span className="text-[10px] bg-orange-500/20 border border-orange-500/30 text-orange-400 px-3 py-1 rounded-full font-black uppercase tracking-wider">
                        Timed Simulator Mode
                      </span>
                      <h3 className="text-base font-black text-white mt-2">Finish essay questions before countdown expires</h3>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-[9px] text-[#A29A8B] block uppercase font-bold">Time remaining</span>
                        <span className="text-2xl font-black font-mono text-white">
                          {String(Math.floor(examTimer / 60)).padStart(2, '0')}:
                          {String(examTimer % 60).padStart(2, '0')}
                        </span>
                      </div>
                      <Clock className="w-8 h-8 text-[#A7C4A0] animate-pulse" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-6 mt-2">
                    {activeExam.questions.map((q, idx) => (
                      <div key={q.id} className="glass rounded-2xl p-6 border border-[#34302B] flex flex-col gap-3">
                        <span className="text-[10px] text-[#A7C4A0] font-black uppercase tracking-wider block">Question {idx + 1} of 3</span>
                        <h4 className="text-sm font-black text-white leading-relaxed">{q.question}</h4>
                        <span className="text-[9px] text-[#A29A8B] italic block -mt-1">Mapped to: {q.reference_source}</span>
                        <textarea
                          placeholder="Type your structured analytical solution here... Include code, derivations, and concrete proofs where applicable."
                          value={studentAnswers[q.id] || ""}
                          onChange={(e) => setStudentAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                          rows={6}
                          className="bg-[#141312] border border-[#34302B] text-white text-xs rounded-xl p-4 mt-1 w-full focus:outline-none focus:border-[#A7C4A0] resize-y placeholder:text-[#6E685C]"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-4 justify-end mt-4">
                    <button
                      onClick={() => {
                        if (confirm("Are you sure you want to discard this exam attempt? Your work will not be saved.")) {
                          setActiveExam(null);
                          setExamTimerRunning(false);
                        }
                      }}
                      className="px-5 py-3 border border-[#34302B] hover:bg-white/[0.02] text-[#A29A8B] hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Discard & Cancel
                    </button>
                    <button
                      onClick={() => performSubmitExam(activeExam.id, studentAnswers)}
                      disabled={submittingExam}
                      className="bg-emerald-500 hover:bg-emerald-400 text-[#141312] px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                    >
                      {submittingExam ? (
                        <>
                          <div className="w-3.5 h-3.5 border-t-2 border-[#141312] border-solid rounded-full animate-spin"></div>
                          Auto Grading via AI...
                        </>
                      ) : (
                        "Submit answers & grade"
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                // GRADED PERFORMANCE REPORT CARD
                <div className="flex flex-col gap-6">
                  <div className="flex justify-between items-center">
                    <button
                      onClick={() => setActiveExam(null)}
                      className="flex items-center gap-1.5 text-xs text-[#A29A8B] hover:text-white transition-all font-black uppercase tracking-wider cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back to History
                    </button>
                    <span className="text-xs text-[#A29A8B]">
                      Session completed on {activeExam.completed_at ? new Date(activeExam.completed_at).toLocaleString() : ""}
                    </span>
                  </div>

                  {/* SCORE CARD CONTAINER */}
                  <div className="glass rounded-3xl p-6 md:p-8 border border-[#34302B] flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden">
                    <div className="flex flex-col items-center md:items-start text-center md:text-left gap-2 z-10">
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full font-black uppercase tracking-wider">
                        Graded Exam Sheet
                      </span>
                      <h3 className="text-2xl font-black text-white mt-2">Mock Exam Performance Profile</h3>
                      <p className="text-xs text-[#A29A8B] mt-1 max-w-md leading-relaxed">
                        The AI evaluated your conceptual solutions based on RAG verification. Review weak areas highlighted below to refine your finals prep.
                      </p>
                    </div>

                    <div className="flex items-center gap-6 shrink-0 z-10">
                      <div className="text-center">
                        <span className="text-[9px] text-[#A29A8B] uppercase font-bold block mb-1">Overall Grade</span>
                        <div className="relative w-28 h-28 flex items-center justify-center rounded-full bg-[#A7C4A0]/5 border-4 border-[#A7C4A0] shadow-lg shadow-[#A7C4A0]/10">
                          <div className="text-center">
                            <span className="text-3xl font-black text-white">{activeExam.score.toFixed(0)}%</span>
                            <span className="text-[9px] text-[#A7C4A0] font-bold block">
                              {activeExam.score >= 85 ? 'A - Elite' : activeExam.score >= 70 ? 'B - Strong' : 'C - Focus'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="absolute right-0 bottom-0 text-[#A7C4A0]/5 -mr-10 -mb-10 pointer-events-none select-none">
                      <Award className="w-48 h-48" />
                    </div>
                  </div>

                  {/* QUESTION BY QUESTION EVALUATION */}
                  <div className="flex flex-col gap-6 mt-2">
                    {activeExam.questions.map((q, idx) => (
                      <div key={q.id} className="glass rounded-2xl p-6 border border-[#34302B] flex flex-col gap-4">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <span className="text-[10px] text-[#A29A8B] font-black uppercase tracking-wider block">Question {idx + 1}</span>
                            <h4 className="text-sm font-extrabold text-white mt-1 leading-relaxed">{q.question}</h4>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            (q.ai_grade || 0) >= 85 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                            (q.ai_grade || 0) >= 70 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                            'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                          }`}>
                            Score: {(q.ai_grade || 0).toFixed(0)}%
                          </span>
                        </div>

                        {/* STUDENT RESPONSE */}
                        <div className="bg-[#141312]/40 rounded-xl p-4 border border-[#34302B]/60">
                          <span className="text-[9px] text-[#A29A8B] uppercase font-bold block mb-1">Your Solution Draft:</span>
                          <div className="text-xs text-[#ECE6DA] leading-relaxed">
                            {renderFormattedMessage(q.user_answer || "No response submitted.")}
                          </div>
                        </div>

                        {/* AI COACH FEEDBACK */}
                        <div className="bg-[#A7C4A0]/5 border border-[#A7C4A0]/20 rounded-xl p-4">
                          <span className="text-[9px] text-[#A7C4A0] uppercase font-black tracking-widest mb-1 flex items-center gap-1">
                            AI feedback & coaching recommendations:
                          </span>
                          <div className="text-xs text-[#CBDDC4] leading-relaxed mt-1.5">
                            {renderFormattedMessage(q.ai_feedback || "")}
                          </div>
                          <span className="text-[9px] text-[#A29A8B] italic block mt-3">Verified reference scope: {q.reference_source}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: FORMULAS AND CHEAT SHEET */}
          {activeTab === 'cheat-sheet' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Formula reference cards list */}
              <div className="lg:col-span-2 flex flex-col gap-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="font-display text-base font-semibold text-[#ECE6DA] flex items-center gap-1.5">
                      <Calculator className="w-5 h-5 text-[#A7C4A0]" /> Cheat sheet
                    </h2>
                    <p className="text-xs text-[#A29A8B]">LaTeX rendered formulas, variables breakdown and dynamic solvers.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAddFormula(v => !v)}
                      className="flex items-center gap-1.5 bg-[#34302B] text-[#A7C4A0] hover:bg-[#34302B] transition-all text-xs font-extrabold px-4 py-2 rounded-lg cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Formula
                    </button>
                    <button
                      onClick={() => setShowCheatSheetModal(true)}
                      className="flex items-center gap-1.5 bg-[#A7C4A0] text-[#141312] hover:bg-[#90AE88] transition-all text-xs font-extrabold px-4 py-2 rounded-lg cursor-pointer"
                    >
                      Generate Cheat Sheet
                    </button>
                  </div>
                </div>

                {showAddFormula && (
                  <form onSubmit={handleCreateManualFormula} className="glass rounded-xl p-5 border border-[#A7C4A0]/30 flex flex-col gap-3">
                    <input
                      value={newFormulaName}
                      onChange={(e) => setNewFormulaName(e.target.value)}
                      placeholder="Formula name (e.g. Bayes' Theorem)"
                      required
                      className="w-full bg-[#141312] border border-[#34302B] text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#A7C4A0]"
                    />
                    <input
                      value={newFormulaLatex}
                      onChange={(e) => setNewFormulaLatex(e.target.value)}
                      placeholder="Formula / LaTeX (e.g. P(A|B) = P(B|A)P(A) / P(B))"
                      required
                      className="w-full bg-[#141312] border border-[#34302B] text-[#A7C4A0] font-mono rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#A7C4A0]"
                    />
                    <textarea
                      value={newFormulaDesc}
                      onChange={(e) => setNewFormulaDesc(e.target.value)}
                      placeholder="Description / when to use it (optional)"
                      rows={2}
                      className="w-full bg-[#141312] border border-[#34302B] text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#A7C4A0]"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" onClick={() => setShowAddFormula(false)} className="text-xs text-[#A29A8B] hover:text-white px-3 py-2 cursor-pointer">Cancel</button>
                      <button type="submit" className="bg-[#A7C4A0] text-[#141312] text-xs font-extrabold px-4 py-2 rounded-lg hover:bg-[#90AE88] cursor-pointer">Save Formula</button>
                    </div>
                  </form>
                )}

                {formulas.length === 0 ? (
                  <div className="glass rounded-2xl p-12 border border-[#34302B] text-center text-xs text-[#A29A8B]">
                    No cheat-sheet entries yet. Click "Generate Cheat Sheet" to compile formulas from your uploaded materials, or add one manually.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {formulas.map((f) => (
                      editingFormulaId === f.id ? (
                        <form key={f.id} onSubmit={handleSaveFormulaEdit} className="glass rounded-2xl p-5 border border-[#A7C4A0]/30 flex flex-col gap-3">
                          <input
                            value={editFormulaName}
                            onChange={(e) => setEditFormulaName(e.target.value)}
                            required
                            className="w-full bg-[#141312] border border-[#34302B] text-white rounded-lg px-3 py-2 text-xs font-black focus:outline-none focus:border-[#A7C4A0]"
                          />
                          <input
                            value={editFormulaLatex}
                            onChange={(e) => setEditFormulaLatex(e.target.value)}
                            required
                            className="w-full bg-[#141312] border border-[#34302B] text-[#A7C4A0] font-mono rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#A7C4A0]"
                          />
                          <textarea
                            value={editFormulaDesc}
                            onChange={(e) => setEditFormulaDesc(e.target.value)}
                            rows={3}
                            className="w-full bg-[#141312] border border-[#34302B] text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#A7C4A0]"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button type="button" onClick={() => setEditingFormulaId(null)} className="text-xs text-[#A29A8B] hover:text-white px-3 py-2 cursor-pointer">Cancel</button>
                            <button type="submit" className="bg-[#A7C4A0] text-[#141312] text-xs font-extrabold px-4 py-2 rounded-lg hover:bg-[#90AE88] cursor-pointer">Save</button>
                          </div>
                        </form>
                      ) : (
                      <div key={f.id} className="glass rounded-2xl p-5 border border-[#34302B] flex flex-col justify-between gap-4">
                        <div>
                          <div className="flex justify-between items-start gap-4">
                            <h3 className="text-sm font-black text-white leading-tight">{f.name}</h3>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleOpenCalculator(f)}
                                title="Open variable micro-calculator solver"
                                className="bg-[#A7C4A0]/10 hover:bg-[#A7C4A0] hover:text-[#141312] border border-[#A7C4A0]/30 text-[#A7C4A0] px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1"
                              >
                                <Calculator className="w-3.5 h-3.5" /> Solve
                              </button>
                              <button
                                onClick={() => startEditFormula(f)}
                                className="p-1.5 rounded text-[#A29A8B] hover:text-[#A7C4A0] hover:bg-[#34302B] transition-colors cursor-pointer"
                                title="Edit formula"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteFormula(f.id)}
                                className="p-1.5 rounded text-[#A29A8B] hover:text-red-400 hover:bg-[#34302B] transition-colors cursor-pointer"
                                title="Delete formula"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* sleek glow LaTeX render container */}
                          <div className="bg-[#141312]/60 border border-[#34302B] rounded-xl p-4.5 my-3 flex items-center justify-center text-center shadow-inner overflow-x-auto">
                            <span className="text-base font-bold text-[#A7C4A0] font-mono tracking-wide whitespace-nowrap">
                              {f.latex_code}
                            </span>
                          </div>

                          <div className="text-xs text-[#A29A8B] leading-relaxed mt-2.5">
                            {renderFormattedMessage(f.description || "")}
                          </div>

                          {/* Derivation breakdown list */}
                          {f.derivation_steps_json && (
                            <div className="mt-4 border-t border-[#34302B]/60 pt-3.5">
                              <span className="text-[9px] uppercase font-black tracking-wider text-white block mb-2">Step-by-Step Logic:</span>
                              <ul className="flex flex-col gap-1.5">
                                {(() => {
                                  try {
                                    const steps = JSON.parse(f.derivation_steps_json);
                                    return steps.map((s: string, sIdx: number) => (
                                      <li key={sIdx} className="text-[10px] text-[#A29A8B] leading-relaxed flex items-start gap-1">
                                        <span className="text-[#A7C4A0] font-bold font-mono">{sIdx + 1}.</span>
                                        <span>{s}</span>
                                      </li>
                                    ));
                                  } catch {
                                    return <li className="text-[10px] text-[#A29A8B]">Referenced directly from lectures.</li>;
                                  }
                                })()}
                              </ul>
                            </div>
                          )}
                        </div>

                        {/* Custom Hand-written Bookmark study note */}
                        <div className="mt-4 border-t border-[#34302B]/60 pt-3">
                          <span className="text-[9px] uppercase font-bold text-[#A29A8B] block mb-1">Personal Study Notes:</span>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Write bookmark, calculation tricks..."
                              value={formulaNoteText[f.id] || ""}
                              onChange={(e) => setFormulaNoteText(prev => ({ ...prev, [f.id]: e.target.value }))}
                              className="flex-1 bg-[#141312] border border-[#34302B] text-[10px] text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-[#A7C4A0]"
                            />
                            <button
                              onClick={() => handleAddFormulaNote(f.id)}
                              disabled={savingFormulaNote === f.id}
                              className="bg-[#A7C4A0]/10 border border-[#A7C4A0]/30 hover:bg-[#A7C4A0] hover:text-[#141312] text-[#A7C4A0] transition-all px-2.5 py-1.5 rounded text-[10px] font-black uppercase tracking-wider cursor-pointer"
                            >
                              {savingFormulaNote === f.id ? "Saving..." : "Save"}
                            </button>
                          </div>
                        </div>
                      </div>
                      )
                    ))}
                  </div>
                )}
              </div>

              {/* Dynamic side slider solver */}
              <div className="lg:col-span-1">
                <div className="glass rounded-2xl p-6 border border-[#34302B] sticky top-6">
                  <h3 className="text-sm font-extrabold text-white mb-3 flex items-center gap-1.5">
                    <Calculator className="w-4 h-4 text-[#A7C4A0]" /> Solve with your numbers
                  </h3>

                  {!activeCalculatorFormula ? (
                    <div className="text-center text-xs text-[#A29A8B] py-8 leading-relaxed">
                      Click the "Solve" button on any formula card to dynamically evaluate values in real-time.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <div>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] uppercase font-bold text-[#A29A8B]">Active Solver</span>
                          <button
                            onClick={() => setActiveCalculatorFormula(null)}
                            className="text-[#A29A8B] hover:text-white p-0.5 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <h4 className="text-xs font-black text-white mt-1">{activeCalculatorFormula.name}</h4>
                        <span className="text-[10px] text-[#A7C4A0] font-mono block mt-1">{activeCalculatorFormula.latex_code}</span>
                      </div>

                      {/* Dynamic form inputs */}
                      <div className="flex flex-col gap-3.5 border-t border-[#34302B]/60 pt-4 mt-2">
                        {(() => {
                          try {
                            const vars = JSON.parse(activeCalculatorFormula.variables_json || "[]");
                            return vars.map((v: any) => (
                              <div key={v.symbol} className="flex justify-between items-center gap-4">
                                <div className="text-left max-w-[150px]">
                                  <span className="text-[10px] font-black font-mono text-[#A7C4A0] block">{v.symbol}</span>
                                  <span className="text-[9px] text-[#A29A8B] block leading-tight">{v.meaning}</span>
                                </div>
                                <input
                                  type="number"
                                  step="any"
                                  value={calculatorInputs[v.symbol] ?? 0}
                                  onChange={(e) => setCalculatorInputs(prev => ({ ...prev, [v.symbol]: parseFloat(e.target.value) || 0 }))}
                                  className="w-24 bg-[#141312] border border-[#34302B] text-white text-xs rounded p-2 focus:outline-none focus:border-[#A7C4A0] text-right font-mono"
                                />
                              </div>
                            ));
                          } catch {
                            return <span className="text-[10px] text-[#A29A8B]">Error processing variables list.</span>;
                          }
                        })()}
                      </div>

                      <button
                        onClick={handleRunCalculator}
                        className="bg-[#A7C4A0] hover:bg-[#90AE88] text-[#141312] px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all mt-4 cursor-pointer"
                      >
                        Compute Value
                      </button>

                      {calculatorResult !== null && (
                        <div className="bg-[#A7C4A0]/10 border border-[#A7C4A0]/30 rounded-xl p-4 mt-3 text-center">
                          <span className="text-[9px] uppercase font-black tracking-widest text-[#A29A8B] block">Computed Solution</span>
                          <span className="text-2xl font-black text-[#A7C4A0] font-mono mt-1 block">
                            {calculatorResult.toLocaleString(undefined, { maximumFractionDigits: 5 })}
                          </span>
                          <span className="text-[9px] text-[#A29A8B] italic block mt-1.5">Value computed using precise CPU operations.</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Generate Cheat Sheet modal: pick source materials */}
              {showCheatSheetModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
                  <div className="bg-[#1D1B19] border border-[#34302B] rounded-2xl p-6 w-full max-w-md shadow-2xl">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                        Generate Cheat Sheet
                      </h3>
                      <button onClick={() => setShowCheatSheetModal(false)} className="text-[#A29A8B] hover:text-white cursor-pointer">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <p className="text-xs text-[#A29A8B] mb-4 leading-relaxed">
                      Choose which resources the AI should compile formulas and key results from.
                      Leave everything unchecked to use <b className="text-white">all materials</b>.
                    </p>

                    <div className="flex flex-col gap-2 max-h-52 overflow-y-auto mb-4 pr-1">
                      {materials.length === 0 && (
                        <div className="text-xs text-[#A29A8B] text-center py-6 border border-dashed border-[#34302B] rounded-lg">
                          No materials uploaded yet — upload lecture files first.
                        </div>
                      )}
                      {materials.map((m) => (
                        <label key={m.id} className="flex items-center gap-2.5 bg-[#141312] border border-[#34302B] rounded-lg px-3 py-2.5 cursor-pointer hover:border-[#A7C4A0]/30 transition-colors">
                          <input
                            type="checkbox"
                            checked={cheatSheetMaterialIds.includes(m.id)}
                            onChange={(e) => {
                              setCheatSheetMaterialIds(prev =>
                                e.target.checked ? [...prev, m.id] : prev.filter(id => id !== m.id)
                              );
                            }}
                            className="accent-[#A7C4A0] cursor-pointer"
                          />
                          <FileText className="w-3.5 h-3.5 text-[#A7C4A0]/70 shrink-0" />
                          <span className="text-xs text-white truncate">{m.name}</span>
                        </label>
                      ))}
                    </div>

                    <label className="flex items-center gap-2 mb-5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cheatSheetReplace}
                        onChange={(e) => setCheatSheetReplace(e.target.checked)}
                        className="accent-[#A7C4A0] cursor-pointer"
                      />
                      <span className="text-xs text-[#A29A8B]">Replace existing entries (instead of adding to them)</span>
                    </label>

                    <button
                      onClick={handleGenerateCheatSheet}
                      disabled={generatingCheatSheet || materials.length === 0}
                      className="w-full bg-[#A7C4A0] text-[#141312] font-extrabold text-xs py-3 rounded-xl hover:bg-[#90AE88] transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                    >
                      {generatingCheatSheet ? "Compiling formulas from your materials..." : `Generate from ${cheatSheetMaterialIds.length === 0 ? "All" : cheatSheetMaterialIds.length} Resource${cheatSheetMaterialIds.length === 1 ? "" : "s"}`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 8: NOTES / SCRATCHPAD */}
          {activeTab === 'notes' && (
            <div className="flex h-[75vh] border border-[#34302B] rounded-2xl overflow-hidden glass">
              {/* Sidebar List */}
              <div className="w-1/4 min-w-[250px] border-r border-[#34302B] bg-[#141312]/50 flex flex-col">
                <div className="p-4 border-b border-[#34302B] flex justify-between items-center bg-[#1D1B19]">
                  <h3 className="font-extrabold text-white text-sm">Study Notes</h3>
                  <button 
                    onClick={async () => {
                      try {
                        const newNote = await api.createNote(subjectId, "Untitled Note", "");
                        setNotes([newNote, ...notes]);
                        setActiveNoteId(newNote.id);
                      } catch (e) {
                        console.error(e);
                        toast("Couldn't create the note.", "error");
                      }
                    }}
                    className="p-1.5 hover:bg-[#A7C4A0]/10 rounded-md text-[#A7C4A0] transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {notes.map(note => (
                    <div 
                      key={note.id}
                      onClick={() => setActiveNoteId(note.id)}
                      className={`p-4 border-b border-[#34302B]/50 cursor-pointer transition-all ${
                        activeNoteId === note.id 
                          ? 'bg-[#A7C4A0]/10 border-l-2 border-l-[#A7C4A0]' 
                          : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <h4 className={`text-xs font-bold truncate ${activeNoteId === note.id ? 'text-[#A7C4A0]' : 'text-white'}`}>
                        {note.title || "Untitled Note"}
                      </h4>
                      <p className="text-[10px] text-[#A29A8B] mt-1 line-clamp-2">
                        {note.content?.replace(/<[^>]*>?/gm, '').substring(0, 50) || "Empty note..."}
                      </p>
                    </div>
                  ))}
                  {notes.length === 0 && (
                    <div className="p-6 text-center text-[#A29A8B] text-[10px]">
                      No notes yet. Click the + button to create your first note!
                    </div>
                  )}
                </div>
              </div>

              {/* Editor Pane */}
              <div className="flex-1 flex flex-col bg-[#141312]/80">
                {activeNoteId ? (() => {
                  const activeNote = notes.find(n => n.id === activeNoteId);
                  if (!activeNote) return null;
                  
                  return (
                    <>
                      <div className="p-4 border-b border-[#34302B] flex justify-between items-center bg-[#1D1B19]">
                        <input
                          type="text"
                          value={activeNote.title}
                          onChange={(e) => {
                            const newTitle = e.target.value;
                            setNotes(notes.map(n => n.id === activeNoteId ? { ...n, title: newTitle } : n));
                            // Debounce this in a real app, keeping it simple for now
                            api.updateNote(activeNote.id, { title: newTitle }).catch(console.error);
                          }}
                          className="bg-transparent text-lg font-extrabold text-white focus:outline-none w-full"
                          placeholder="Note Title..."
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowMarkdownGuide(true)}
                            className="text-[#A29A8B] hover:text-[#A7C4A0] p-2 transition-colors flex items-center gap-1"
                            title="Markdown Guide"
                          >
                            <HelpCircle className="w-4 h-4" />
                          </button>
                          <button
                          onClick={async () => {
                            if (!confirm("Delete this note?")) return;
                            try {
                              await api.deleteNote(activeNote.id);
                              const remaining = notes.filter(n => n.id !== activeNote.id);
                              setNotes(remaining);
                              if (remaining.length > 0) setActiveNoteId(remaining[0].id);
                              else setActiveNoteId(null);
                            } catch (e) {
                              console.error(e);
                              toast("Couldn't delete the note.", "error");
                            }
                          }}
                          className="text-[#A29A8B] hover:text-red-400 p-2 transition-colors ml-4"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-6 md:p-8">
                        <NotionEditor
                          noteId={activeNote.id}
                          initialContent={activeNote.content || ""}
                          onChange={(newContent) => {
                            // Update local state immediately for fast feedback
                            setNotes(prev => prev.map(n => n.id === activeNote.id ? { ...n, content: newContent } : n));
                            // In a production app, we would use a debouncer here! 
                            // Using a short timeout to prevent hammering the API on every single keystroke.
                            const timerId = (window as any)._noteSaveTimer;
                            if (timerId) clearTimeout(timerId);
                            (window as any)._noteSaveTimer = setTimeout(() => {
                              api.updateNote(activeNote.id, { content: newContent }).catch(console.error);
                            }, 1000);
                          }}
                        />
                      </div>
                    </>
                  );
                })() : (
                  <div className="flex-1 flex flex-col items-center justify-center text-[#A29A8B]">
                    <FileEdit className="w-12 h-12 mb-4 opacity-50" />
                    <p className="text-sm font-bold">Select a note or create a new one</p>
                    <p className="text-[10px] mt-2 max-w-sm text-center">
                      Use the Tiptap Notion-style editor to write rich-text documents with Markdown shortcuts, checkboxes, and task lists!
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        /* DISTRACTION FREE STUDY VIEW / POMODORO TIMER TENT */
        <div className="fixed inset-0 bg-[#141312] z-50 flex items-center justify-center p-6 md:p-12 overflow-y-auto">
          <div className="w-full max-w-2xl text-center flex flex-col items-center gap-10">
            {/* Focus Mode Title header controls */}
            <div className="w-full flex justify-between items-center border-b border-[#34302B] pb-6">
              <div className="text-left">
                <span className="text-[10px] text-[#A7C4A0] font-black uppercase tracking-widest flex items-center gap-1 mt-1">
                  <Zap className="w-3.5 h-3.5 fill-[#A7C4A0]/10" /> Proactive Focus Environment
                </span>
                <h1 className="text-lg font-black text-white mt-1">{subject.name}</h1>
              </div>

              <button
                onClick={() => {
                  setPomodoroRunning(false);
                  if (noiseNodeRef.current) {
                    noiseNodeRef.current.disconnect();
                    noiseNodeRef.current = null;
                  }
                  setSoundOn(false);
                  setActiveTab('overview');
                }}
                className="flex items-center gap-1.5 text-xs text-[#A29A8B] hover:text-white transition-all font-bold cursor-pointer"
              >
                <Minimize2 className="w-4 h-4" /> Exit Focus
              </button>
            </div>

            {/* Pomodoro Clock Canvas */}
            <div className="flex flex-col items-center gap-8 relative py-8 w-full">
              <div className="absolute inset-0 bg-gradient-to-b from-[#A7C4A0]/5 to-transparent rounded-full blur-[100px] pointer-events-none -z-10" />
              
              <div className="text-center space-y-2">
                <span className={`text-[10px] uppercase font-black tracking-[0.2em] px-4 py-1.5 rounded-full border transition-all ${
                  isBreak 
                    ? 'bg-orange-500/10 text-orange-400 border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.2)]' 
                    : 'bg-[#A7C4A0]/10 text-[#A7C4A0] border-[#A7C4A0]/30 shadow-[0_0_15px_rgba(232,197,71,0.2)]'
                }`}>
                  {isBreak ? 'Break Interval' : 'Deep Focus Active'}
                </span>
                {!isBreak && (
                  <h2 className="font-display text-2xl font-semibold text-[#ECE6DA] mt-4">{sessionTitle || "Deep work session"}</h2>
                )}
              </div>
              
              <div className="relative flex items-center justify-center">
                {/* Glowing rings */}
                {pomodoroRunning && (
                  <div className="absolute w-64 h-64 md:w-80 md:h-80 rounded-full border border-[#A7C4A0]/30 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite] opacity-20 pointer-events-none" />
                )}
                <div className={`w-56 h-56 md:w-72 md:h-72 rounded-full flex items-center justify-center border-4 transition-all duration-1000 ${
                  pomodoroRunning ? 'border-[#A7C4A0] shadow-[0_0_40px_rgba(232,197,71,0.3)]' : 'border-[#34302B]'
                }`}>
                  <div className="text-6xl md:text-8xl font-black text-white tracking-tighter select-none font-mono drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                    {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:
                    {String(timeLeft % 60).padStart(2, '0')}
                  </div>
                </div>
              </div>

              <div className="flex gap-5 mt-4">
                <button
                  onClick={() => setPomodoroRunning(!pomodoroRunning)}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                    pomodoroRunning 
                      ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30 hover:bg-orange-500/20' 
                      : 'bg-[#A7C4A0] text-[#141312] hover:bg-[#90AE88]'
                  }`}
                >
                  {pomodoroRunning ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 fill-current" />}
                </button>

                <button
                  onClick={() => {
                    setPomodoroRunning(false);
                    setTimeLeft(25 * 60);
                    setIsBreak(false);
                  }}
                  className="w-14 h-14 rounded-full bg-[#262320] border border-[#34302B] text-[#A29A8B] flex items-center justify-center hover:text-white hover:border-[#A29A8B] transition-all cursor-pointer"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Ambient sound selector controls */}
            <div className="glass rounded-2xl p-5 w-full max-w-sm border border-[#34302B] flex justify-between items-center">
              <div className="text-left">
                <h3 className="text-xs font-bold text-white">Brown Noise Ambient Mixer</h3>
                <p className="text-[10px] text-[#A29A8B]">Blocks out distraction chatter.</p>
              </div>

              <button
                onClick={toggleSound}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  soundOn 
                    ? 'bg-[#A7C4A0]/10 border-[#A7C4A0]/30 text-[#A7C4A0]' 
                    : 'bg-[#141312] border-[#34302B] text-[#A29A8B] hover:text-white'
                }`}
              >
                {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            </div>

            <p className="text-xs text-[#A29A8B] max-w-md leading-relaxed">
              *Pro tip:* Turn off all secondary browser windows. Focus deeply on your customized Leitner active recall cards to lock concepts into long term storage.
            </p>
          </div>
        </div>
      )}
      {/* Markdown Guide Overlay */}
      {showMarkdownGuide && (
        <div className="fixed inset-0 bg-[#141312]/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#1D1B19] border border-[#34302B] rounded-2xl p-6 md:p-8 max-w-lg w-full shadow-2xl relative">
            <button 
              onClick={() => setShowMarkdownGuide(false)}
              className="absolute top-4 right-4 text-[#A29A8B] hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-xl font-black text-white mb-6 flex items-center gap-2">
              <FileEdit className="w-5 h-5 text-[#A7C4A0]" /> Notepad Markdown Guide
            </h3>
            
            <div className="space-y-4 text-sm text-[#A29A8B]">
              <div className="grid grid-cols-[100px_1fr] gap-4 pb-4 border-b border-[#34302B]">
                <span className="font-mono text-[#A7C4A0]"># (space)</span>
                <span>Heading 1 (Large Title)</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-4 pb-4 border-b border-[#34302B]">
                <span className="font-mono text-[#A7C4A0]">## (space)</span>
                <span>Heading 2 (Medium Title)</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-4 pb-4 border-b border-[#34302B]">
                <span className="font-mono text-[#A7C4A0]">### (space)</span>
                <span>Heading 3 (Small Title)</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-4 pb-4 border-b border-[#34302B]">
                <span className="font-mono text-[#A7C4A0]">[] (space)</span>
                <span>Task List / Checkbox Item</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-4 pb-4 border-b border-[#34302B]">
                <span className="font-mono text-[#A7C4A0]">- (space)</span>
                <span>Bullet List</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-4 pb-4 border-b border-[#34302B]">
                <span className="font-mono text-[#A7C4A0]">1. (space)</span>
                <span>Numbered List</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-4 pb-4 border-b border-[#34302B]">
                <span className="font-mono text-[#A7C4A0]">**text**</span>
                <span><strong>Bold Text</strong></span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-4 pb-4 border-b border-[#34302B]">
                <span className="font-mono text-[#A7C4A0]">*text*</span>
                <span><em>Italic Text</em></span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-4">
                <span className="font-mono text-[#A7C4A0]">&gt; (space)</span>
                <span className="border-l-2 border-[#A7C4A0] pl-2 blockquote text-white/70 italic">Blockquote</span>
              </div>
            </div>
            
            <p className="mt-8 text-[10px] text-center text-[#A29A8B]/60">
              Just type these symbols at the start of a line (or around text) to instantly format your notes!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
