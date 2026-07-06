// LeadSquared CRM sync. All calls are best-effort and never throw — the lead is
// already safe in Supabase; LSQ is a secondary destination. Auth is query-param
// based (accessKey/secretKey), server-side only.

type LsqAttr = { Attribute: string; Value: string };

function cfg() {
  const access = process.env.LSQ_ACCESS;
  const secret = process.env.LSQ_SECRET;
  const host = process.env.LSQ_HOST || "api-in21.leadsquared.com";
  return access && secret ? { access, secret, host } : null;
}

export function lsqConfigured(): boolean {
  return cfg() !== null;
}

const SCORE_LABEL: Record<string, string> = { hot: "Hot", warm: "Warm", cold: "Cold", junk: "Junk" };

const isValidEmail = (e: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/**
 * LeadSquared rejects the ENTIRE payload with a 412 if any attribute's schema
 * name doesn't exist in the account (this is a shared account, so field sets
 * differ). We fetch the account's field list once (cached) and drop unknown
 * attributes before sending, so one stray field can never nuke the whole lead.
 * Core identity fields are always kept as a backstop. Best-effort: if metadata
 * can't be fetched we send everything (original behaviour).
 */
const CORE_FIELDS = new Set(["FirstName", "LastName", "Phone", "EmailAddress", "Source"]);
let fieldCache: { at: number; fields: Set<string> } | null = null;
const FIELD_TTL_MS = 10 * 60 * 1000;

async function validFieldNames(c: { access: string; secret: string; host: string }): Promise<Set<string> | null> {
  if (fieldCache && Date.now() - fieldCache.at < FIELD_TTL_MS) return fieldCache.fields;
  try {
    const res = await fetch(
      `https://${c.host}/v2/LeadManagement.svc/LeadsMetaData.Get?accessKey=${c.access}&secretKey=${c.secret}`,
      { signal: AbortSignal.timeout(5000) },
    );
    const data = await res.json().catch(() => null);
    if (res.ok && Array.isArray(data)) {
      const fields = new Set<string>(
        data.map((f: { SchemaName?: string }) => f.SchemaName).filter((s): s is string => Boolean(s)),
      );
      fieldCache = { at: Date.now(), fields };
      return fields;
    }
  } catch (err) {
    console.error("[lsq] metadata fetch failed:", err);
  }
  return null;
}

async function keepExistingFields(
  c: { access: string; secret: string; host: string },
  attrs: LsqAttr[],
): Promise<LsqAttr[]> {
  const valid = await validFieldNames(c);
  if (!valid) return attrs;
  const kept: LsqAttr[] = [];
  const dropped: string[] = [];
  for (const a of attrs) {
    if (CORE_FIELDS.has(a.Attribute) || valid.has(a.Attribute)) kept.push(a);
    else dropped.push(a.Attribute);
  }
  if (dropped.length) console.warn(`[lsq] dropping unknown fields: ${dropped.join(", ")}`);
  return kept;
}

function splitName(full: string): { first: string; last: string } {
  const parts = (full || "").trim().split(/\s+/);
  const first = parts[0] || "Lead";
  // Many LSQ accounts require LastName; fall back to a placeholder.
  const last = parts.length > 1 ? parts.slice(1).join(" ") : "-";
  return { first, last };
}

export type CaptureInput = {
  full_name: string;
  phone: string;
  email?: string | null;
  course?: string | null;
  city?: string | null;
  background?: string | null;
  message?: string | null;
  consent?: boolean | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  page_url?: string | null;
};

/**
 * Create/update the lead in LeadSquared (Lead.Capture upserts by the account's
 * lead-identity config). Course/city/background/gclid go into the Notes field
 * (LSQ_NOTES_FIELD_NAME, default mx_Extra_Notes) so we don't depend on custom-
 * field schema names that may not exist. Unknown fields are filtered out before
 * sending (see keepExistingFields).
 */
/**
 * The Notes blob shown to counsellors. Status (Verified = completed the
 * qualification chat, Unverified = form only) comes first; LSQ stores
 * mx_Extra_Notes truncated to 256 chars, so short high-value fields go before
 * the long ad URL (which lives in full in mx_Page_Url anyway).
 */
export type LeadNotesInput = {
  course?: string | null;
  city?: string | null;
  background?: string | null;
  consent?: boolean | null;
  message?: string | null;
  gclid?: string | null;
  page_url?: string | null;
};

export function buildLeadNotes(input: LeadNotesInput & { verified: boolean }): string {
  let notes = [
    `Status: ${input.verified ? "Verified" : "Unverified"}`,
    input.course && `Course: ${input.course}`,
    input.city && `City: ${input.city}`,
    input.background && `Profile: ${input.background}`,
    input.consent != null && `Consent: ${input.consent ? "Yes" : "No"}`,
    input.message && `Message: ${input.message}`,
    input.gclid && `gclid: ${input.gclid}`,
    input.page_url && `Page: ${input.page_url}`,
  ]
    .filter(Boolean)
    .join(" | ");
  if (notes.length > 2000) notes = notes.slice(0, 1990) + "…";
  return notes;
}

// Verified/Unverified also goes to a dedicated field. mx_Lead_Verified doesn't
// exist yet — the existence filter drops it harmlessly until an admin creates
// it (Text, or Select with exactly "Verified" and "Unverified"), after which it
// starts flowing automatically. Override the name via LSQ_VERIFIED_FIELD.
const verifiedField = () => process.env.LSQ_VERIFIED_FIELD || "mx_Lead_Verified";

export async function captureLead(input: CaptureInput): Promise<void> {
  const c = cfg();
  if (!c) return;

  const { first, last } = splitName(input.full_name);
  const notesField = process.env.LSQ_NOTES_FIELD_NAME || "mx_Extra_Notes";
  const fbclidField = process.env.LSQ_FBCLID_FIELD || "mx_FBCLID";

  // A fresh form submit is always Unverified — the chat hasn't happened yet.
  // updateLeadPostChat flips it to Verified when the chat completes.
  const notes = buildLeadNotes({ ...input, verified: false });

  const attrs: LsqAttr[] = [
    { Attribute: "FirstName", Value: first },
    { Attribute: "LastName", Value: last },
    { Attribute: "Phone", Value: input.phone },
    { Attribute: "Source", Value: input.utm_source || "Classroom Landing Page" },
  ];
  // Only send a valid email — LSQ rejects the whole payload on a malformed one.
  if (input.email && isValidEmail(input.email)) attrs.push({ Attribute: "EmailAddress", Value: input.email });
  if (input.utm_medium) attrs.push({ Attribute: "SourceMedium", Value: input.utm_medium });
  if (input.utm_campaign) attrs.push({ Attribute: "SourceCampaign", Value: input.utm_campaign });
  if (input.utm_content) attrs.push({ Attribute: "SourceContent", Value: input.utm_content });
  if (input.utm_term) attrs.push({ Attribute: "SourceTerm", Value: input.utm_term });
  if (input.fbclid) attrs.push({ Attribute: fbclidField, Value: input.fbclid });
  // Course / Location / Background / landing-page URL are always folded into the
  // Notes field above. Each is ALSO sent to a dedicated LSQ field when the
  // matching env var points at an existing field's schema name — so they show up
  // as their own filterable columns. Only sent when configured, because sending
  // an attribute whose schema name doesn't exist makes LSQ reject the whole lead.
  // Page URL defaults to mx_Page_Url (verified to exist; the field filter drops
  // it safely on accounts that lack it) so it populates without a Vercel env var.
  // Course/City/Background stay env-gated — their LSQ fields are Select-type and
  // would reject values that aren't preset options.
  const pageUrlField = process.env.LSQ_PAGE_URL_FIELD || "mx_Page_Url";
  const dedicated: Array<[string | undefined, string | null | undefined]> = [
    [process.env.LSQ_COURSE_FIELD, input.course],
    [process.env.LSQ_CITY_FIELD, input.city],
    [process.env.LSQ_BACKGROUND_FIELD, input.background],
    [pageUrlField, input.page_url],
  ];
  // If LSQ_PAGE_URL_FIELD is set to a misnamed field, the existence filter would
  // silently drop it and the URL would vanish — always send mx_Page_Url too.
  if (pageUrlField !== "mx_Page_Url") dedicated.push(["mx_Page_Url", input.page_url]);
  for (const [field, value] of dedicated) {
    if (field && value) attrs.push({ Attribute: field, Value: value });
  }
  attrs.push({ Attribute: verifiedField(), Value: "Unverified" });
  if (notes) attrs.push({ Attribute: notesField, Value: notes });

  const safeAttrs = await keepExistingFields(c, attrs);
  try {
    const res = await fetch(
      `https://${c.host}/v2/LeadManagement.svc/Lead.Capture?accessKey=${c.access}&secretKey=${c.secret}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(safeAttrs),
        // The lead route awaits this — a slow LSQ must not hang form submits.
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) console.error("[lsq] capture failed:", res.status, await res.text().catch(() => ""));
  } catch (err) {
    console.error("[lsq] capture error:", err);
  }
}

function buildTranscript(
  conversation: Array<{ role: string; content: string }>,
  score: string,
  reason: string,
): string {
  const lines = conversation
    .filter((m) => m.content?.trim())
    .map((m) => `${m.role === "assistant" ? "Q" : "A"}: ${m.content.trim()}`);
  const header = `Lead Score: ${SCORE_LABEL[score] ?? score}${reason ? ` — ${reason}` : ""}`;
  let text = `${header}\n\n${lines.join("\n")}`;
  // mx_Chat_Transcript's MaxLength in LSQ is 1000 — truncate ourselves so the
  // cut is predictable (LSQ silently drops anything beyond the field limit).
  if (text.length > 1000) text = text.slice(0, 999) + "…";
  return text;
}

/** Find a lead's ProspectID by phone (then email). Null if not found. */
async function findProspectId(
  c: { access: string; secret: string; host: string },
  opts: { phone?: string | null; email?: string | null },
): Promise<string | null> {
  if (opts.phone) {
    const res = await fetch(
      `https://${c.host}/v2/LeadManagement.svc/RetrieveLeadByPhoneNumber?accessKey=${c.access}&secretKey=${c.secret}&phone=${encodeURIComponent(opts.phone)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    const data = await res.json().catch(() => null);
    if (res.ok && Array.isArray(data) && data.length > 0) return data[0].ProspectID ?? null;
  }
  if (opts.email) {
    const res = await fetch(
      `https://${c.host}/v2/LeadManagement.svc/RetrieveLeadByEmailAddress?accessKey=${c.access}&secretKey=${c.secret}&emailaddress=${encodeURIComponent(opts.email)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    const data = await res.json().catch(() => null);
    if (res.ok && Array.isArray(data) && data.length > 0) return data[0].ProspectID ?? null;
  }
  return null;
}

/**
 * Chat-answer → LSQ Select field allowlist. The qualification chat is behind a
 * PUBLIC endpoint, so we only accept these exact (field, value) pairs — a
 * crafted request can't set arbitrary fields or inject junk. Values MUST match
 * the LSQ dropdown options verbatim (incl. the "Within 7  days" double space).
 */
const ALLOWED_CHAT_FIELDS: Record<string, ReadonlySet<string>> = {
  mx_Are_you_seeking_a_change_in_your_career_or_job: new Set([
    "Career Change",
    "Start a career",
    "Skill Upgradation",
  ]),
  mx_mode_learning: new Set([
    "Ready to enrol now",
    "Will enroll somewhere",
    "Not sure",
    "Still researching",
    "Lets discuss over a call",
  ]),
  mx_connect_to_counselling: new Set([
    "Immediately",
    "Within 3 days",
    "Within 7  days",
    "Within 30 days",
    "DND - Do not call me",
  ]),
};

const SLOT_START_HOUR_IST: Record<string, number> = {
  "10 AM – 12 PM": 10,
  "12 – 3 PM": 12,
  "3 – 6 PM": 15,
  "6 – 8 PM": 18,
};

/**
 * Validate the chip-picked counsellor-call day+slot and turn it into LSQ attrs:
 * a human-readable text field, LSQ's Date field (UTC), and the derived
 * "Preferred Counseling Time" dropdown. Returns [] when the input isn't a
 * clean chip value (typed answers still live in the transcript).
 */
export function buildPreferredCallAttrs(
  preferredCall: { date?: string; slot?: string } | undefined,
  now: Date = new Date(),
): LsqAttr[] {
  if (!preferredCall?.date || !preferredCall.slot) return [];
  const { date, slot } = preferredCall;
  const startHour = SLOT_START_HOUR_IST[slot];
  if (startHour === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];

  const todayIst = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const diffDays = Math.round((Date.parse(date) - Date.parse(todayIst)) / 86400000);
  if (Number.isNaN(diffDays) || diffDays < 0 || diffDays > 14) return [];

  // Slot start in IST → UTC, formatted the way LSQ Date fields store values.
  const startUtc = new Date(`${date}T${String(startHour).padStart(2, "0")}:00:00+05:30`);
  const dayLabel = startUtc.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const connectBucket =
    diffDays <= 0 ? "Immediately" : diffDays <= 3 ? "Within 3 days" : diffDays <= 7 ? "Within 7  days" : "Within 30 days";

  return [
    { Attribute: "mx_Preferred_Date_Time", Value: `${dayLabel} — ${slot} IST` },
    { Attribute: "mx_Preferred_Date_And_Time", Value: startUtc.toISOString().slice(0, 19).replace("T", " ") },
    { Attribute: "mx_connect_to_counselling", Value: connectBucket },
  ];
}

/**
 * One consolidated Lead.Update when the qualification chat completes:
 * - flips the lead to Verified (dedicated field + Status: prefix in Notes)
 * - writes the preferred counsellor-call day/slot fields
 * - writes the allowlisted dropdown answers from the chat
 * Client-supplied fields go through ALLOWED_CHAT_FIELDS; everything else is
 * composed server-side. Best-effort — never throws.
 */
export async function updateLeadPostChat(opts: {
  phone?: string | null;
  email?: string | null;
  clientFields?: LsqAttr[];
  preferredCall?: { date?: string; slot?: string };
  lead: LeadNotesInput;
}): Promise<void> {
  const c = cfg();
  if (!c) return;
  const notesField = process.env.LSQ_NOTES_FIELD_NAME || "mx_Extra_Notes";

  const attrs: LsqAttr[] = [
    ...(opts.clientFields ?? []).filter((f) => ALLOWED_CHAT_FIELDS[f.Attribute]?.has(f.Value)),
    ...buildPreferredCallAttrs(opts.preferredCall),
    { Attribute: verifiedField(), Value: "Verified" },
    { Attribute: notesField, Value: buildLeadNotes({ ...opts.lead, verified: true }) },
  ];

  try {
    const prospectId = await findProspectId(c, opts);
    if (!prospectId) {
      console.warn("[lsq] lead not found — post-chat update skipped");
      return;
    }
    const safe = await keepExistingFields(c, attrs);
    if (!safe.length) return;
    const res = await fetch(
      `https://${c.host}/v2/LeadManagement.svc/Lead.Update?accessKey=${c.access}&secretKey=${c.secret}&leadId=${prospectId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(safe),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) console.error("[lsq] post-chat update failed:", res.status, await res.text().catch(() => ""));
  } catch (err) {
    console.error("[lsq] post-chat update error:", err);
  }
}

/**
 * Find the lead in LSQ (by phone, then email) and tag the Gemini score +
 * full Q&A transcript onto it.
 */
export async function tagLeadScore(opts: {
  phone?: string | null;
  email?: string | null;
  score: string;
  reason: string;
  conversation: Array<{ role: string; content: string }>;
}): Promise<void> {
  const c = cfg();
  if (!c) return;
  const scoreField = process.env.LSQ_LEAD_SCORE_FIELD || "mx_Lead_Score";
  const chatField = process.env.LSQ_CHAT_FIELD || "mx_Chat_Transcript";

  try {
    const prospectId = await findProspectId(c, opts);
    if (!prospectId) {
      console.warn("[lsq] lead not found — score not tagged");
      return;
    }
    const tagAttrs = await keepExistingFields(c, [
      { Attribute: scoreField, Value: SCORE_LABEL[opts.score] ?? opts.score },
      { Attribute: chatField, Value: buildTranscript(opts.conversation, opts.score, opts.reason) },
    ]);
    if (!tagAttrs.length) return;
    await fetch(
      `https://${c.host}/v2/LeadManagement.svc/Lead.Update?accessKey=${c.access}&secretKey=${c.secret}&leadId=${prospectId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tagAttrs),
        signal: AbortSignal.timeout(8000),
      },
    );
  } catch (err) {
    console.error("[lsq] tag score failed:", err);
  }
}
