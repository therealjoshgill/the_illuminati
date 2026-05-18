"use client";

import { useState, useRef, useEffect } from "react";

interface CouncilTurn {
  userMessage: string;
  claude: string;
  gpt4: string;
  gemini: string;
  grokResponse: string;
  chairman: string;
}

interface LoadingState {
  claude: boolean;
  gpt4: boolean;
  gemini: boolean;
  grokResponse: boolean;
  chairman: boolean;
}

const MEMBERS = [
  {
    key: "claude" as const,
    name: "Claude",
    subtitle: "Sonnet 4",
    color: "from-orange-500/20 to-orange-600/10",
    border: "border-orange-500/30",
    badge: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    dot: "bg-orange-400",
    glow: "shadow-orange-500/10",
  },
  {
    key: "gpt4" as const,
    name: "GPT-4",
    subtitle: "OpenAI",
    color: "from-emerald-500/20 to-emerald-600/10",
    border: "border-emerald-500/30",
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    dot: "bg-emerald-400",
    glow: "shadow-emerald-500/10",
  },
  {
    key: "gemini" as const,
    name: "Gemini",
    subtitle: "Google",
    color: "from-blue-500/20 to-blue-600/10",
    border: "border-blue-500/30",
    badge: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    dot: "bg-blue-400",
    glow: "shadow-blue-500/10",
  },
  {
    key: "grokResponse" as const,
    name: "Grok",
    subtitle: "xAI",
    color: "from-rose-500/20 to-rose-600/10",
    border: "border-rose-500/30",
    badge: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    dot: "bg-rose-400",
    glow: "shadow-rose-500/10",
  },
];

function PulsingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      <div className="w-2 h-2 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "0ms" }} />
      <div className="w-2 h-2 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "150ms" }} />
      <div className="w-2 h-2 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "300ms" }} />
    </div>
  );
}

interface MemberPanelProps {
  name: string;
  subtitle: string;
  color: string;
  border: string;
  badge: string;
  dot: string;
  glow: string;
  response: string;
  loading: boolean;
}

