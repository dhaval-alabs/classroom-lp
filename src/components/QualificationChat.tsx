"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "assistant" | "user";
  content: string;
}

interface QualificationChatProps {
  leadId?: string | null;
  name?: string;
}

const QUESTIONS: string[] = [
  "Quick one — what best describes you right now?",
  "What's your main goal with this program?",
  "When are you looking to start — the next batch, or still exploring?",
  "Which centre works best for you?",
  "Last thing — our counsellor will call with batch dates, fees & EMI options. Shall I lock in your seat?",
];

// Mirror the form's dropdowns so chat and form answers score on the same rules.
const QUESTION_OPTIONS: readonly string[][] = [
  ["Student / Final year", "Recent graduate", "Working professional", "Career switcher"],
  ["Get my first data job", "Upskill in AI / GenAI", "Switch to a data career", "Just exploring"],
  ["Within 1 month", "1–3 months", "3–6 months", "Still exploring"],
  ["Gurgaon", "Noida", "Bangalore", "Online (Live)"],
  ["Yes, lock my seat!", "I have a question first", "Not right now"],
];

export default function QualificationChat({ leadId, name }: QualificationChatProps) {
  const firstName = name ? name.split(" ")[0] : "there";

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `Hi ${firstName}! 👋 Just a few quick questions so we can personalise your counselling. Takes under 2 minutes.`,
    },
    { role: "assistant", content: QUESTIONS[0] },
  ]);
  const [input, setInput] = useState("");
  const [questionIndex, setQuestionIndex] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function fetchAck(question: string, answer: string, qIndex: number): Promise<string> {
    try {
      const res = await fetch("/api/chat/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer, questionIndex: qIndex }),
      });
      const data = (await res.json()) as { ack?: string };
      return data.ack?.trim() ?? "";
    } catch {
      return "";
    }
  }

  async function handleSend(directText?: string) {
    const trimmed = (directText ?? input).trim();
    if (!trimmed || isSubmitting || isComplete) return;

    const userMsg: Message = { role: "user", content: trimmed };
    const updated = [...messages, userMsg];
    setMessages(updated);
    if (!directText) setInput("");
    setIsSubmitting(true);

    // Only Q&A pairs get scored — drop the intro/UI-only messages.
    const conversation = updated.filter((m) => m.role === "user" || QUESTIONS.includes(m.content));

    if (questionIndex < QUESTIONS.length) {
      const ack = await fetchAck(QUESTIONS[questionIndex - 1], trimmed, questionIndex);
      const nextQ = QUESTIONS[questionIndex];
      setMessages((prev) => [
        ...prev,
        ...(ack ? [{ role: "assistant" as const, content: ack }] : []),
        { role: "assistant" as const, content: nextQ },
      ]);
      setQuestionIndex((prev) => prev + 1);
      setIsSubmitting(false);
    } else {
      try {
        await fetch("/api/qualify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId, conversation }),
        });
      } catch {
        // silent — qualification is non-blocking
      } finally {
        setIsComplete(true);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Thank you! 🎉 You're all set — our counsellor will call you shortly with everything personalised to what you've shared.",
          },
        ]);
        setIsSubmitting(false);
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const wa = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;

  return (
    <div>
      <p className="mb-3 text-center text-xs text-muted">
        Help us personalise your counselling session
      </p>

      {/* messages */}
      <div
        ref={containerRef}
        className="mb-4 flex h-72 flex-col gap-3 overflow-y-auto py-1"
      >
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "rounded-2xl rounded-br-sm bg-navy text-white"
                  : "rounded-2xl rounded-bl-sm border border-[#D6ECEB] bg-soft text-navy"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isSubmitting && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm border border-[#D6ECEB] bg-soft px-4 py-2.5 tracking-[4px] text-muted">
              ···
            </div>
          </div>
        )}
      </div>

      {/* quick-reply options */}
      {!isComplete && !isSubmitting && QUESTION_OPTIONS[questionIndex - 1] && (
        <div className="mb-3 flex flex-wrap gap-2">
          {QUESTION_OPTIONS[questionIndex - 1].map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => handleSend(opt)}
              className="rounded-full border-[1.5px] border-brand bg-soft px-3.5 py-1.5 text-[13px] font-medium text-navy transition hover:bg-brand/15"
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {/* input or completion */}
      {!isComplete ? (
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Or type your own answer…"
            rows={2}
            className="flex-1 resize-none rounded-xl border-[1.5px] border-[#D6ECEB] bg-white px-3.5 py-2.5 text-sm text-navy outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand/30"
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!input.trim() || isSubmitting}
            className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-navy transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-[#D6ECEB] bg-soft px-3 py-3 text-center text-[13px] font-semibold text-brand-700">
            Your responses have been saved. We&apos;ll be in touch soon!
          </div>
          {wa && (
            <a
              href={`https://wa.me/${wa}?text=${encodeURIComponent(
                "Hi, I just registered for the AnalytixLabs offline batch. Please share the details.",
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-wa px-6 py-3 text-base font-bold text-white transition hover:brightness-95"
            >
              Chat with us on WhatsApp
            </a>
          )}
        </div>
      )}
    </div>
  );
}
