"use client";

import { useEffect, useState } from "react";
import { Check, AlertCircle, Info, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

// Tiny pub/sub so any module can call toast() without a context provider
let listeners: ((t: ToastItem) => void)[] = [];
let nextId = 1;

export function toast(message: string, kind: ToastKind = "info") {
  const item = { id: nextId++, message, kind };
  listeners.forEach((l) => l(item));
}

const edge: Record<ToastKind, string> = {
  success: "#A7C4A0",
  error: "#D28C97",
  info: "#CBDDC4",
};

const icon = {
  success: Check,
  error: AlertCircle,
  info: Info,
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (t: ToastItem) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== t.id));
      }, 3800);
    };
    listeners.push(onToast);
    return () => {
      listeners = listeners.filter((l) => l !== onToast);
    };
  }, []);

  const dismiss = (id: number) => setItems((prev) => prev.filter((x) => x.id !== id));

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2.5 max-w-[calc(100vw-2.5rem)] w-[360px]">
      {items.map((t) => {
        const Icon = icon[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className="animate-toast-in bg-[#1D1B19] border border-[#34302B] rounded-lg shadow-2xl px-4 py-3 flex items-start gap-3"
            style={{ borderLeft: `3px solid ${edge[t.kind]}` }}
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: edge[t.kind] }} />
            <p className="text-sm text-[#ECE6DA] leading-snug flex-1">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="text-[#A29A8B] hover:text-[#ECE6DA] transition-colors shrink-0 cursor-pointer"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
