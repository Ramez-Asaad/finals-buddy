"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  BookOpen, 
  Calendar, 
  Clock, 
  Award, 
  AlertTriangle, 
  Activity, 
  Plus, 
  ChevronRight, 
  BookMarked,
  Sparkles,
  Flame,
  CheckCircle,
  HelpCircle,
  TrendingUp,
  X,
  Edit,
  Trash2
} from "lucide-react";
import { api, getToken, getStoredUser, SubjectDashboard, Recommendation } from "../lib/api";
import { toast } from "../components/Toast";
import { useRouter } from "next/navigation";

// Days between today and an ISO exam date. null when no date set.
function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const exam = new Date(iso + "T00:00:00");
  if (isNaN(exam.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((exam.getTime() - today.getTime()) / 86400000);
}


export default function Home() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<SubjectDashboard[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [summary, setSummary] = useState<any>({
    total_subjects: 0,
    studied_hours: 0,
    completion_rate: 0,
    average_confidence: 0,
    burnout_risk_percentage: 0
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Set after mount to avoid an SSR/client hydration mismatch (localStorage is
  // only available on the client).
  const [userName, setUserName] = useState("");

  // New Subject Modal Form
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [priority, setPriority] = useState(3);
  const [difficulty, setDifficulty] = useState(3);
  const [submitting, setSubmitting] = useState(false);

  // Edit Subject Form
  const [editSubject, setEditSubject] = useState<SubjectDashboard | null>(null);
  const [editName, setEditName] = useState("");
  const [editExamDate, setEditExamDate] = useState("");
  const [editPriority, setEditPriority] = useState(3);
  const [editDifficulty, setEditDifficulty] = useState(3);
  const [updating, setUpdating] = useState(false);

  async function handleDeleteSubject(id: number) {
    if (!confirm("Are you sure you want to delete this subject? All materials, tasks, quizzes and chat history will be permanently deleted!")) return;
    try {
      await api.deleteSubject(id);
      await loadData();
    } catch (err) {
      console.error(err);
      toast("Couldn't delete the subject.", "error");
    }
  }

  function handleEditSubject(subj: SubjectDashboard) {
    setEditSubject(subj);
    setEditName(subj.name);
    setEditExamDate(subj.exam_date || "");
    setEditPriority(subj.priority_level);
    setEditDifficulty(subj.difficulty);
  }

  async function handleUpdateSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!editSubject || !editName) return;
    try {
      setUpdating(true);
      await api.updateSubject(editSubject.id, {
        name: editName,
        exam_date: editExamDate || undefined,
        priority_level: editPriority,
        difficulty: editDifficulty
      });
      setEditSubject(null);
      await loadData();
    } catch (err) {
      console.error(err);
      toast("Couldn't save your changes.", "error");
    } finally {
      setUpdating(false);
    }
  }

  async function loadData() {
    try {
      setLoading(true);
      const subList = await api.getSubjects();
      
      const dashboardSubjects = await Promise.all(
        subList.map(async (s) => {
          try {
            return await api.getSubject(s.id);
          } catch {
            return {
              id: s.id,
              name: s.name,
              exam_date: s.exam_date,
              priority_level: s.priority_level,
              difficulty: s.difficulty,
              confidence_score: s.confidence_score,
              materials_count: 0,
              completion_percentage: 0,
              hours_remaining: 0,
              weak_topics: ["None yet"],
              urgency_status: "low" as const
            };
          }
        })
      );
      setSubjects(dashboardSubjects);

      const recs = await api.getRecommendations();
      setRecommendations(recs);

      const sumData = await api.getDashboardSummary();
      setSummary(sumData);
      
      setError(null);
    } catch (err: any) {
      console.error(err);
      // Setup detailed mock data so it runs offline beautifully!
      const mockSubjects: SubjectDashboard[] = [
        {
          id: 1,
          name: "Operating Systems (CS 401)",
          exam_date: "2026-06-03",
          priority_level: 5,
          difficulty: 4,
          confidence_score: 45.0,
          materials_count: 3,
          completion_percentage: 40.0,
          hours_remaining: 12.5,
          weak_topics: ["Virtual Memory", "Page Replacement"],
          next_recommended_action: "Study 'Virtual Memory' (92.5% Priority Match)",
          urgency_status: "medium"
        },
        {
          id: 2,
          name: "Computer Architecture (CS 302)",
          exam_date: "2026-05-24",
          priority_level: 4,
          difficulty: 5,
          confidence_score: 75.0,
          materials_count: 4,
          completion_percentage: 85.0,
          hours_remaining: 2.0,
          weak_topics: ["Pipelining Hazards"],
          next_recommended_action: "Take Practice Quiz: Pipelining Hazards",
          urgency_status: "critical"
        },
        {
          id: 3,
          name: "Algorithms & Complexity",
          exam_date: "2026-06-15",
          priority_level: 3,
          difficulty: 4,
          confidence_score: 60.0,
          materials_count: 2,
          completion_percentage: 20.0,
          hours_remaining: 18.0,
          weak_topics: ["Dynamic Programming"],
          next_recommended_action: "Upload Syllabus or Slides",
          urgency_status: "low"
        }
      ];
      setSubjects(mockSubjects);

      setRecommendations([
        {
          id: 101,
          subject_id: 2,
          task_id: 1001,
          score: 95.2,
          reason: "High urgency due to approaching exam (in 2 days!)",
          is_dismissed: false,
          created_at: new Date().toISOString(),
          task: {
            id: 1001,
            subject_id: 2,
            title: "Resolve Pipelining Hazard Quiz Questions",
            description: "Solve branch prediction problems from Assignment 3.",
            duration_minutes: 30,
            urgency_score: 9.8,
            importance_score: 8.5,
            status: "pending",
            created_at: new Date().toISOString()
          }
        },
        {
          id: 102,
          subject_id: 1,
          task_id: 1002,
          score: 88.4,
          reason: "Operating Systems difficulty is high & confidence is low (45.0%)",
          is_dismissed: false,
          created_at: new Date().toISOString(),
          task: {
            id: 1002,
            subject_id: 1,
            title: "Review Page Replacement Algorithms",
            description: "Analyze FIFO vs LRU and complete practice recall flashcards.",
            duration_minutes: 45,
            urgency_score: 6.5,
            importance_score: 9.0,
            status: "pending",
            created_at: new Date().toISOString()
          }
        }
      ]);

      setSummary({
        total_subjects: 3,
        studied_hours: 14.5,
        completion_rate: 48.3,
        average_confidence: 60.0,
        burnout_risk_percentage: 38.0
      });
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
    setUserName(getStoredUser()?.name ?? "");
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!name) return;
    try {
      setSubmitting(true);
      await api.createSubject(name, examDate || undefined, priority, difficulty);
      setName("");
      setExamDate("");
      setPriority(3);
      setDifficulty(3);
      setShowModal(false);
      await loadData();
    } catch (err) {
      console.error(err);
      toast("Couldn't create the subject. Is the server running?", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen w-full pb-16 px-4 md:px-8 max-w-7xl mx-auto pt-6 selection:bg-[#A7C4A0] selection:text-[#141312]">
      {/* Premium Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10 border-b border-[#34302B] pb-8">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-[#ECE6DA]">
            Finals Buddy
          </h1>
          <p className="text-[#A29A8B] text-sm mt-1.5">
            Your study desk for exam season.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-[#A7C4A0] text-[#141312] hover:bg-[#90AE88] transition-colors font-semibold px-4.5 py-2.5 rounded-lg cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Subject
          </button>
          <div className="flex items-center gap-2 border border-[#34302B] rounded-lg px-3 py-2">
            <span className="text-sm text-[#A29A8B] max-w-[140px] truncate">
              {userName}
            </span>
            <button
              onClick={() => api.logout()}
              className="text-xs font-bold text-[#A29A8B] hover:text-red-400 transition-colors uppercase tracking-wider cursor-pointer"
              title="Sign out"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Global Dashboard Summary Grid */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
        <div className="glass rounded-xl p-5 relative overflow-hidden flex flex-col justify-between min-h-[120px]">
          <div>
            <span className="text-xs font-medium text-[#A29A8B] uppercase tracking-wider block mb-1">Subjects</span>
            <span className="font-display tnum text-3xl font-semibold">{summary.total_subjects}</span>
          </div>
          <div className="absolute right-3 bottom-3 text-[#A7C4A0]/10">
            <BookMarked className="w-12 h-12" />
          </div>
        </div>

        <div className="glass rounded-xl p-5 relative overflow-hidden flex flex-col justify-between min-h-[120px]">
          <div>
            <span className="text-xs font-medium text-[#A29A8B] uppercase tracking-wider block mb-1">Hours studied</span>
            <span className="font-display tnum text-3xl font-semibold text-[#A7C4A0]">{summary.studied_hours}h</span>
          </div>
          <div className="absolute right-3 bottom-3 text-[#A7C4A0]/10">
            <Clock className="w-12 h-12" />
          </div>
        </div>

        <div className="glass rounded-xl p-5 relative overflow-hidden flex flex-col justify-between min-h-[120px]">
          <div>
            <span className="text-xs font-medium text-[#A29A8B] uppercase tracking-wider block mb-1">Tasks done</span>
            <span className="font-display tnum text-3xl font-semibold">{summary.completion_rate}%</span>
          </div>
          <div className="w-full bg-[#34302B] h-0.5 rounded-full overflow-hidden mt-2">
            <div
              className="bg-[#A7C4A0] h-full rounded-full transition-all duration-500"
              style={{ width: `${summary.completion_rate}%` }}
            ></div>
          </div>
        </div>

        <div className="glass rounded-xl p-5 relative overflow-hidden flex flex-col justify-between min-h-[120px]">
          <div>
            <span className="text-xs font-medium text-[#A29A8B] uppercase tracking-wider block mb-1">Confidence</span>
            <span className="font-display tnum text-3xl font-semibold text-[#A7C4A0]">{summary.average_confidence}%</span>
          </div>
          <div className="absolute right-3 bottom-3 text-[#A7C4A0]/10">
            <Award className="w-12 h-12" />
          </div>
        </div>

        <div className="glass rounded-xl p-5 col-span-2 lg:col-span-1 relative overflow-hidden flex flex-col justify-between min-h-[120px]">
          <div>
            <span className="text-xs font-medium text-[#A29A8B] uppercase tracking-wider block mb-1">Burnout risk</span>
            <span
              className="font-display tnum text-3xl font-semibold"
              style={{ color: summary.burnout_risk_percentage >= 60 ? "#D28C97" : "#ECE6DA" }}
            >{summary.burnout_risk_percentage}%</span>
          </div>
          <div className="w-full bg-[#34302B] h-0.5 rounded-full overflow-hidden mt-2">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${summary.burnout_risk_percentage}%`, background: summary.burnout_risk_percentage >= 60 ? "#D28C97" : "#A29A8B" }}
            ></div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Agent Recommendations Dashboard */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <div className="glass rounded-2xl p-6 border border-[#34302B] relative">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-semibold text-[#ECE6DA]">
                <span className="mark-underline">What to study next</span>
              </h2>
            </div>

            <p className="text-xs text-[#A29A8B] mb-6">
              Ranked by what's due soonest, hardest, and least solid for you right now.
            </p>

            <div className="flex flex-col gap-4">
              {recommendations.length > 0 ? (
                recommendations.map((rec) => (
                  <div key={rec.id} className="bg-[#262320] border border-[#34302B] rounded-lg p-4.5 transition-colors hover:border-[#A7C4A0]/30">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-xs font-semibold text-[#A7C4A0]">
                        {rec.score}% match
                      </span>
                      <span className="text-[10px] text-[#A29A8B] flex items-center gap-1 tnum">
                        <Clock className="w-3 h-3" /> {rec.task?.duration_minutes || 30} min
                      </span>
                    </div>

                    <h3 className="font-display font-semibold text-sm text-[#ECE6DA] mb-1.5">{rec.task?.title}</h3>
                    <p className="text-xs text-[#A29A8B] line-clamp-2 mb-3.5 leading-relaxed">{rec.task?.description || rec.reason}</p>

                    <div className="flex items-center justify-end">
                      <Link
                        href={`/subject/${rec.subject_id}`}
                        className="text-xs text-[#A7C4A0] hover:text-[#90AE88] transition-colors flex items-center gap-0.5 font-semibold cursor-pointer"
                      >
                        Go study <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-[#A29A8B] text-xs leading-relaxed">
                  Nothing queued right now. Add a subject or upload material and suggestions will show up here.
                </div>
              )}
            </div>
          </div>

          {/* SVG Readiness Analytics */}
          <div className="glass rounded-2xl p-6 border border-[#34302B]">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#A7C4A0]" /> Exam Readiness Map
            </h2>
            <div className="flex items-center justify-center h-48 relative">
              <svg viewBox="0 0 100 100" className="w-36 h-36">
                {/* Radial readiness track */}
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#34302B" strokeWidth="8" />
                <circle 
                  cx="50" 
                  cy="50" 
                  r="40" 
                  fill="transparent" 
                  stroke="url(#accentGradient)" 
                  strokeWidth="8" 
                  strokeDasharray="251.2"
                  strokeDashoffset={251.2 - (251.2 * (summary.average_confidence || 60.0)) / 100}
                  strokeLinecap="round"
                  className="transition-all duration-1000 origin-center -rotate-90"
                />
                <defs>
                  <linearGradient id="accentGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#A7C4A0" />
                    <stop offset="100%" stopColor="#90AE88" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black">{summary.average_confidence}%</span>
                <span className="text-[10px] uppercase font-bold text-[#A29A8B] tracking-wider">Ready index</span>
              </div>
            </div>
            <p className="text-xs text-[#A29A8B] text-center leading-relaxed mt-2">
              Aggregated concept knowledge across all active domains. Keep flashcard reviews high to boost your memory score.
            </p>
          </div>
        </div>

        {/* Right Side: Subjects Dashboard Grid */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold text-[#ECE6DA]">Your subjects</h2>
            <span className="text-xs text-[#A29A8B]">{subjects.length} active</span>
          </div>

          {!loading && subjects.length === 0 ? (
            <div className="glass rounded-xl border border-[#34302B] p-8 md:p-10">
              <h3 className="font-display text-2xl font-semibold text-[#ECE6DA]">Welcome to your study desk.</h3>
              <p className="text-sm text-[#A29A8B] mt-2 leading-relaxed max-w-lg">
                It's empty for now — that's on purpose. Add your first subject and
                Finals Buddy turns your material into a plan for exam season.
              </p>

              <ol className="mt-7 flex flex-col gap-5">
                {[
                  { n: "1", t: "Add a subject", d: "Course name and exam date. The countdown starts and tasks begin to prioritise themselves." },
                  { n: "2", t: "Upload your material", d: "Drop in lecture PDFs, slides, or notes. They're read and turned into summaries, flashcards and quizzes." },
                  { n: "3", t: "Study what matters next", d: "Work the planner, run spaced-repetition recall, sit a mock exam, or ask the tutor about your own notes." },
                ].map((step) => (
                  <li key={step.n} className="flex gap-4">
                    <span className="font-display shrink-0 w-8 h-8 rounded-full border border-[#A7C4A0]/40 text-[#A7C4A0] flex items-center justify-center text-sm font-semibold">
                      {step.n}
                    </span>
                    <div>
                      <h4 className="text-sm font-semibold text-[#ECE6DA]">{step.t}</h4>
                      <p className="text-xs text-[#A29A8B] mt-0.5 leading-relaxed">{step.d}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <button
                onClick={() => setShowModal(true)}
                className="mt-8 flex items-center gap-2 bg-[#A7C4A0] text-[#141312] hover:bg-[#90AE88] transition-colors font-semibold px-4 py-2.5 rounded-lg cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add your first subject
              </button>
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {subjects.map((subj) => {
              const days = daysUntil(subj.exam_date);
              return (
              <div
                key={subj.id}
                className="glass rounded-xl p-5 border border-[#34302B] hover:border-[#A7C4A0]/30 transition-colors flex flex-col justify-between"
              >
                <div>
                  {/* Countdown is the emotional core — let it lead */}
                  <div className="flex justify-between items-start mb-3">
                    <div className="leading-none">
                      {days !== null ? (
                        <>
                          <span
                            className="font-display tnum text-3xl font-semibold"
                            style={{ color: days >= 0 && days <= 3 ? "#D28C97" : "#ECE6DA" }}
                          >
                            {days < 0 ? "—" : days}
                          </span>
                          <span className="text-xs text-[#A29A8B] ml-1.5">
                            {days < 0 ? "exam passed" : days === 0 ? "today" : days === 1 ? "day left" : "days left"}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-[#A29A8B]">No exam date set</span>
                      )}
                    </div>
                    {subj.exam_date && (
                      <span className="text-[10px] text-[#A29A8B] flex items-center gap-1 mt-1">
                        <Calendar className="w-3 h-3" /> {subj.exam_date}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between items-center mb-1 gap-2">
                    <h3 className="font-display font-semibold text-[#ECE6DA] text-base line-clamp-1 flex-1">{subj.name}</h3>
                    <div className="flex gap-1.5 items-center shrink-0">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleEditSubject(subj);
                        }}
                        title="Edit Subject"
                        className="text-[#A29A8B] hover:text-[#A7C4A0] transition-all p-1 cursor-pointer"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleDeleteSubject(subj.id);
                        }}
                        title="Delete Subject"
                        className="text-[#A29A8B] hover:text-red-400 transition-all p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2 mb-4 text-[10px] text-[#A29A8B]">
                    <span>Priority: Lvl {subj.priority_level}</span>
                    <span>•</span>
                    <span>Difficulty: Lvl {subj.difficulty}</span>
                    <span>•</span>
                    <span>{subj.materials_count} files</span>
                  </div>

                  {/* Confidence Slider bar */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="text-[#A29A8B]">Confidence</span>
                      <span className="font-bold text-[#A7C4A0]">{subj.confidence_score}%</span>
                    </div>
                    <div className="w-full bg-[#262320] h-0.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#A7C4A0] h-full rounded-full transition-all"
                        style={{ width: `${subj.confidence_score}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Weak topics taglets */}
                  {subj.weak_topics && subj.weak_topics.length > 0 && (
                    <div className="mb-4">
                      <span className="text-[10px] font-bold text-[#A29A8B] uppercase tracking-wider block mb-1.5">Weak areas:</span>
                      <div className="flex flex-wrap gap-1">
                        {subj.weak_topics.map((t, idx) => (
                          <span key={idx} className="bg-[#262320] border border-[#34302B] text-white text-[10px] px-2 py-0.5 rounded">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-[#34302B] pt-4.5 mt-2 flex justify-between items-center">
                  <div className="text-left">
                    <span className="text-[9px] uppercase font-bold text-[#A29A8B] block">Completion</span>
                    <span className="text-xs font-black text-white">{subj.completion_percentage}%</span>
                  </div>

                  <Link
                    href={`/subject/${subj.id}`}
                    className="bg-[#34302B] hover:bg-[#A7C4A0] hover:text-[#141312] text-[#A7C4A0] transition-colors px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    Open <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
              );
            })}
          </div>
          )}
        </div>
      </div>

      {/* Add Subject Modal Popup Dialog */}
      {showModal && (
        <div className="fixed inset-0 bg-[#141312]/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-[#1D1B19] border border-[#34302B] rounded-2xl w-full max-w-md p-6 relative shadow-2xl accent-glow">
            <button 
              onClick={() => setShowModal(false)}
              className="absolute right-4 top-4 text-[#A29A8B] hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
              <BookMarked className="w-5 h-5 text-[#A7C4A0]" /> Add New Subject
            </h2>

            <form onSubmit={handleAddSubject} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-[#A29A8B] uppercase mb-1.5">Subject Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Operating Systems (CS 401)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#141312] border border-[#34302B] text-white rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#A7C4A0]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#A29A8B] uppercase mb-1.5">Exam Date</label>
                <input 
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="w-full bg-[#141312] border border-[#34302B] text-white rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#A7C4A0]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#A29A8B] uppercase mb-1.5">Priority (1-5)</label>
                  <input 
                    type="range"
                    min="1"
                    max="5"
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="w-full accent-[#A7C4A0]"
                  />
                  <div className="text-right text-xs font-extrabold text-[#A7C4A0] mt-1">Lvl {priority}</div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#A29A8B] uppercase mb-1.5">Difficulty (1-5)</label>
                  <input 
                    type="range"
                    min="1"
                    max="5"
                    value={difficulty}
                    onChange={(e) => setDifficulty(Number(e.target.value))}
                    className="w-full accent-[#A7C4A0]"
                  />
                  <div className="text-right text-xs font-extrabold text-[#A7C4A0] mt-1">Lvl {difficulty}</div>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#A7C4A0] text-[#141312] font-bold py-2.5 rounded-lg hover:bg-[#90AE88] transition-all shadow-lg mt-2 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? "Initializing Subject..." : "Create Course Portal"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Subject Modal Popup Dialog */}
      {editSubject && (
        <div className="fixed inset-0 bg-[#141312]/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-[#1D1B19] border border-[#34302B] rounded-2xl w-full max-w-md p-6 relative shadow-2xl accent-glow">
            <button 
              onClick={() => setEditSubject(null)}
              className="absolute right-4 top-4 text-[#A29A8B] hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
              <Edit className="w-5 h-5 text-[#A7C4A0]" /> Edit Subject: {editSubject.name}
            </h2>

            <form onSubmit={handleUpdateSubject} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-[#A29A8B] uppercase mb-1.5">Subject Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Operating Systems (CS 401)"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-[#141312] border border-[#34302B] text-white rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#A7C4A0]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#A29A8B] uppercase mb-1.5">Exam Date</label>
                <input 
                  type="date"
                  value={editExamDate}
                  onChange={(e) => setEditExamDate(e.target.value)}
                  className="w-full bg-[#141312] border border-[#34302B] text-white rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#A7C4A0]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#A29A8B] uppercase mb-1.5">Priority (1-5)</label>
                  <input 
                    type="range"
                    min="1"
                    max="5"
                    value={editPriority}
                    onChange={(e) => setEditPriority(Number(e.target.value))}
                    className="w-full accent-[#A7C4A0]"
                  />
                  <div className="text-right text-xs font-extrabold text-[#A7C4A0] mt-1">Lvl {editPriority}</div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#A29A8B] uppercase mb-1.5">Difficulty (1-5)</label>
                  <input 
                    type="range"
                    min="1"
                    max="5"
                    value={editDifficulty}
                    onChange={(e) => setEditDifficulty(Number(e.target.value))}
                    className="w-full accent-[#A7C4A0]"
                  />
                  <div className="text-right text-xs font-extrabold text-[#A7C4A0] mt-1">Lvl {editDifficulty}</div>
                </div>
              </div>

              <button
                type="submit"
                disabled={updating}
                className="w-full bg-[#A7C4A0] text-[#141312] font-bold py-2.5 rounded-lg hover:bg-[#90AE88] transition-all shadow-lg mt-2 disabled:opacity-50 cursor-pointer"
              >
                {updating ? "Saving Changes..." : "Save Subject Details"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
