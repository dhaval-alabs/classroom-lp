// Qualification-chat flow, shared between the client UI (QualificationChat)
// and server-side Gemini scoring (qualify.ts), so the scorer always knows the
// exact preset options and can tell one-tap answers from typed ones.

/** The high-intent option on the final question — triggers the lock-seat conversion. */
export const LOCK_SEAT_ANSWER = "Yes, lock my seat!";

export const QUESTIONS: string[] = [
  "Quick one — what best describes you right now?",
  "What's your main goal with this program?",
  "When are you looking to start — the next batch, or still exploring?",
  "Which centre works best for you?",
  "Are you looking to switch careers, start fresh, or upgrade your skills?",
  "How likely are you to enrol in a program right now?",
  "When should our counsellor connect with you?",
  "Last thing — our counsellor will call with upcoming batches and dates. Shall I lock in your seat?",
];

// Mirror the form's dropdowns so chat and form answers score on the same rules.
// For the three LSQ-mapped questions (indices 4–6, see QUESTION_FIELD), the
// option text MUST match the LeadSquared dropdown values verbatim — including
// the "Within 7  days" double space — because it's sent straight to the field.
export const QUESTION_OPTIONS: readonly string[][] = [
  ["Student / Final year", "Recent graduate", "Working professional", "Career switch"],
  ["Get my first data job", "Upskill in AI / GenAI", "Switch to a data career", "Just exploring"],
  ["Within 1 month", "1–3 months", "3–6 months", "Still exploring"],
  ["Gurgaon", "Noida", "Bangalore", "Online (Live)"],
  ["Career Change", "Start a career", "Skill Upgradation"],
  ["Ready to enrol now", "Lets discuss over a call", "Still researching", "Not sure"],
  ["Immediately", "Within 3 days", "Within 7  days", "Within 30 days"],
  [LOCK_SEAT_ANSWER, "I have a question first", "Not right now"],
];

// LSQ Select field each question feeds (null = not synced to a dedicated field).
// Answers to mapped questions are pushed to these fields via /api/qualify, which
// allowlists the exact (field, value) pairs before sending.
export const QUESTION_FIELD: readonly (string | null)[] = [
  null,
  null,
  null,
  null,
  "mx_Are_you_seeking_a_change_in_your_career_or_job",
  "mx_mode_learning",
  "mx_connect_to_counselling",
  null,
];

/** Every preset quick-reply answer — used by scoring to spot tap-through leads. */
export const ALL_PRESET_ANSWERS: ReadonlySet<string> = new Set(QUESTION_OPTIONS.flat());
