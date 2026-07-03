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
 * so we don't depend on custom-field schema names that may not exist.
 */
export async function captureLead(input: CaptureInput): Promise<void> {
  const c = cfg();
  if (!c) return;

  const { first, last } = splitName(input.full_name);
  const notesField = process.env.LSQ_NOTES_FIELD_NAME || "mx_Notes";
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
  if (input.email) attrs.push({ Attribute: "EmailAddress", Value: input.email });
  if (input.utm_medium) attrs.push({ Attribute: "SourceMedium", Value: input.utm_medium });
  if (input.utm_campaign) attrs.push({ Attribute: "SourceCampaign", Value: input.utm_campaign });
  if (input.utm_content) attrs.push({ Attribute: "SourceContent", Value: input.utm_content });
  if (input.utm_term) attrs.push({ Attribute: "SourceTerm", Value: input.utm_term });
  if (input.fbclid) attrs.push({ Attribute: fbclidField, Value: input.fbclid });
  // Landing-page URL: also sent as a dedicated field if LSQ_PAGE_URL_FIELD is set
  // to an existing LSQ field's schema name. It's always in Notes above too, so
  // it's visible even without that field.
  const pageUrlField = process.env.LSQ_PAGE_URL_FIELD;
  if (pageUrlField && input.page_url) attrs.push({ Attribute: pageUrlField, Value: input.page_url });
  if (notes) attrs.push({ Attribute: notesField, Value: notes });

  try {
    const res = await fetch(
      `https://${c.host}/v2/LeadManagement.svc/Lead.Capture?accessKey=${c.access}&secretKey=${c.secret}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(attrs) },
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
    await fetch(
      `https://${c.host}/v2/LeadManagement.svc/Lead.Update?accessKey=${c.access}&secretKey=${c.secret}&leadId=${prospectId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          { Attribute: scoreField, Value: SCORE_LABEL[opts.score] ?? opts.score },
          { Attribute: chatField, Value: buildTranscript(opts.conversation, opts.score, opts.reason) },
        ]),
      },
    );
  } catch (err) {
    console.error("[lsq] tag score failed:", err);
  }
}
