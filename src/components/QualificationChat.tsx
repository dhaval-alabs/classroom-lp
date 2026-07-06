"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { trackLockSeat } from "@/components/Analytics";
import { newEventId, readFbCookies } from "@/lib/metaClient";
import {
  LOCK_SEAT_ANSWER,
  QUESTIONS,
  QUESTION_OPTIONS,
  QUESTION_FIELD,
  DAY_QUESTION_INDEX,
  TIME_QUESTION_INDEX,
  callDayOptions,
} from "@/lib/chatFlow";

interface Message {
  role: "assistant" | "user";
  content: string;
  /** true when the user picked a quick-reply chip; scoring treats taps as weak evidence */
  tapped?: boolean;
}

interface QualificationChatProps {
  leadId?: string | null;
  name?: string;
}

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
  // Accumulates answers to LSQ-mapped questions → { schemaName: answer }.
  const crmAnswers = useRef<Record<string, string>>({});
  // Preferred counsellor-call day+slot (set only via chips, so the values are structured).
  const callChoice = useRef<{ date?: string; slot?: string }>({});
  // Day chips carry real dates, so they're generated once per mount.
  const dayOptions = useMemo(() => callDayOptions(new Date()), []);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Instant fallbacks when the AI ack isn't back within the deadline — the chat
  // must never feel stuck between questions.
  const CANNED_ACKS = [
    "Got it, thanks!",
    "Noted — that really helps.",
    "Perfect, thanks for sharing.",
    "Great, that helps us match the right counsellor.",
    "Understood!",
    "Thanks — good to know.",
    "Noted!",
    "That's helpful, thank you.",
  ];

  // Ask Gemini for a personalised ack but give it a hard 2.5s budget; past
  // that we show a canned line instead. Slow AI must never block the flow.
  async function fetchAck(question: string, answer: string, qIndex: number): Promise<string> {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 2500);
    try {
      const res = await fetch("/api/chat/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer, questionIndex: qIndex }),
        signal: controller.signal,
      });
      const data = (await res.json()) as { ack?: string };
      return data.ack?.trim() || CANNED_ACKS[qIndex % CANNED_ACKS.length];
    } catch {
      return CANNED_ACKS[qIndex % CANNED_ACKS.length];
    } finally {
      clearTimeout(deadline);
    }
  }

  async function handleSend(directText?: string) {
    const trimmed = (directText ?? input).trim();
    if (!trimmed || isSubmitting || isComplete) return;

    const tapped = directText !== undefined;
    const userMsg: Message = { role: "user", content: trimmed, tapped };
    const updated = [...messages, userMsg];
    setMessages(updated);
    if (!directText) setInput("");
    setIsSubmitting(true);

    // Record this answer if it belongs to an LSQ-mapped question (the server
    // allowlist drops anything that isn't an exact dropdown value, so typed
    // custom answers are simply ignored for the CRM field).
    const answeredIndex = questionIndex - 1;
    const answeredField = QUESTION_FIELD[answeredIndex];
    if (answeredField) crmAnswers.current[answeredField] = trimmed;
    // Day/time chips carry structured values for the counsellor-call fields.
    // Typed answers still land in the transcript, just not the CRM date fields.
    if (tapped && answeredIndex === DAY_QUESTION_INDEX) {
      const day = dayOptions.find((d) => d.label === trimmed);
      if (day) callChoice.current.date = day.iso;
    }
    if (tapped && answeredIndex === TIME_QUESTION_INDEX) callChoice.current.slot = trimmed;

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
      // Deeper-funnel conversion — only when the user actually commits.
      let meta:
        | { event_id: string; event_source_url?: string; fbp?: string; fbc?: string }
        | undefined;
      if (trimmed === LOCK_SEAT_ANSWER) {
        const eventId = newEventId();
        const { fbp, fbc } = readFbCookies();
        trackLockSeat(eventId); // browser custom event; dedups vs server CAPI
        meta = {
          event_id: eventId,
          event_source_url: typeof window !== "undefined" ? window.location.href : undefined,
          fbp,
          fbc,
        };
      }
      const crmFields = Object.entries(crmAnswers.current).map(([Attribute, Value]) => ({ Attribute, Value }));
      const preferredCall =
        callChoice.current.date && callChoice.current.slot
          ? { date: callChoice.current.date, slot: callChoice.current.slot }
          : undefined;
      // Fire-and-forget ON THE CLIENT (the browser keeps the request alive —
      // keepalive even survives a tab close). Scoring + CRM sync take 10–60s
      // server-side; the user must not stare at "···" while that runs.
      fetch("/api/qualify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, conversation, meta, crmFields, preferredCall }),
        keepalive: true,
      }).catch(() => {
        // silent — qualification is non-blocking
      });
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const wa = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "919555219007";

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

      {/* quick-reply options (day question gets real dates) */}
      {!isComplete && !isSubmitting && QUESTION_OPTIONS[questionIndex - 1] && (
        <div className="mb-3 flex flex-wrap gap-2">
          {(questionIndex - 1 === DAY_QUESTION_INDEX
            ? dayOptions.map((d) => d.label)
            : QUESTION_OPTIONS[questionIndex - 1]
          ).map((opt) => (
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
