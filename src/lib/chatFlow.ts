// Qualification-chat flow, shared between the client UI (QualificationChat)
// and server-side code (qualify scoring + LSQ sync), so the scorer always knows
// the preset options and the server can validate the structured answers.

/** The high-intent option on the final question — triggers the lock-seat conversion. */
export const LOCK_SEAT_ANSWER = "Yes, lock my seat!";

export const QUESTIONS: string[] = [
  "Quick one — what best describes you right now?",
  "What's your main goal with this program?",
  "When are you looking to start — the next batch, or still exploring?",
  "Which centre works best for you?",
  "Are you looking to switch careers, start fresh, or upgrade your skills?",
  "How likely are you to enrol in a program right now?",
  "When should our counsellor call you? Pick a day —",
  "And what time works best that day?",
  "Last thing — our counsellor will call with upcoming batches and dates. Shall I lock in your seat?",
];

/** Index of the pick-a-day question (options are generated dates, see callDayOptions). */
export const DAY_QUESTION_INDEX = 6;
/** Index of the pick-a-time question. */
export const TIME_QUESTION_INDEX = 7;

/** Call time slots offered (IST). startHourIst feeds LSQ's date field. */
export const CALL_SLOTS = [
  { label: "10 AM – 12 PM", startHourIst: 10 },
  { label: "12 – 3 PM", startHourIst: 12 },
  { label: "3 – 6 PM", startHourIst: 15 },
  { label: "6 – 8 PM", startHourIst: 18 },
] as const;
export const CALL_SLOT_LABELS: readonly string[] = CALL_SLOTS.map((s) => s.label);

export interface CallDayOption {
  label: string; // "Today" | "Tomorrow" | "Wed, 8 Jul"
  iso: string; // "2026-07-08" (IST calendar date)
}

/** IST calendar date (YYYY-MM-DD) for a Date — leads and counsellors are in IST. */
export function istDateIso(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** The next `count` days as quick-reply options (Today, Tomorrow, then dated). */
export function callDayOptions(now: Date, count = 4): CallDayOption[] {
  const out: CallDayOption[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const label =
      i === 0
        ? "Today"
        : i === 1
          ? "Tomorrow"
          : d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });
    out.push({ label, iso: istDateIso(d) });
  }
  return out;
}

// Mirror the form's dropdowns so chat and form answers score on the same rules.
// For the two LSQ-mapped questions (indices 4–5, see QUESTION_FIELD), the option
// text MUST match the LeadSquared dropdown values verbatim. The day question
// (index 6) gets dynamic date options from callDayOptions() in the component.
export const QUESTION_OPTIONS: readonly (readonly string[])[] = [
  ["Student / Final year", "Recent graduate", "Working professional", "Career switch"],
  ["Get my first data job", "Upskill in AI / GenAI", "Switch to a data career", "Just exploring"],
  ["Within 1 month", "1–3 months", "3–6 months", "Still exploring"],
  ["Gurgaon", "Noida", "Bangalore", "Online (Live)"],
  ["Career Change", "Start a career", "Skill Upgradation"],
  ["Ready to enrol now", "Lets discuss over a call", "Still researching", "Not sure"],
  ["Today", "Tomorrow"], // replaced at render time by callDayOptions()
  CALL_SLOT_LABELS,
  [LOCK_SEAT_ANSWER, "I have a question first", "Not right now"],
];

// LSQ Select field each question feeds (null = not synced via crmFields).
// The day/time pair (6–7) flows separately as `preferredCall`, which the server
// validates and converts into mx_Preferred_Date_Time / mx_Preferred_Date_And_Time
// and a derived mx_connect_to_counselling.
export const QUESTION_FIELD: readonly (string | null)[] = [
  null,
  null,
  null,
  null,
  "mx_Are_you_seeking_a_change_in_your_career_or_job",
  "mx_mode_learning",
  null,
  null,
  null,
];

/** Every static preset answer — scoring fallback to spot tap-through leads. */
export const ALL_PRESET_ANSWERS: ReadonlySet<string> = new Set([
  ...QUESTION_OPTIONS.flat(),
]);
