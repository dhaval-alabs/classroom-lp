import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          // Without thinkingBudget:0 the thinking model's hidden reasoning eats
          // the tiny 60-token budget and the ack comes back empty.
          generationConfig: { temperature: 0.7, maxOutputTokens: 60, thinkingConfig: { thinkingBudget: 0 } },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text().catch(() => "")}`);
    const data = await res.json();
    return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { question, answer, questionIndex } = (await req.json()) as {
      question: string;
      answer: string;
      questionIndex: number;
    };
    if (!question || !answer) return NextResponse.json({ ack: "" });

    const prompt = `You are Aria, a warm admissions counsellor for AnalytixLabs (India's top Data Science institute), helping someone register for an offline classroom batch.

A prospect just answered a screening question. Write ONE short, natural acknowledgment (max 15 words). Be human, warm, varied. No filler phrases — use specific language based on their answer.

Question ${questionIndex}: "${question}"
Their answer: "${answer}"

Rules:
- Max 15 words
- No emojis
- Sound like a real person, not a bot
- Reference something specific from their answer if possible
- Do NOT ask another question
- Do NOT say "Great", "Awesome", "Perfect", "Sure", "Absolutely"

Write only the acknowledgment, nothing else.`;

    return NextResponse.json({ ack: await callGemini(prompt) });
  } catch (err) {
    // Non-blocking — the chat still works without the ack.
    console.error("[chat/ack] error:", err);
    return NextResponse.json({ ack: "" });
  }
}
