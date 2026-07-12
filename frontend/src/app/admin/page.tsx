"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldAlert,
  Users,
  BookMarked,
  FileText,
  MessageSquare,
  GraduationCap,
  Layers,
  HelpCircle,
  Database,
  HardDrive,
  Clock,
  CheckCircle2,
  XCircle,
  KeyRound,
  Eye,
  EyeOff,
  RefreshCw,
  Terminal,
  Loader2,
} from "lucide-react";
import { adminApi, ApiError, AdminOverview, AdminHealth, AdminConfig } from "../../lib/api";
import { toast } from "../../components/Toast";

const LOG_POLL_MS = 5000;

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="glass rounded-xl p-5 relative overflow-hidden flex flex-col justify-between min-h-[100px]">
      <div>
        <span className="text-xs font-medium text-[#A29A8B] uppercase tracking-wider block mb-1">{label}</span>
        <span className="font-display tnum text-2xl font-semibold text-[#ECE6DA]">{value}</span>
      </div>
      <div className="absolute right-3 bottom-3 text-[#A7C4A0]/10">{icon}</div>
    </div>
  );
}

function CheckRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#34302B] last:border-0">
      <span className="text-sm text-[#ECE6DA]">{label}</span>
      <div className="flex items-center gap-2">
        {detail && <span className="text-xs text-[#A29A8B] tnum">{detail}</span>}
        {ok ? (
          <CheckCircle2 className="w-4 h-4 text-[#A7C4A0]" />
        ) : (
          <XCircle className="w-4 h-4 text-[#D28C97]" />
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authorized, setAuthorized] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [config, setConfig] = useState<AdminConfig | null>(null);

  const [logLines, setLogLines] = useState<string[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const logBoxRef = useRef<HTMLDivElement | null>(null);

  const [groqKey1, setGroqKey1] = useState("");
  const [groqKey2, setGroqKey2] = useState("");
  const [showKey1, setShowKey1] = useState(false);
  const [showKey2, setShowKey2] = useState(false);
  const [savingKeys, setSavingKeys] = useState(false);

  async function loadCore() {
    try {
      const ov = await adminApi.getOverview();
      setOverview(ov);
      setAuthorized(true);

      const [h, c] = await Promise.all([adminApi.getHealth(), adminApi.getConfig()]);
      setHealth(h);
      setConfig(c);
      setLoadError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setAuthorized(false);
      } else {
        console.error(err);
        setLoadError(err instanceof Error ? err.message : "Failed to load admin data.");
      }
    } finally {
      setAuthChecked(true);
      setLoading(false);
    }
  }

  async function loadLogs() {
    try {
      const res = await adminApi.getLogs(200);
      setLogLines(res.lines);
      setLogTotal(res.total_lines);
    } catch (err) {
      // Quiet — the core panels already surface auth/connectivity problems.
      if (!(err instanceof ApiError && err.status === 403)) {
        console.error(err);
      }
    }
  }

  useEffect(() => {
    loadCore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authChecked || !authorized) return;
    loadLogs();
    const interval = setInterval(loadLogs, LOG_POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, authorized]);

  // Keep the log viewer pinned to the newest line as it polls in.
  useEffect(() => {
    if (logBoxRef.current) {
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }
  }, [logLines]);

  async function handleSaveKeys(e: React.FormEvent) {
    e.preventDefault();
    if (!groqKey1 && !groqKey2) {
      toast("Enter at least one key to update.", "error");
      return;
    }
    if (!confirm("Update the Groq API key(s) now? This takes effect immediately for new AI requests, no restart needed.")) {
      return;
    }
    try {
      setSavingKeys(true);
      const payload: { groq_api_key?: string; groq_api_key_2?: string } = {};
      if (groqKey1) payload.groq_api_key = groqKey1;
      if (groqKey2) payload.groq_api_key_2 = groqKey2;
      const result = await adminApi.updateConfig(payload);
      setGroqKey1("");
      setGroqKey2("");
      setConfig((prev) =>
        prev
          ? {
              ...prev,
              groq_api_key_masked: result.groq_api_key_masked,
              groq_api_key_2_masked: result.groq_api_key_2_masked,
              groq_api_key_set: !!result.groq_api_key_masked,
              groq_api_key_2_set: !!result.groq_api_key_2_masked,
            }
          : prev
      );
      const hVal = await adminApi.getHealth();
      setHealth(hVal);
      toast("Groq key(s) saved and live — no restart needed.", "success");
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : "Failed to save Groq key(s).", "error");
    } finally {
      setSavingKeys(false);
    }
  }

  if (authChecked && !authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#141312] px-4">
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center">
          <ShieldAlert className="w-10 h-10 text-[#D28C97] mx-auto mb-4" />
          <h1 className="font-display text-xl font-semibold text-[#ECE6DA] mb-2">Not authorized</h1>
          <p className="text-sm text-[#A29A8B] leading-relaxed">
            This admin dashboard is only available to the site owner's account.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 mt-6 text-sm text-[#A7C4A0] hover:text-[#90AE88] transition-colors font-semibold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16 px-4 md:px-8 max-w-7xl mx-auto pt-6 selection:bg-[#A7C4A0] selection:text-[#141312]">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10 border-b border-[#34302B] pb-8">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-[#A29A8B] hover:text-[#A7C4A0] transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
          </Link>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-[#ECE6DA]">Admin</h1>
          <p className="text-[#A29A8B] text-sm mt-1.5">
            Stats, logs, and configuration for the deployed instance.
          </p>
        </div>
        <button
          onClick={() => {
            loadCore();
            loadLogs();
          }}
          className="flex items-center gap-2 border border-[#34302B] hover:border-[#A7C4A0]/40 transition-colors text-[#A29A8B] hover:text-[#A7C4A0] font-semibold px-4 py-2.5 rounded-lg cursor-pointer text-sm"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </header>

      {loading && (
        <div className="flex items-center justify-center py-24 text-[#A29A8B]">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading admin data...
        </div>
      )}

      {!loading && loadError && (
        <div className="glass rounded-xl border border-[#D28C97]/40 p-6 text-sm text-[#D28C97]">
          {loadError}
        </div>
      )}

      {!loading && !loadError && overview && (
        <div className="flex flex-col gap-8">
          {/* Stat cards */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<Users className="w-10 h-10" />} label="Users" value={overview.total_users} />
            <StatCard icon={<BookMarked className="w-10 h-10" />} label="Subjects" value={overview.total_subjects} />
            <StatCard icon={<FileText className="w-10 h-10" />} label="Materials" value={overview.total_materials} />
            <StatCard icon={<MessageSquare className="w-10 h-10" />} label="Chat messages" value={overview.total_chat_messages} />
            <StatCard icon={<GraduationCap className="w-10 h-10" />} label="Mock exams" value={overview.total_mock_exams} />
            <StatCard icon={<Layers className="w-10 h-10" />} label="Flashcards" value={overview.total_flashcards} />
            <StatCard icon={<HelpCircle className="w-10 h-10" />} label="Quizzes" value={overview.total_quizzes} />
            <StatCard icon={<Clock className="w-10 h-10" />} label="Uptime" value={formatUptime(overview.uptime_seconds)} />
          </section>

          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard icon={<Database className="w-10 h-10" />} label="Database size" value={formatBytes(overview.db_size_bytes)} />
            <StatCard icon={<HardDrive className="w-10 h-10" />} label="Uploads size" value={formatBytes(overview.uploads_size_bytes)} />
            <StatCard
              icon={<Database className="w-10 h-10" />}
              label="Vector store"
              value={`${overview.vector_store_doc_count} docs / ${formatBytes(overview.vector_store_size_bytes)}`}
            />
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Health panel */}
            <div className="glass rounded-2xl p-6 border border-[#34302B]">
              <h2 className="font-display text-lg font-semibold text-[#ECE6DA] mb-1">
                <span className="mark-underline">Health check</span>
              </h2>
              <p className="text-xs text-[#A29A8B] mb-4">Is everything configured correctly?</p>
              {health && (
                <div className="flex flex-col">
                  <CheckRow label="Groq API key set" ok={health.checks.groq_api_key_set} />
                  <CheckRow label="Groq fallback key set" ok={health.checks.groq_api_key_2_set} />
                  <CheckRow label="Groq client initialized" ok={health.checks.groq_client_initialized} />
                  <CheckRow label="Database reachable" ok={health.checks.database_reachable} />
                  <CheckRow label="CORS origins configured" ok={health.checks.cors_origins_configured} />
                  <CheckRow label="Admin emails configured" ok={health.checks.admin_emails_configured} />
                  <CheckRow
                    label="Disk space free"
                    ok={!!health.checks.disk_free_bytes}
                    detail={
                      health.checks.disk_free_bytes != null
                        ? `${formatBytes(health.checks.disk_free_bytes)} free`
                        : "unknown"
                    }
                  />
                </div>
              )}
            </div>

            {/* Config panel */}
            <div className="glass rounded-2xl p-6 border border-[#34302B]">
              <h2 className="font-display text-lg font-semibold text-[#ECE6DA] mb-1">
                <span className="mark-underline">Configuration</span>
              </h2>
              <p className="text-xs text-[#A29A8B] mb-4">Current non-secret config.</p>
              {config && (
                <div className="flex flex-col gap-3 text-sm">
                  <div>
                    <span className="text-xs font-bold text-[#A29A8B] uppercase tracking-wider block mb-1">CORS origins</span>
                    <span className="text-[#ECE6DA]">
                      {config.cors_origins.length ? config.cors_origins.join(", ") : "None set"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#A29A8B] uppercase tracking-wider block mb-1">Admin emails</span>
                    <span className="text-[#ECE6DA]">
                      {config.admin_emails.length ? config.admin_emails.join(", ") : "None set"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#A29A8B] uppercase tracking-wider block mb-1">Groq API key</span>
                    <span className="text-[#ECE6DA] tnum">
                      {config.groq_api_key_set ? config.groq_api_key_masked : "Not set"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#A29A8B] uppercase tracking-wider block mb-1">Groq fallback key</span>
                    <span className="text-[#ECE6DA] tnum">
                      {config.groq_api_key_2_set ? config.groq_api_key_2_masked : "Not set"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Groq key update form */}
          <div className="glass rounded-2xl p-6 border border-[#34302B]">
            <h2 className="font-display text-lg font-semibold text-[#ECE6DA] mb-1 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#A7C4A0]" /> Update Groq key(s)
            </h2>
            <p className="text-xs text-[#A29A8B] mb-5 leading-relaxed max-w-2xl">
              Saved keys are written to a file inside the persisted data volume (survives a container restart)
              and applied immediately to the running process — the AI tutor and every AI-generation feature
              start using the new key on their very next request, no restart required.
            </p>
            <form onSubmit={handleSaveKeys} className="flex flex-col gap-4 max-w-xl">
              <div>
                <label className="block text-xs font-bold text-[#A29A8B] uppercase mb-1.5">
                  Primary key {config?.groq_api_key_set && <span className="normal-case font-normal">(current: {config.groq_api_key_masked})</span>}
                </label>
                <div className="relative">
                  <input
                    type={showKey1 ? "text" : "password"}
                    placeholder="gsk_..."
                    value={groqKey1}
                    onChange={(e) => setGroqKey1(e.target.value)}
                    className="w-full bg-[#141312] border border-[#34302B] text-white rounded-lg px-3.5 py-2.5 pr-10 text-sm focus:outline-none focus:border-[#A7C4A0]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey1((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A29A8B] hover:text-[#A7C4A0] cursor-pointer"
                  >
                    {showKey1 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#A29A8B] uppercase mb-1.5">
                  Fallback key {config?.groq_api_key_2_set && <span className="normal-case font-normal">(current: {config.groq_api_key_2_masked})</span>}
                </label>
                <div className="relative">
                  <input
                    type={showKey2 ? "text" : "password"}
                    placeholder="gsk_... (optional)"
                    value={groqKey2}
                    onChange={(e) => setGroqKey2(e.target.value)}
                    className="w-full bg-[#141312] border border-[#34302B] text-white rounded-lg px-3.5 py-2.5 pr-10 text-sm focus:outline-none focus:border-[#A7C4A0]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey2((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A29A8B] hover:text-[#A7C4A0] cursor-pointer"
                  >
                    {showKey2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingKeys || (!groqKey1 && !groqKey2)}
                className="w-fit bg-[#A7C4A0] text-[#141312] font-bold px-5 py-2.5 rounded-lg hover:bg-[#90AE88] transition-all shadow-lg mt-1 disabled:opacity-50 cursor-pointer"
              >
                {savingKeys ? "Saving..." : "Save & apply now"}
              </button>
            </form>
          </div>

          {/* Log viewer */}
          <div className="glass rounded-2xl p-6 border border-[#34302B]">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display text-lg font-semibold text-[#ECE6DA] flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[#A7C4A0]" /> Application logs
              </h2>
              <span className="text-xs text-[#A29A8B] tnum">
                {logLines.length} of {logTotal} lines &middot; refreshes every {LOG_POLL_MS / 1000}s
              </span>
            </div>
            <p className="text-xs text-[#A29A8B] mb-4">
              Every print() diagnostic the app emits, tailed from a log file in the data volume — no Docker
              socket access needed.
            </p>
            <div
              ref={logBoxRef}
              className="bg-[#141312] border border-[#34302B] rounded-lg p-4 h-96 overflow-y-auto font-mono text-xs text-[#ECE6DA] whitespace-pre-wrap leading-relaxed"
            >
              {logLines.length === 0 ? (
                <span className="text-[#A29A8B]">No log output yet.</span>
              ) : (
                logLines.map((line, idx) => (
                  <div key={idx} className="border-b border-[#1D1B19] py-0.5 last:border-0">
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
