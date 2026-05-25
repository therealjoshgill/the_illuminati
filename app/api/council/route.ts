import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import type { CouncilTurn } from "@/lib/supabase";

const MEMBER_SYSTEM =
  "You are a council member in The Illuminati — a council of AI minds convened to deliberate on questions with wisdom and depth. Respond thoughtfully and concisely.";

// CouncilHistory is the same shape as CouncilTurn — aliased for route clarity.
type CouncilHistory = CouncilTurn;

async function callClaude(message: string, history: CouncilHistory[], anthropic: Anthropic): Promise<string> {
  const messages: Anthropic.MessageParam[] = [];
  for (const turn of history) {
    messages.push({ role: "user", content: turn.userMessage });
    messages.push({ role: "assistant", content: turn.claude });
  }
  messages.push({ role: "user", content: message });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: MEMBER_SYSTEM,
    messages,
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

async function callGPT4(message: string, history: CouncilHistory[], openai: OpenAI): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: MEMBER_SYSTEM },
  ];
  for (const turn of history) {
    messages.push({ role: "user", content: turn.userMessage });
    messages.push({ role: "assistant", content: turn.gpt4 });
  }
  messages.push({ role: "user", content: message });

  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    max_tokens: 1024,
    messages,
  });

  return response.choices[0]?.message?.content ?? "";
}

async function callGemini(message: string, history: CouncilHistory[], genai: GoogleGenerativeAI): Promise<string> {
  const model = genai.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: MEMBER_SYSTEM,
  });

  const geminiHistory: { role: string; parts: { text: string }[] }[] = [];
  for (const turn of history) {
    geminiHistory.push({ role: "user", parts: [{ text: turn.userMessage }] });
    geminiHistory.push({ role: "model", parts: [{ text: turn.gemini }] });
  }

  const chat = model.startChat({ history: geminiHistory });
  const result = await chat.sendMessage(message);
  return result.response.text();
}

async function callGrok(message: string, history: CouncilHistory[], grok: OpenAI): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: MEMBER_SYSTEM },
  ];
  for (const turn of history) {
    messages.push({ role: "user", content: turn.userMessage });
    messages.push({ role: "assistant", content: turn.grokResponse });
  }
  messages.push({ role: "user", content: message });

  const response = await grok.chat.completions.create({
    model: "grok-4.3",
    max_tokens: 1024,
    messages,
  });

  return response.choices[0]?.message?.content ?? "";
}

async function callChairman(
  question: string,
  claudeResponse: string,
  gpt4Response: string,
  geminiResponse: string,
  grokResponse: string,
  history: CouncilHistory[],
  anthropic: Anthropic
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [];

  for (const turn of history) {
    messages.push({
      role: "user",
      content: `The council was asked: "${turn.userMessage}"\n\nCouncil Member Claude said:\n${turn.claude}\n\nCouncil Member GPT-4 said:\n${turn.gpt4}\n\nCouncil Member Gemini said:\n${turn.gemini}\n\nCouncil Member Grok said:\n${turn.grokResponse}`,
    });
    messages.push({ role: "assistant", content: turn.chairman });
  }

  messages.push({
    role: "user",
    content: `The council was asked: "${question}"\n\nCouncil Member Claude said:\n${claudeResponse}\n\nCouncil Member GPT-4 said:\n${gpt4Response}\n\nCouncil Member Gemini said:\n${geminiResponse}\n\nCouncil Member Grok said:\n${grokResponse}\n\nAs Chairman, synthesize the council's perspectives into a unified, authoritative consensus response. Highlight points of agreement, note any meaningful differences, and deliver a clear final judgment.`,
  });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: "You are the Chairman of The Illuminati — a supreme council of AI minds. You have heard from four council members and must now synthesize their perspectives into a wise, unified consensus. Be authoritative, balanced, and incisive.",
    messages,
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

export async function POST(request: Request) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const grok = new OpenAI({ apiKey: process.env.GROK_API_KEY, baseURL: "https://api.x.ai/v1" });
  const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
      history,
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
