import { getServiceClient } from "@/lib/supabase";
import { ALL_PRESET_ANSWERS } from "@/lib/chatFlow";

export type LeadScore = "hot" | "warm" | "cold" | "junk";

export interface ConversationTurn {
  role: "assistant" | "user";
  content: string;
  /** true when the answer was a quick-reply chip tap (weak intent evidence) */
  tapped?: boolean;
}

/** Form fields passed alongside the chat so scoring can judge identity quality. */
export interface LeadContext {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  course?: string | null;
  city?: string | null;
  background?: string | null;
  message?: string | null;
}

// Calibration: these leads come from paid social ads and counsellor outcomes
// show the majority end up junk or unreachable — so the prompt biases DOWN.
// hot/warm must actually predict a reachable, sales-ready prospect.
const SYSTEM_PROMPT = `You are a strict lead-qualification analyst for AnalytixLabs, India's leading Data Science & AI education provider, screening prospects for an OFFLINE classroom batch.

These leads come from paid social-media ads. Historically most turn out junk or unreachable when counsellors call, so score CONSERVATIVELY: when in doubt, score one tier lower. hot/warm must mean "a counsellor should call this person first".

Return EXACTLY this JSON — no extra text:
{"score":"cold","reason":"One sentence."}

Weigh these signals:
- Identity quality: gibberish or placeholder name (single letters, "test", keyboard mash), fake-looking email, or a suspicious phone pattern (repeated/sequential digits) => junk regardless of answers.
- Effort: answers marked "(tapped preset)" are one-tap responses — weak evidence on their own. A typed, specific answer is strong evidence of real intent.
- Consistency: contradictions (e.g. "Just exploring" or "3–6 months" but then "lock my seat", or a chosen centre that conflicts with the stated city) cap the score at cold.
- Commitment: locking the seat is a single tap — it only counts when the rest of the run-through is consistent with it.

Tiers:
- hot: coherent real identity, start timeline within ~1 month, specific centre chosen, explicitly locked the seat, and at least one sign of genuine engagement (a typed answer or fully consistent specifics).
- warm: real identity and genuine interest with a 1–3 month timeline, or a consistent all-tap run-through that locked the seat.
- cold: 3+ months out, "just exploring", declined or deferred the counsellor call, or low-effort but plausibly real.
- junk: bot-like behaviour, gibberish or fake details, contradictory or irrelevant answers.

score must be one of: hot warm cold junk (lowercase).`;

const VALID: LeadScore[] = ["hot", "warm", "cold", "junk"];

const MAX_SCORE_ATTEMPTS = 3;
const PER_ATTEMPT_TIMEOUT_MS = 15000;

function geminiModel() {
  return process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
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
          // thinkingBudget: 0 — the thinking model's hidden reasoning tokens count
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
  lead?: LeadContext | null,
): Promise<{ score: LeadScore; reason: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  // Mark one-tap answers so the model can separate low-effort run-throughs
  // from typed engagement (a key predictor of reachability). The client sends
  // `tapped` per turn; fall back to preset matching for older payloads (day
  // chips carry dynamic dates that aren't in the static preset set).
  const transcript = conversation
    .map((m) =>
      m.role === "assistant"
        ? `Counsellor: ${m.content}`
        : `Prospect: ${m.content}${(m.tapped ?? ALL_PRESET_ANSWERS.has(m.content.trim())) ? " (tapped preset)" : " (typed)"}`,
    )
    .join("\n");

  const formData = lead
    ? [
        lead.full_name && `Name: ${lead.full_name}`,
        lead.email && `Email: ${lead.email}`,
        lead.phone && `Phone: ${lead.phone}`,
        lead.course && `Course selected: ${lead.course}`,
        lead.city && `City: ${lead.city}`,
        lead.background && `Background: ${lead.background}`,
        lead.message && `Message: ${lead.message}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const prompt = `${SYSTEM_PROMPT}\n\n${formData ? `Registration form data:\n${formData}\n\n` : ""}Conversation:\n${transcript}\n\nReturn only the JSON object.`;

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

