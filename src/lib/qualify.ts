import { getServiceClient } from "@/lib/supabase";

export type LeadScore = "hot" | "warm" | "cold" | "junk";

export interface ConversationTurn {
  role: "assistant" | "user";
  content: string;
}

const SYSTEM_PROMPT = `You are a lead qualification assistant for AnalytixLabs, India's leading Data Science & AI education provider, screening prospects for an OFFLINE classroom batch.

Assess the prospect's purchase intent from their chat answers and return EXACTLY this JSON — no extra text:
{"score":"hot","reason":"One sentence."}

Tiers:
- hot: clear goal, wants to start within 1-3 months, high intent, ready to join a batch
- warm: interested but 3-6 months out, comparing options, or moderate fit
- cold: low urgency, 6+ months, early research, significant barriers
- junk: bot, gibberish, fake details, zero intent, irrelevant answers

score must be one of: hot warm cold junk (lowercase).`;

const VALID: LeadScore[] = ["hot", "warm", "cold", "junk"];

const MAX_SCORE_ATTEMPTS = 3;
const PER_ATTEMPT_TIMEOUT_MS = 15000;

function geminiModel() {
  return process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
}

/** Transient failures worth retrying. 4xx (bad key, disabled API) are NOT retried. */
function isRetryableScoreError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return true;
  if (err.name === "TypeError") return true;
  const status = (err as { status?: number }).status;
  if (typeof status === "number") return status === 429 || status >= 500;
  return /No JSON in Gemini response|Invalid score from Gemini/.test(err.message);
}

async function scoreConversationOnce(
  apiKey: string,
  prompt: string,
): Promise<{ score: LeadScore; reason: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PER_ATTEMPT_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          // thinkingBudget: 0 — gemini-2.5-flash's hidden reasoning tokens count
          // against maxOutputTokens; on long transcripts that can return an empty
          // response. Disabling thinking keeps the JSON answer intact.
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 1024,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      const e = new Error(`Gemini error ${res.status}: ${err}`);
      (e as { status?: number }).status = res.status;
      throw e;
    }

    const data = await res.json();
    const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();

    // Fast path: regex extraction works even on truncated JSON.
    const scoreMatch = raw.match(/"score"\s*:\s*"(hot|warm|cold|junk)"/i);
    const reasonMatch = raw.match(/"reason"\s*:\s*"([^"]{1,300})"/i);
    if (scoreMatch) {
      return { score: scoreMatch[1].toLowerCase() as LeadScore, reason: reasonMatch?.[1] ?? "" };
    }

    // Slow path: full JSON parse.
    const stripped = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error(`No JSON in Gemini response: ${raw.slice(0, 300)}`);
    const parsed = JSON.parse(stripped.slice(start, end + 1)) as { score: string; reason: string };
    const score = parsed.score?.toLowerCase() as LeadScore;
    if (!VALID.includes(score)) throw new Error(`Invalid score from Gemini: ${parsed.score}`);
    return { score, reason: parsed.reason ?? "" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function scoreConversation(
  conversation: ConversationTurn[],
): Promise<{ score: LeadScore; reason: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const transcript = conversation
    .map((m) => `${m.role === "assistant" ? "Counsellor" : "Prospect"}: ${m.content}`)
    .join("\n");
  const prompt = `${SYSTEM_PROMPT}\n\nConversation:\n${transcript}\n\nReturn only the JSON object.`;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_SCORE_ATTEMPTS; attempt++) {
    try {
      return await scoreConversationOnce(apiKey, prompt);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!isRetryableScoreError(err) || attempt === MAX_SCORE_ATTEMPTS) {
        console.error(`[qualify] scoreConversation failed on attempt ${attempt}/${MAX_SCORE_ATTEMPTS}: ${msg}`);
        break;
      }
      const backoffMs = 500 * 2 ** (attempt - 1);
      console.warn(`[qualify] attempt ${attempt} failed (${msg}); retrying in ${backoffMs}ms`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastErr;
}

/* ── DB persistence (Supabase) ─────────────────────────────── */

export async function saveConversation(
  id: string,
  conversation: ConversationTurn[],
): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;
  const { error } = await supabase
    .from("classroom_leads")
    .update({ chat_conversation: conversation, status: "qualified" })
    .eq("id", id);
  if (error) throw error;
}

export async function updateLeadScore(id: string, score: LeadScore, reason: string): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;
  const { error } = await supabase
    .from("classroom_leads")
    .update({ lead_score: score, lead_reason: reason, qualified_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Score a lead and persist the result. Never throws — logs errors instead.
 * Conversation is saved immediately so chat data is never lost even if Gemini fails.
 */
export async function scoreAndSave(params: {
  leadId: string;
  conversation: ConversationTurn[];
}): Promise<void> {
  const { leadId, conversation } = params;
  saveConversation(leadId, conversation).catch((e) =>
    console.error("[qualify] conversation save failed:", e),
  );
  try {
    const { score, reason } = await scoreConversation(conversation);
    await updateLeadScore(leadId, score, reason);
    console.log(`[qualify] ${leadId} = ${score}`);
  } catch (err) {
    console.error(`[qualify] scoring failed for ${leadId}:`, err);
  }
}
