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
export async function captureLead(input: CaptureInput): Promise<void> {
  const c = cfg();
  if (!c) return;

  const { first, last } = splitName(input.full_name);
  const notesField = process.env.LSQ_NOTES_FIELD_NAME || "mx_Extra_Notes";
  const fbclidField = process.env.LSQ_FBCLID_FIELD || "mx_FBCLID";

  let notes = [
    input.course && `Course: ${input.course}`,
    input.city && `City: ${input.city}`,
    input.background && `Profile: ${input.background}`,
    input.message && `Message: ${input.message}`,
    input.gclid && `gclid: ${input.gclid}`,
    input.page_url && `Page: ${input.page_url}`,
    input.consent != null && `Consent: ${input.consent ? "Yes" : "No"}`,
  ]
    .filter(Boolean)
    .join(" | ");
  // mx_Notes can be long once a free-text message is included; keep it bounded.
  if (notes.length > 2000) notes = notes.slice(0, 1990) + "…";

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
  const dedicated: Array<[string | undefined, string | null | undefined]> = [
    [process.env.LSQ_COURSE_FIELD, input.course],
    [process.env.LSQ_CITY_FIELD, input.city],
    [process.env.LSQ_BACKGROUND_FIELD, input.background],
    [process.env.LSQ_PAGE_URL_FIELD, input.page_url],
  ];
  for (const [field, value] of dedicated) {
    if (field && value) attrs.push({ Attribute: field, Value: value });
  }
  if (notes) attrs.push({ Attribute: notesField, Value: notes });

  const safeAttrs = await keepExistingFields(c, attrs);
  try {
    const res = await fetch(
      `https://${c.host}/v2/LeadManagement.svc/Lead.Capture?accessKey=${c.access}&secretKey=${c.secret}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(safeAttrs) },
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
  if (text.length > 3000) text = text.slice(0, 2990) + "…";
  return text;
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
    let prospectId: string | null = null;
    if (opts.phone) {
      const res = await fetch(
        `https://${c.host}/v2/LeadManagement.svc/RetrieveLeadByPhoneNumber?accessKey=${c.access}&secretKey=${c.secret}&phone=${encodeURIComponent(opts.phone)}`,
      );
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data) && data.length > 0) prospectId = data[0].ProspectID ?? null;
    }
    if (!prospectId && opts.email) {
      const res = await fetch(
        `https://${c.host}/v2/LeadManagement.svc/RetrieveLeadByEmailAddress?accessKey=${c.access}&secretKey=${c.secret}&emailaddress=${encodeURIComponent(opts.email)}`,
      );
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data) && data.length > 0) prospectId = data[0].ProspectID ?? null;
    }
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
      },
    );
  } catch (err) {
    console.error("[lsq] tag score failed:", err);
  }
}
