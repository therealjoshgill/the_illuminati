import { createClient } from "@supabase/supabase-js";

export interface CouncilTurn {
  userMessage: string;
  claude: string;
  gpt4: string;
  gemini: string;
  grokResponse: string;
  chairman: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  turns: CouncilTurn[];
}

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
