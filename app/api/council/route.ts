import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import type { CouncilTurn } from "@/lib/supabase";

const MEMBER_SYSTEM =
  "You are a council member in The Illuminati — a council of AI minds convened to deliberate on questions with wisdom and depth. Respond thoughtfully and concisely.";

// CouncilHistory is the same shape as CouncilTurn — aliased for route clarity.
type CouncilHistory = CouncilTurn;

// Builds a single summary of the previous round — all four member responses
// plus the chairman's consensus — injected as context before the new question.
function buildPreviousRoundContext(prev: CouncilHistory): string {
  return `[Previous round]
Question: "${prev.userMessage}"

Claude: ${prev.claude}

GPT-4: ${prev.gpt4}

Gemini: ${prev.gemini}

Grok: ${prev.grokResponse}

Chairman's consensus: ${prev.chairman}

---

[New question]`;
}

async function callClaude(message: string, history: CouncilHistory[], anthropic: Anthropic): Promise<string> {
  const prev = history[history.length - 1];
  const userContent = prev ? `${buildPreviousRoundContext(prev)}\n${message}` : message;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: MEMBER_SYSTEM,
    messages: [{ role: "user", content: userContent }],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

async function callGPT4(message: string, history: CouncilHistory[], openai: OpenAI): Promise<string> {
  const prev = history[history.length - 1];
  const userContent = prev ? `${buildPreviousRoundContext(prev)}\n${message}` : message;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    max_tokens: 1024,
    messages: [
      { role: "system", content: MEMBER_SYSTEM },
      { role: "user", content: userContent },
    ],
  });

  return response.choices[0]?.message?.content ?? "";
}

async function callGemini(message: string, history: CouncilHistory[], genai: GoogleGenerativeAI): Promise<string> {
  const prev = history[history.length - 1];
  const userContent = prev ? `${buildPreviousRoundContext(prev)}\n${message}` : message;

  const model = genai.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: MEMBER_SYSTEM,
  });

  const chat = model.startChat({ history: [] });
  const result = await chat.sendMessage(userContent);
  return result.response.text();
}

async function callGrok(message: string, history: CouncilHistory[], grok: OpenAI): Promise<string> {
  const prev = history[history.length - 1];
  const userContent = prev ? `${buildPreviousRoundContext(prev)}\n${message}` : message;

  const response = await grok.chat.completions.create({
    model: "grok-4.3",
    max_tokens: 1024,
    messages: [
      { role: "system", content: MEMBER_SYSTEM },
      { role: "user", content: userContent },
    ],
  });

  return response.choices[0]?.message?.content ?? "";
}

async function callChairman(
  question: string,
  claudeResponse: string,
  gpt4Response: string,
  geminiResponse: string,
  grokResponse: string,
  anthropic: Anthropic
): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: `You are the Chairman — a trusted, experienced synthesizer who has heard from four AI council members and must now deliver a clear, grounded response directly to the user.

Your voice blends three influences:
- **Alfred Pennyworth**: dignified, quietly caring, understated warmth, never dramatic
- **Jay Garrick**: seasoned, straight-talking, avuncular, grounded wisdom without ego
- **Andrew Huberman**: methodical, evidence-aware, direct without being cold, practical

Speak in first person, directly to the user. Soft-spoken but firm. Compassionate but no-nonsense. Like a trusted mentor who has seen a lot and chooses words carefully.

Guidelines:
- Acknowledge plainly where the council agreed and where they diverged — no drama, just clarity
- Use **bold** and *italics* naturally to highlight key points and structure the response
- End with a clear, practical takeaway the user can actually act on
- No grandiosity, no theatrical language, no secret society mysticism
- Just honest, considered synthesis`,
    messages: [
      {
        role: "user",
        content: `The council was asked: "${question}"\n\nCouncil Member Claude said:\n${claudeResponse}\n\nCouncil Member GPT-4 said:\n${gpt4Response}\n\nCouncil Member Gemini said:\n${geminiResponse}\n\nCouncil Member Grok said:\n${grokResponse}\n\nAs Chairman, synthesize the council's perspectives into a unified, authoritative consensus response. Highlight points of agreement, note any meaningful differences, and deliver a clear final judgment.`,
      },
    ],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

export async function POST(request: Request) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const grok = new OpenAI({ apiKey: process.env.GROK_API_KEY, baseURL: "https://api.x.ai/v1" });
  const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  console.log("[Supabase] NEXT_PUBLIC_SUPABASE_URL (first 10):", supabaseUrl?.slice(0, 10) ?? "MISSING");
  console.log("[Supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY (first 10):", supabaseKey?.slice(0, 10) ?? "MISSING");

  const supabase = createClient(
    supabaseUrl ?? "",
    supabaseKey ?? ""
  );

  try {
    const body = await request.json() as { message: string; history: CouncilHistory[]; conversationId?: string };
    const { message, history = [], conversationId } = body;

    if (!message?.trim()) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    const [claudeResponse, gpt4Response, geminiResponse, grokResponse] = await Promise.all([
      callClaude(message, history, anthropic),
      callGPT4(message, history, openai),
      callGemini(message, history, genai),
      callGrok(message, history, grok),
    ]);

    const chairmanResponse = await callChairman(
      message,
      claudeResponse,
      gpt4Response,
      geminiResponse,
      grokResponse,
      anthropic
    );

    // Persist to Supabase ------------------------------------------------
    const newTurn: CouncilTurn = {
      userMessage: message,
      claude: claudeResponse,
      gpt4: gpt4Response,
      gemini: geminiResponse,
      grokResponse,
      chairman: chairmanResponse,
    };

    let savedConversationId = conversationId ?? null;

    console.log("=== SUPABASE SAVE ATTEMPT ===");
    if (!conversationId) {
      console.log("[Supabase] Inserting new conversation, title:", message.slice(0, 60));
      const { data, error } = await supabase
        .from("conversations")
        .insert({ title: message, turns: [newTurn] })
        .select("id")
        .single();
      if (error) {
        console.error("[Supabase] INSERT failed:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        console.error("[Supabase] INSERT full error:", JSON.stringify(error));
      } else {
        console.log("[Supabase] INSERT succeeded, conversationId:", data.id);
        savedConversationId = data.id;
      }
    } else {
      console.log("[Supabase] Updating conversation:", conversationId, "— appending turn", history.length + 1);
      const { error } = await supabase
        .from("conversations")
        .update({ turns: [...history, newTurn] })
        .eq("id", conversationId);
      if (error) {
        console.error("[Supabase] UPDATE failed:", {
          conversationId,
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
      } else {
        console.log("[Supabase] UPDATE succeeded, conversationId:", conversationId);
      }
    }
    // --------------------------------------------------------------------

    return Response.json({
      claude: claudeResponse,
      gpt4: gpt4Response,
      gemini: geminiResponse,
      grokResponse,
      chairman: chairmanResponse,
      conversationId: savedConversationId,
    });
  } catch (err) {
    console.error("Council API error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
