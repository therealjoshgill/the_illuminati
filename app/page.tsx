"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { CouncilTurn, Conversation } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────

interface LoadingState {
  claude: boolean;
  gpt4: boolean;
  gemini: boolean;
  grokResponse: boolean;
  chairman: boolean;
}

const LOADING_OFF: LoadingState = { claude: false, gpt4: false, gemini: false, grokResponse: false, chairman: false };
const LOADING_ON:  LoadingState = { claude: true,  gpt4: true,  gemini: true,  grokResponse: true,  chairman: true  };

const MEMBERS = [
  { key: "claude"       as const, name: "Claude", subtitle: "Sonnet 4" },
  { key: "gpt4"         as const, name: "GPT-4",  subtitle: "OpenAI"   },
  { key: "gemini"       as const, name: "Gemini", subtitle: "Google"   },
  { key: "grokResponse" as const, name: "Grok",   subtitle: "xAI"      },
];

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7)  return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Sub-components ────────────────────────────────────────────────────────

function CosmicEyeLogo() {
  return (
    <svg width="26" height="30" viewBox="0 0 28 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Triangle */}
      <polygon points="14,8 26,28 2,28" stroke="#F8ADE6" strokeWidth="1.2" strokeLinejoin="round" />
      {/* Eye — lens / vesica shape */}
      <path d="M8,20 Q14,14 20,20 Q14,26 8,20 Z" stroke="#F8ADE6" strokeWidth="0.9" />
      {/* Pupil */}
      <circle cx="14" cy="20" r="2" fill="#F8ADE6" />
      {/* Starburst rays from apex */}
      <line x1="14" y1="8" x2="14"   y2="2"   stroke="#F8ADE6" strokeWidth="0.9" strokeLinecap="round" />
      <line x1="14" y1="8" x2="17.5" y2="4"   stroke="#F8ADE6" strokeWidth="0.7" strokeLinecap="round" />
      <line x1="14" y1="8" x2="10.5" y2="4"   stroke="#F8ADE6" strokeWidth="0.7" strokeLinecap="round" />
      <line x1="14" y1="8" x2="20"   y2="6"   stroke="#F8ADE6" strokeWidth="0.5" strokeLinecap="round" opacity="0.5" />
      <line x1="14" y1="8" x2="8"    y2="6"   stroke="#F8ADE6" strokeWidth="0.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

function PulsingDots({ dark = false }: { dark?: boolean }) {
  const cls = dark ? "bg-[#0a0a0f]/40" : "bg-zinc-500";
  return (
    <div className="flex items-center gap-1 py-1">
      <div className={`w-1.5 h-1.5 rounded-full ${cls} animate-bounce`} style={{ animationDelay: "0ms"   }} />
      <div className={`w-1.5 h-1.5 rounded-full ${cls} animate-bounce`} style={{ animationDelay: "150ms" }} />
      <div className={`w-1.5 h-1.5 rounded-full ${cls} animate-bounce`} style={{ animationDelay: "300ms" }} />
    </div>
  );
}

interface MemberPanelProps {
  name: string;
  subtitle: string;
  response: string;
  loading: boolean;
}

function MemberPanel({ name, subtitle, response, loading }: MemberPanelProps) {
  return (
    <div className="flex flex-col rounded-xl border border-white/[0.06] bg-[#1e1e2a] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
        <span className="text-sm text-white font-semibold tracking-wide">{name}</span>
        <span className="ml-auto text-[11px] text-zinc-600 tracking-wider uppercase">{subtitle}</span>
      </div>
      <div className="flex-1 p-4 text-sm text-zinc-300 leading-relaxed min-h-[120px]">
        {loading ? (
          <PulsingDots />
        ) : response ? (
          <p className="whitespace-pre-wrap">{response}</p>
        ) : (
          <p className="text-zinc-700 italic">Awaiting query…</p>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function Home() {
  // Chat state
  const [history,             setHistory]             = useState<CouncilTurn[]>([]);
  const [input,               setInput]               = useState("");
  const [loading,             setLoading]             = useState<LoadingState>(LOADING_OFF);
  const [current,             setCurrent]             = useState<Partial<CouncilTurn> & { userMessage?: string }>({});
  const [error,               setError]               = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // Sidebar state
  const [conversations,  setConversations]  = useState<Conversation[]>([]);
  const [sidebarLoading, setSidebarLoading] = useState(true);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isAnyLoading = Object.values(loading).some(Boolean);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, current]);

  // Load conversations + real-time subscription
  useEffect(() => {
    async function fetchConversations() {
      setSidebarLoading(true);
      const { data } = await supabase
        .from("conversations")
        .select("id, title, created_at, turns")
        .order("created_at", { ascending: false });
      if (data) setConversations(data as Conversation[]);
      setSidebarLoading(false);
    }
    fetchConversations();

    const channel = supabase
      .channel("conversations-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversations" }, (payload) => {
        const incoming = payload.new as Conversation;
        setConversations((prev) => prev.some((c) => c.id === incoming.id) ? prev : [incoming, ...prev]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" }, (payload) => {
        const updated = payload.new as Conversation;
        setConversations((prev) => prev.map((c) => c.id === updated.id ? updated : c));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleNewChat = useCallback(() => {
    setHistory([]);
    setCurrent({});
    setError(null);
    setActiveConversationId(null);
    setInput("");
    inputRef.current?.focus();
  }, []);

  const loadConversation = useCallback((conv: Conversation) => {
    setHistory(conv.turns);
    setActiveConversationId(conv.id);
    setCurrent({});
    setError(null);
    setInput("");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || isAnyLoading) return;

    setInput("");
    setError(null);
    setCurrent({ userMessage: message });
    setLoading(LOADING_ON);

    try {
      const res = await fetch("/api/council", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history, conversationId: activeConversationId }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Request failed");
      }

      const data = await res.json() as {
        claude: string; gpt4: string; gemini: string;
        grokResponse: string; chairman: string; conversationId: string;
      };

      const turn: CouncilTurn = {
        userMessage: message,
        claude:      data.claude,
        gpt4:        data.gpt4,
        gemini:      data.gemini,
        grokResponse: data.grokResponse,
        chairman:    data.chairman,
      };

      setHistory((prev) => [...prev, turn]);
      setActiveConversationId(data.conversationId);
      setCurrent({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setCurrent({});
    } finally {
      setLoading(LOADING_OFF);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  type PartialTurn = { userMessage: string; claude?: string; gpt4?: string; gemini?: string; grokResponse?: string; chairman?: string; partial: true };
  const allTurns: (CouncilTurn | PartialTurn)[] = current.userMessage
    ? [...history, { ...current, partial: true } as PartialTurn]
    : history;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#0a0a0f", color: "#fff" }}>

      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <aside
        className="flex-shrink-0 w-64 flex flex-col border-r border-white/[0.06] overflow-hidden"
        style={{ background: "#111118" }}
      >
        {/* Logo + wordmark */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/[0.06]">
          <CosmicEyeLogo />
          <div className="leading-none">
            <span className="text-[11px] text-white font-medium tracking-wider lowercase">the</span>
            <span className="text-[13px] font-bold tracking-widest" style={{ color: "#F8ADE6" }}>ILLUMINATI</span>
          </div>
        </div>

        {/* New Chat */}
        <div className="px-3 pt-3 pb-2">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.08] text-sm text-zinc-400 hover:text-white hover:border-white/20 hover:bg-white/[0.04] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Chat
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          {sidebarLoading ? (
            <div className="flex flex-col gap-2 px-3 pt-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-9 rounded-lg bg-white/[0.04] animate-pulse" style={{ opacity: 1 - i * 0.2 }} />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-3 pt-5 text-xs text-zinc-700 italic">No conversations yet</p>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors group ${
                  activeConversationId === conv.id
                    ? "bg-white/[0.07] text-white"
                    : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                }`}
              >
                <div className="text-xs font-medium truncate leading-snug">
                  {conv.title.length > 42 ? conv.title.slice(0, 42) + "…" : conv.title}
                </div>
                <div className="text-[10px] text-zinc-700 mt-0.5 group-hover:text-zinc-600">
                  {formatDate(conv.created_at)}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Cosmic scrollable area */}
        <div className="flex-1 overflow-y-auto cosmic-bg">
          {allTurns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-4">
              <CosmicEyeLogo />
              <div>
                <p className="text-sm text-zinc-400 max-w-xs leading-relaxed">
                  The council awaits your question. All four members will respond simultaneously, then the Chairman will synthesize a unified verdict.
                </p>
              </div>
            </div>
          ) : (
            <div className="max-w-7xl mx-auto px-5 py-8 space-y-10">
              {allTurns.map((turn, i) => {
                const isPartial = "partial" in turn;
                return (
                  <div key={i} className="space-y-4">
                    {/* User message */}
                    <div className="flex justify-end">
                      <div
                        className="max-w-2xl rounded-2xl px-4 py-3 text-sm border border-white/[0.08]"
                        style={{ background: "#1e1e2a", color: "#e4e4f0" }}
                      >
                        {turn.userMessage}
                      </div>
                    </div>

                    {/* Council member panels */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                      {MEMBERS.map(({ key, name, subtitle }) => (
                        <MemberPanel
                          key={key}
                          name={name}
                          subtitle={subtitle}
                          response={turn[key] ?? ""}
                          loading={isPartial && loading[key]}
                        />
                      ))}
                    </div>

                    {/* Chairman consensus */}
                    <div
                      className="rounded-xl overflow-hidden"
                      style={{
                        background: "#F8ADE6",
                        boxShadow: "0 0 48px rgba(248, 173, 230, 0.18), 0 0 12px rgba(248, 173, 230, 0.08)",
                      }}
                    >
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-black/10">
                        <div
                          className={`w-1.5 h-1.5 rounded-full bg-[#0a0a0f]/50 ${isPartial && loading.chairman ? "animate-pulse" : ""}`}
                        />
                        <span className="text-sm font-semibold tracking-wide" style={{ color: "#0a0a0f" }}>
                          Chairman
                        </span>
                        <span className="text-xs ml-1" style={{ color: "#0a0a0f", opacity: 0.5 }}>
                          — Consensus Synthesis
                        </span>
                        <span className="ml-auto text-[11px] tracking-wider uppercase" style={{ color: "#0a0a0f", opacity: 0.4 }}>
                          Claude Sonnet 4
                        </span>
                      </div>
                      <div className="p-5 text-sm leading-relaxed min-h-[80px]" style={{ color: "#0a0a0f" }}>
                        {isPartial && loading.chairman ? (
                          <PulsingDots dark />
                        ) : turn.chairman ? (
                          <p className="whitespace-pre-wrap">{turn.chairman}</p>
                        ) : (
                          <p style={{ opacity: 0.4 }} className="italic">Awaiting synthesis…</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex-shrink-0 mx-4 mb-2">
            <div className="border text-sm px-4 py-2 rounded-lg border-red-500/30 bg-red-500/10 text-red-400">
              {error}
            </div>
          </div>
        )}

        {/* Input bar */}
        <div
          className="flex-shrink-0 border-t border-white/[0.06] px-4 py-4"
          style={{ background: "#111118" }}
        >
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex gap-3 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pose a question to the council…"
              rows={1}
              disabled={isAnyLoading}
              className="flex-1 resize-none rounded-xl px-4 py-3 text-sm border border-white/[0.08] placeholder-zinc-700 focus:outline-none focus:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors max-h-40 overflow-y-auto"
              style={{ background: "#1e1e2a", color: "#fff", lineHeight: "1.5" }}
            />
            <button
              type="submit"
              disabled={!input.trim() || isAnyLoading}
              className="flex-shrink-0 h-[46px] px-5 rounded-xl text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              style={{ background: "#F8ADE6", color: "#0a0a0f" }}
            >
              {isAnyLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
                  </svg>
                  Convening
                </span>
              ) : (
                "Convene"
              )}
            </button>
          </form>
          <p className="text-center text-[11px] text-zinc-700 mt-2 tracking-wide">
            Enter to send · Shift+Enter for newline
          </p>
        </div>

      </div>
    </div>
  );
}