function MemberPanel({ name, subtitle, color, border, badge, dot, glow, response, loading }: MemberPanelProps) {
  return (
    <div className={`flex flex-col rounded-xl border ${border} bg-gradient-to-b ${color} ${glow} shadow-lg overflow-hidden`}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
        <div className={`w-2 h-2 rounded-full ${dot} ${loading ? "animate-pulse" : ""}`} />
        <span className="text-sm font-semibold text-white">{name}</span>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full border ${badge} font-medium`}>{subtitle}</span>
      </div>
      <div className="flex-1 p-4 text-sm text-zinc-300 leading-relaxed min-h-[120px]">
        {loading ? (
          <PulsingDots />
        ) : response ? (
          <p className="whitespace-pre-wrap">{response}</p>
        ) : (
          <p className="text-zinc-600 italic">Awaiting query...</p>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [history, setHistory] = useState<CouncilTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState<LoadingState>({ claude: false, gpt4: false, gemini: false, grokResponse: false, chairman: false });
  const [current, setCurrent] = useState<Partial<CouncilTurn> & { userMessage?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isAnyLoading = loading.claude || loading.gpt4 || loading.gemini || loading.grokResponse || loading.chairman;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, current]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || isAnyLoading) return;

    setInput("");
    setError(null);
    setCurrent({ userMessage: message });
    setLoading({ claude: true, gpt4: true, gemini: true, grokResponse: true, chairman: true });

    try {
      const res = await fetch("/api/council", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Request failed");
      }

      const data = await res.json() as { claude: string; gpt4: string; gemini: string; grokResponse: string; chairman: string };

      const turn: CouncilTurn = {
        userMessage: message,
        claude: data.claude,
        gpt4: data.gpt4,
        gemini: data.gemini,
        grokResponse: data.grokResponse,
        chairman: data.chairman,
      };

      setHistory((prev) => [...prev, turn]);
      setCurrent({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setCurrent({});
    } finally {
      setLoading({ claude: false, gpt4: false, gemini: false, grokResponse: false, chairman: false });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  const allTurns: (CouncilTurn | { userMessage: string; claude?: string; gpt4?: string; gemini?: string; grokResponse?: string; chairman?: string; partial: true })[] =
    current.userMessage
      ? [...history, { ...current, partial: true } as { userMessage: string; partial: true }]
      : history;

  return (
    <div className="flex flex-col h-screen bg-[#080808] text-white overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#0d0d0d]">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-orange-400 shadow-[0_0_8px_2px_rgba(251,146,60,0.4)]" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.4)]" />
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_8px_2px_rgba(96,165,250,0.4)]" />
            <div className="w-2.5 h-2.5 rounded-full bg-rose-400 shadow-[0_0_8px_2px_rgba(251,113,133,0.4)]" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-white">
            The <span className="text-zinc-400">Illuminati</span>
          </h1>
          <span className="text-xs text-zinc-600 border border-zinc-800 px-2 py-0.5 rounded-full">Council of AI Minds</span>
        </div>
        {history.length > 0 && (
          <button
            onClick={() => { setHistory([]); setCurrent({}); setError(null); }}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Clear session
          </button>
        )}
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {allTurns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-400/60 shadow-[0_0_12px_3px_rgba(251,146,60,0.3)]" />
              <div className="w-3 h-3 rounded-full bg-emerald-400/60 shadow-[0_0_12px_3px_rgba(52,211,153,0.3)]" />
              <div className="w-3 h-3 rounded-full bg-blue-400/60 shadow-[0_0_12px_3px_rgba(96,165,250,0.3)]" />
              <div className="w-3 h-3 rounded-full bg-rose-400/60 shadow-[0_0_12px_3px_rgba(251,113,133,0.3)]" />
            </div>
            <p className="text-zinc-400 text-sm max-w-sm">
              The council awaits your question. All four members will respond simultaneously, then the Chairman will synthesize a unified verdict.
            </p>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto px-4 py-6 space-y-10">
            {allTurns.map((turn, i) => {
              const isPartial = "partial" in turn;
              return (
                <div key={i} className="space-y-4">
                  {/* User message */}
                  <div className="flex justify-end">
                    <div className="max-w-2xl bg-zinc-800/60 border border-zinc-700/50 rounded-2xl px-4 py-3 text-sm text-zinc-100">
                      {turn.userMessage}
                    </div>
                  </div>

                  {/* Council member panels */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    {MEMBERS.map(({ key, ...m }) => (
                      <MemberPanel
                        key={key}
                        {...m}
                        response={turn[key] ?? ""}
                        loading={isPartial && loading[key]}
                      />
                    ))}
                  </div>

                  {/* Chairman consensus */}
                  <div className="rounded-xl border border-violet-500/30 bg-gradient-to-b from-violet-500/10 to-violet-600/5 shadow-lg shadow-violet-500/5 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
                      <div className={`w-2 h-2 rounded-full bg-violet-400 ${isPartial && loading.chairman ? "animate-pulse" : ""}`} />
                      <span className="text-sm font-semibold text-white">Chairman</span>
                      <span className="text-xs text-zinc-500 ml-1">— Consensus Synthesis</span>
                      <span className="ml-auto text-xs px-2 py-0.5 rounded-full border bg-violet-500/20 text-violet-300 border-violet-500/30 font-medium">
                        Claude Sonnet 4
                      </span>
                    </div>
                    <div className="p-5 text-sm text-zinc-200 leading-relaxed min-h-[80px]">
                      {isPartial && loading.chairman ? (
                        <PulsingDots />
                      ) : turn.chairman ? (
                        <p className="whitespace-pre-wrap">{turn.chairman}</p>
                      ) : (
                        <p className="text-zinc-600 italic">Awaiting synthesis...</p>
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

      {/* Error */}
      {error && (
        <div className="flex-shrink-0 mx-4 mb-2">
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-2 rounded-lg">
            {error}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 border-t border-white/5 bg-[#0d0d0d] px-4 py-4">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pose a question to the council…"
            rows={1}
            disabled={isAnyLoading}
            className="flex-1 resize-none bg-zinc-900 border border-zinc-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors max-h-40 overflow-y-auto"
            style={{ lineHeight: "1.5" }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isAnyLoading}
            className="flex-shrink-0 h-[46px] px-5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
        <p className="text-center text-xs text-zinc-700 mt-2">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  );
}
