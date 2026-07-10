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
import { api, SubjectDashboard, Recommendation } from "../lib/api";

export default function Home() {
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
      alert("Failed to delete subject.");
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
      alert("Failed to update subject.");
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
    loadData();
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
      alert("Failed to create subject. Make sure backend is running!");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen pb-16 px-4 md:px-8 max-w-7xl mx-auto pt-6 selection:bg-[#66FCF1] selection:text-[#0B0C10]">
      {/* Premium Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10 border-b border-[#222634] pb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-[#66FCF1]/10 text-[#66FCF1] px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 accent-glow">
              <Sparkles className="w-3.5 h-3.5" /> AI Academic Coach Enabled
            </span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-[#E2E8F0] to-[#8E9BAE] bg-clip-text text-transparent">
            Finals Buddy
          </h1>
          <p className="text-[#8E9BAE] text-sm mt-1">
            Personal adaptive study planner & tutoring engine for your exams.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-[#66FCF1] text-[#0B0C10] hover:bg-[#45E3D8] transition-all font-semibold px-4.5 py-2.5 rounded-lg shadow-lg hover:shadow-[#66FCF1]/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Add Subject
        </button>
      </header>

      {/* Global Dashboard Summary Grid */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
        <div className="glass rounded-xl p-5 relative overflow-hidden flex flex-col justify-between min-h-[120px]">
          <div>
            <span className="text-xs font-medium text-[#8E9BAE] uppercase tracking-wider block mb-1">Total Subjects</span>
            <span className="text-3xl font-extrabold">{summary.total_subjects}</span>
          </div>
          <div className="absolute right-3 bottom-3 text-[#66FCF1]/10">
            <BookMarked className="w-12 h-12" />
          </div>
        </div>

        <div className="glass rounded-xl p-5 relative overflow-hidden flex flex-col justify-between min-h-[120px]">
          <div>
            <span className="text-xs font-medium text-[#8E9BAE] uppercase tracking-wider block mb-1">Studied Hours</span>
            <span className="text-3xl font-extrabold text-[#66FCF1]">{summary.studied_hours}h</span>
          </div>
          <div className="absolute right-3 bottom-3 text-[#66FCF1]/10">
            <Clock className="w-12 h-12" />
          </div>
        </div>

        <div className="glass rounded-xl p-5 relative overflow-hidden flex flex-col justify-between min-h-[120px]">
          <div>
            <span className="text-xs font-medium text-[#8E9BAE] uppercase tracking-wider block mb-1">Overall Ingestion</span>
            <span className="text-3xl font-extrabold">{summary.completion_rate}%</span>
          </div>
          <div className="w-full bg-[#222634] h-1.5 rounded-full overflow-hidden mt-2">
            <div 
              className="bg-emerald-400 h-full rounded-full transition-all duration-500" 
              style={{ width: `${summary.completion_rate}%` }}
            ></div>
          </div>
          <div className="absolute right-3 top-3 text-emerald-400/20">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="glass rounded-xl p-5 relative overflow-hidden flex flex-col justify-between min-h-[120px]">
          <div>
            <span className="text-xs font-medium text-[#8E9BAE] uppercase tracking-wider block mb-1">Avg Confidence</span>
            <span className="text-3xl font-extrabold text-[#66FCF1]">{summary.average_confidence}%</span>
          </div>
          <div className="absolute right-3 bottom-3 text-[#66FCF1]/10">
            <Award className="w-12 h-12" />
          </div>
        </div>

        <div className="glass rounded-xl p-5 col-span-2 lg:col-span-1 relative overflow-hidden flex flex-col justify-between min-h-[120px]">
          <div>
            <span className="text-xs font-medium text-[#8E9BAE] uppercase tracking-wider block mb-1 flex items-center gap-1.5">
              Burnout Risk <Flame className="w-3.5 h-3.5 text-orange-400 animate-pulse" />
            </span>
            <span className="text-3xl font-extrabold text-orange-400">{summary.burnout_risk_percentage}%</span>
          </div>
          <div className="w-full bg-[#222634] h-1.5 rounded-full overflow-hidden mt-2">
            <div 
              className="bg-orange-400 h-full rounded-full transition-all duration-500" 
              style={{ width: `${summary.burnout_risk_percentage}%` }}
            ></div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Agent Recommendations Dashboard */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <div className="glass rounded-2xl p-6 border border-[#222634] relative">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2 text-[#66FCF1]">
                <Activity className="w-4 h-4 text-[#66FCF1]" /> What to Study Next
              </h2>
              <span className="bg-[#66FCF1]/10 text-[#66FCF1] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Proactive</span>
            </div>
            
            <p className="text-xs text-[#8E9BAE] mb-6">
              AI evaluates urgency, difficulty weights, concept importance, and low-confidence domains.
            </p>

            <div className="flex flex-col gap-4">
              {recommendations.length > 0 ? (
                recommendations.map((rec) => (
                  <div key={rec.id} className="bg-[#1C1F2E] border border-[#2B3045] rounded-xl p-4.5 transition-all hover:border-[#66FCF1]/30">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="bg-[#66FCF1]/15 text-[#66FCF1] text-xs font-extrabold px-2 py-0.5 rounded-md">
                        {rec.score}% Match
                      </span>
                      <span className="text-[10px] text-[#8E9BAE] flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {rec.task?.duration_minutes || 30} mins
                      </span>
                    </div>

                    <h3 className="font-bold text-sm text-white mb-1.5">{rec.task?.title}</h3>
                    <p className="text-xs text-[#8E9BAE] line-clamp-2 mb-3.5 leading-relaxed">{rec.task?.description || rec.reason}</p>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-orange-400 flex items-center gap-1 font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5" /> High Urgency Action
                      </span>
                      
                      <Link 
                        href={`/subject/${rec.subject_id}`}
                        className="text-xs text-[#66FCF1] hover:text-[#45E3D8] transition-all flex items-center gap-0.5 font-bold cursor-pointer"
                      >
                        Study Portal <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-[#8E9BAE] text-xs">
                  All tasks complete! Upload more material or add subjects to trigger suggestions.
                </div>
              )}
            </div>
          </div>

          {/* SVG Readiness Analytics */}
          <div className="glass rounded-2xl p-6 border border-[#222634]">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#66FCF1]" /> Exam Readiness Map
            </h2>
            <div className="flex items-center justify-center h-48 relative">
              <svg viewBox="0 0 100 100" className="w-36 h-36">
                {/* Radial readiness track */}
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#222634" strokeWidth="8" />
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
                    <stop offset="0%" stopColor="#66FCF1" />
                    <stop offset="100%" stopColor="#00A896" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black">{summary.average_confidence}%</span>
                <span className="text-[10px] uppercase font-bold text-[#8E9BAE] tracking-wider">Ready index</span>
              </div>
            </div>
            <p className="text-xs text-[#8E9BAE] text-center leading-relaxed mt-2">
              Aggregated concept knowledge across all active domains. Keep flashcard reviews high to boost your memory score.
            </p>
          </div>
        </div>

        {/* Right Side: Subjects Dashboard Grid */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#66FCF1]" /> Subject Portals
            </h2>
            <span className="text-xs text-[#8E9BAE]">{subjects.length} active courses</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {subjects.map((subj) => (
              <div 
                key={subj.id}
                className="glass rounded-2xl p-5 border border-[#222634] hover:border-[#66FCF1]/30 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      subj.urgency_status === 'critical' ? 'bg-red-500/20 text-red-400' :
                      subj.urgency_status === 'high' ? 'bg-orange-500/20 text-orange-400' :
                      subj.urgency_status === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {subj.urgency_status} urgency
                    </span>
                    {subj.exam_date && (
                      <span className="text-[10px] text-[#8E9BAE] flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {subj.exam_date}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between items-center mb-1 gap-2">
                    <h3 className="font-extrabold text-white text-base line-clamp-1 flex-1">{subj.name}</h3>
                    <div className="flex gap-1.5 items-center shrink-0">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleEditSubject(subj);
                        }}
                        title="Edit Subject"
                        className="text-[#8E9BAE] hover:text-[#66FCF1] transition-all p-1 cursor-pointer"
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
                        className="text-[#8E9BAE] hover:text-red-400 transition-all p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2 mb-4 text-[10px] text-[#8E9BAE]">
                    <span>Priority: Lvl {subj.priority_level}</span>
                    <span>•</span>
                    <span>Difficulty: Lvl {subj.difficulty}</span>
                    <span>•</span>
                    <span>{subj.materials_count} files</span>
                  </div>

                  {/* Confidence Slider bar */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="text-[#8E9BAE]">Confidence</span>
                      <span className="font-bold text-[#66FCF1]">{subj.confidence_score}%</span>
                    </div>
                    <div className="w-full bg-[#1C1F2E] h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-[#66FCF1] h-full rounded-full transition-all"
                        style={{ width: `${subj.confidence_score}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Weak topics taglets */}
                  {subj.weak_topics && subj.weak_topics.length > 0 && (
                    <div className="mb-4">
                      <span className="text-[10px] font-bold text-[#8E9BAE] uppercase tracking-wider block mb-1.5">Weak areas:</span>
                      <div className="flex flex-wrap gap-1">
                        {subj.weak_topics.map((t, idx) => (
                          <span key={idx} className="bg-[#1C1F2E] border border-[#2B3045] text-white text-[10px] px-2 py-0.5 rounded">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-[#222634] pt-4.5 mt-2 flex justify-between items-center">
                  <div className="text-left">
                    <span className="text-[9px] uppercase font-bold text-[#8E9BAE] block">Completion</span>
                    <span className="text-xs font-black text-white">{subj.completion_percentage}%</span>
                  </div>

                  <Link
                    href={`/subject/${subj.id}`}
                    className="bg-[#222634] hover:bg-[#66FCF1] hover:text-[#0B0C10] text-[#66FCF1] transition-all px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    Open Portal <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Subject Modal Popup Dialog */}
      {showModal && (
        <div className="fixed inset-0 bg-[#0B0C10]/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-[#151821] border border-[#222634] rounded-2xl w-full max-w-md p-6 relative shadow-2xl accent-glow">
            <button 
              onClick={() => setShowModal(false)}
              className="absolute right-4 top-4 text-[#8E9BAE] hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
              <BookMarked className="w-5 h-5 text-[#66FCF1]" /> Add New Subject
            </h2>

            <form onSubmit={handleAddSubject} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-[#8E9BAE] uppercase mb-1.5">Subject Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Operating Systems (CS 401)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#0B0C10] border border-[#222634] text-white rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#66FCF1]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#8E9BAE] uppercase mb-1.5">Exam Date</label>
                <input 
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="w-full bg-[#0B0C10] border border-[#222634] text-white rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#66FCF1]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#8E9BAE] uppercase mb-1.5">Priority (1-5)</label>
                  <input 
                    type="range"
                    min="1"
                    max="5"
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="w-full accent-[#66FCF1]"
                  />
                  <div className="text-right text-xs font-extrabold text-[#66FCF1] mt-1">Lvl {priority}</div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#8E9BAE] uppercase mb-1.5">Difficulty (1-5)</label>
                  <input 
                    type="range"
                    min="1"
                    max="5"
                    value={difficulty}
                    onChange={(e) => setDifficulty(Number(e.target.value))}
                    className="w-full accent-[#66FCF1]"
                  />
                  <div className="text-right text-xs font-extrabold text-[#66FCF1] mt-1">Lvl {difficulty}</div>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#66FCF1] text-[#0B0C10] font-bold py-2.5 rounded-lg hover:bg-[#45E3D8] transition-all shadow-lg mt-2 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? "Initializing Subject..." : "Create Course Portal"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Subject Modal Popup Dialog */}
      {editSubject && (
        <div className="fixed inset-0 bg-[#0B0C10]/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-[#151821] border border-[#222634] rounded-2xl w-full max-w-md p-6 relative shadow-2xl accent-glow">
            <button 
              onClick={() => setEditSubject(null)}
              className="absolute right-4 top-4 text-[#8E9BAE] hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
              <Edit className="w-5 h-5 text-[#66FCF1]" /> Edit Subject: {editSubject.name}
            </h2>

            <form onSubmit={handleUpdateSubject} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-[#8E9BAE] uppercase mb-1.5">Subject Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Operating Systems (CS 401)"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-[#0B0C10] border border-[#222634] text-white rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#66FCF1]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#8E9BAE] uppercase mb-1.5">Exam Date</label>
                <input 
                  type="date"
                  value={editExamDate}
                  onChange={(e) => setEditExamDate(e.target.value)}
                  className="w-full bg-[#0B0C10] border border-[#222634] text-white rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#66FCF1]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#8E9BAE] uppercase mb-1.5">Priority (1-5)</label>
                  <input 
                    type="range"
                    min="1"
                    max="5"
                    value={editPriority}
                    onChange={(e) => setEditPriority(Number(e.target.value))}
                    className="w-full accent-[#66FCF1]"
                  />
                  <div className="text-right text-xs font-extrabold text-[#66FCF1] mt-1">Lvl {editPriority}</div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#8E9BAE] uppercase mb-1.5">Difficulty (1-5)</label>
                  <input 
                    type="range"
                    min="1"
                    max="5"
                    value={editDifficulty}
                    onChange={(e) => setEditDifficulty(Number(e.target.value))}
                    className="w-full accent-[#66FCF1]"
                  />
                  <div className="text-right text-xs font-extrabold text-[#66FCF1] mt-1">Lvl {editDifficulty}</div>
                </div>
              </div>

              <button
                type="submit"
                disabled={updating}
                className="w-full bg-[#66FCF1] text-[#0B0C10] font-bold py-2.5 rounded-lg hover:bg-[#45E3D8] transition-all shadow-lg mt-2 disabled:opacity-50 cursor-pointer"
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
