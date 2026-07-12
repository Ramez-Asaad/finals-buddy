"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings, X, Key, Check, Loader2, ExternalLink, Sparkles } from "lucide-react";
import { api, Account } from "../lib/api";
import { toast } from "./Toast";

/**
 * Account settings: free-trial usage + bring-your-own Groq key.
 *
 * Self-contained — renders its own trigger button and modal. Drop <AccountSettings/>
 * into any header. It fetches the account on mount (so the trigger can show trial
 * status) and opens itself when an API call anywhere returns 402 (trial used up),
 * via the `fb:trial-exhausted` window event dispatched in lib/api.
 */
export default function AccountSettings() {
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setAccount(await api.getAccount());
    } catch {
      /* not logged in / offline — leave trigger in its default state */
    }
  }, []);

  useEffect(() => {
    refresh();
    const onExhausted = () => {
      setOpen(true);
      refresh();
    };
    window.addEventListener("fb:trial-exhausted", onExhausted);
    return () => window.removeEventListener("fb:trial-exhausted", onExhausted);
  }, [refresh]);

  const remaining = account
    ? Math.max(0, account.trial_limit - account.trial_used)
    : null;
  const exhausted = account?.on_trial && remaining === 0;

  async function handleSave() {
    const key = keyInput.trim();
    if (!key) return;
    setSaving(true);
    try {
      const updated = await api.saveGroqKey(key);
      setAccount(updated);
      setKeyInput("");
      toast("Groq key saved — you're all set, no usage limits.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save key", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    try {
      setAccount(await api.deleteGroqKey());
      toast("Personal key removed.", "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to remove key", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => {
          setOpen(true);
          refresh();
        }}
        title="Account settings"
        className={`flex items-center gap-2 border rounded-lg px-3 py-2 transition-colors cursor-pointer ${
          exhausted
            ? "border-[#D28C97] text-[#D28C97] hover:bg-[#D28C97]/10"
            : "border-[#34302B] text-[#A29A8B] hover:text-[#ECE6DA]"
        }`}
      >
        <Settings className="w-4 h-4" />
        {account?.on_trial && remaining !== null && (
          <span className="text-xs font-bold uppercase tracking-wider">
            {remaining} free left
          </span>
        )}
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[#1D1B19] border border-[#34302B] rounded-2xl shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="font-display text-2xl font-bold text-[#ECE6DA]">Account</h2>
                {account && (
                  <p className="text-sm text-[#A29A8B] mt-0.5 truncate max-w-[280px]">
                    {account.email}
                  </p>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-[#A29A8B] hover:text-[#ECE6DA] transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!account ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-[#A29A8B]" />
              </div>
            ) : account.has_personal_key ? (
              /* ---- Personal key active ---- */
              <div>
                <div className="flex items-center gap-2 bg-[#A7C4A0]/10 border border-[#A7C4A0]/30 rounded-lg px-4 py-3 mb-4">
                  <Check className="w-4 h-4 text-[#A7C4A0] shrink-0" />
                  <p className="text-sm text-[#ECE6DA]">
                    Your own Groq key is active — <b>unlimited</b> AI usage.
                  </p>
                </div>
                <div className="flex items-center justify-between text-sm mb-5">
                  <span className="text-[#A29A8B]">Key on file</span>
                  <code className="text-[#ECE6DA] font-mono bg-[#141312] px-2 py-1 rounded border border-[#34302B]">
                    {account.key_hint}
                  </code>
                </div>
                <button
                  onClick={handleRemove}
                  disabled={saving}
                  className="w-full text-sm font-semibold text-[#D28C97] border border-[#34302B] hover:border-[#D28C97] rounded-lg py-2.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {saving ? "Removing…" : "Remove key & return to free trial"}
                </button>
              </div>
            ) : (
              /* ---- Free trial ---- */
              <div>
                <div className="mb-5">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="flex items-center gap-1.5 text-[#ECE6DA] font-semibold">
                      <Sparkles className="w-4 h-4 text-[#A7C4A0]" /> Free trial
                    </span>
                    <span className={exhausted ? "text-[#D28C97] font-semibold" : "text-[#A29A8B]"}>
                      {account.trial_used} / {account.trial_limit} used
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#141312] overflow-hidden border border-[#34302B]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (account.trial_used / account.trial_limit) * 100)}%`,
                        background: exhausted ? "#D28C97" : "#A7C4A0",
                      }}
                    />
                  </div>
                  <p className="text-sm text-[#A29A8B] mt-2.5 leading-relaxed">
                    {exhausted
                      ? "You've used all your free AI actions. Add your own Groq API key below to keep going — it's free and takes a minute."
                      : `${remaining} free AI action${remaining === 1 ? "" : "s"} left. Add your own Groq key any time for unlimited usage on your own account.`}
                  </p>
                </div>

                <label className="block text-sm font-semibold text-[#ECE6DA] mb-2">
                  Your Groq API key
                </label>
                <div className="relative mb-2">
                  <Key className="w-4 h-4 text-[#A29A8B] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                    placeholder="gsk_…"
                    className="w-full bg-[#141312] border border-[#34302B] focus:border-[#A7C4A0] outline-none rounded-lg pl-9 pr-3 py-2.5 text-sm text-[#ECE6DA] font-mono transition-colors"
                  />
                </div>
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[#A7C4A0] hover:underline mb-4"
                >
                  Get a free key at console.groq.com/keys <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  onClick={handleSave}
                  disabled={saving || !keyInput.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-[#A7C4A0] text-[#141312] hover:bg-[#90AE88] font-semibold rounded-lg py-2.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {saving ? "Verifying…" : "Save key"}
                </button>
                <p className="text-[11px] text-[#A29A8B] mt-3 leading-relaxed">
                  Your key is encrypted before storage and only used to run AI requests on
                  your behalf. It's never shown in full again or shared.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
