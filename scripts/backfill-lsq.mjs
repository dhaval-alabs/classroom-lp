// One-off backfill: push every lead in Supabase (classroom_landingpage schema)
// to LeadSquared. Needed because captureLead used to be fire-and-forget and got
// frozen when the serverless response returned, silently dropping CRM syncs.
//
// Idempotent + duplicate-safe: each lead is looked up by phone first — UPDATED
// if it already exists in LSQ, CREATED only if it doesn't. Scored leads also get
// their Gemini score + Q&A transcript re-tagged.
//
// Usage (from the project root):
//   node scripts/backfill-lsq.mjs            # DRY RUN — connects, counts, prints a sample. No writes.
//   node scripts/backfill-lsq.mjs --commit   # actually pushes to LeadSquared
//
// Reads credentials from .env.local (never commit that file).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const COMMIT = process.argv.includes("--commit");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ── load .env.local ─────────────────────────────────────────── */
function loadEnv() {
  const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2];
    // strip trailing inline comments only when the value isn't quoted
    if (!/^["']/.test(val)) val = val.replace(/\s+#.*$/, "").trim();
    val = val.replace(/^["']|["']$/g, "");
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const LSQ_ACCESS = process.env.LSQ_ACCESS;
const LSQ_SECRET = process.env.LSQ_SECRET;
const LSQ_HOST = process.env.LSQ_HOST || "api-in21.leadsquared.com";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}
if (!LSQ_ACCESS || !LSQ_SECRET) {
  console.error("Missing LSQ_ACCESS / LSQ_SECRET in .env.local — nothing to push to.");
  process.exit(1);
}

const scoreField = process.env.LSQ_LEAD_SCORE_FIELD || "mx_Lead_Score";
const notesField = process.env.LSQ_NOTES_FIELD_NAME || "mx_Extra_Notes";
const fbclidField = process.env.LSQ_FBCLID_FIELD || "mx_FBCLID";
const chatField = process.env.LSQ_CHAT_FIELD || "mx_Chat_Transcript";
const SCORE_LABEL = { hot: "Hot", warm: "Warm", cold: "Cold", junk: "Junk" };
const isValidEmail = (e) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// LSQ rejects the whole payload if any attribute doesn't exist in the account.
// Fetch the field list once and drop unknown attributes before sending.
const CORE_FIELDS = new Set(["FirstName", "LastName", "Phone", "EmailAddress", "Source"]);
let VALID_FIELDS = null;
async function loadValidFields() {
  const res = await fetch(`https://${LSQ_HOST}/v2/LeadManagement.svc/LeadsMetaData.Get?${q({})}`);
  const data = await res.json().catch(() => null);
  if (res.ok && Array.isArray(data)) {
    VALID_FIELDS = new Set(data.map((f) => f.SchemaName).filter(Boolean));
  } else {
    console.warn("Could not load field metadata — sending all attributes unfiltered.");
  }
}
const keepExisting = (attrs) =>
  VALID_FIELDS ? attrs.filter((a) => CORE_FIELDS.has(a.Attribute) || VALID_FIELDS.has(a.Attribute)) : attrs;

/* ── attribute builders (mirror src/lib/leadsquared.ts) ──────── */
function splitName(full) {
  const parts = (full || "").trim().split(/\s+/);
  return { first: parts[0] || "Lead", last: parts.length > 1 ? parts.slice(1).join(" ") : "-" };
}

function buildTranscript(conversation, score, reason) {
  const lines = (conversation || [])
    .filter((m) => m.content?.trim())
    .map((m) => `${m.role === "assistant" ? "Q" : "A"}: ${m.content.trim()}`);
  const header = `Lead Score: ${SCORE_LABEL[score] ?? score}${reason ? ` — ${reason}` : ""}`;
  let text = `${header}\n\n${lines.join("\n")}`;
  if (text.length > 3000) text = text.slice(0, 2990) + "…";
  return text;
}

function buildAttrs(lead) {
  const { first, last } = splitName(lead.full_name);
  let notes = [
    lead.course && `Course: ${lead.course}`,
    lead.city && `City: ${lead.city}`,
    lead.background && `Profile: ${lead.background}`,
    lead.message && `Message: ${lead.message}`,
    lead.gclid && `gclid: ${lead.gclid}`,
    lead.page_url && `Page: ${lead.page_url}`,
    lead.consent != null && `Consent: ${lead.consent ? "Yes" : "No"}`,
  ]
    .filter(Boolean)
    .join(" | ");
  if (notes.length > 2000) notes = notes.slice(0, 1990) + "…";

  const attrs = [
    { Attribute: "FirstName", Value: first },
    { Attribute: "LastName", Value: last },
    { Attribute: "Phone", Value: lead.phone },
    { Attribute: "Source", Value: lead.utm_source || "Classroom Landing Page" },
  ];
  if (isValidEmail(lead.email)) attrs.push({ Attribute: "EmailAddress", Value: lead.email });
  if (lead.utm_medium) attrs.push({ Attribute: "SourceMedium", Value: lead.utm_medium });
  if (lead.utm_campaign) attrs.push({ Attribute: "SourceCampaign", Value: lead.utm_campaign });
  if (lead.utm_content) attrs.push({ Attribute: "SourceContent", Value: lead.utm_content });
  if (lead.utm_term) attrs.push({ Attribute: "SourceTerm", Value: lead.utm_term });
  if (lead.fbclid) attrs.push({ Attribute: fbclidField, Value: lead.fbclid });

  const dedicated = [
    [process.env.LSQ_COURSE_FIELD, lead.course],
    [process.env.LSQ_CITY_FIELD, lead.city],
    [process.env.LSQ_BACKGROUND_FIELD, lead.background],
    [process.env.LSQ_PAGE_URL_FIELD, lead.page_url],
  ];
  for (const [field, value] of dedicated) if (field && value) attrs.push({ Attribute: field, Value: value });

  // Score + transcript (only for qualified leads)
  if (lead.lead_score) {
    attrs.push({ Attribute: scoreField, Value: SCORE_LABEL[lead.lead_score] ?? lead.lead_score });
    if (Array.isArray(lead.chat_conversation) && lead.chat_conversation.length) {
      attrs.push({
        Attribute: chatField,
        Value: buildTranscript(lead.chat_conversation, lead.lead_score, lead.lead_reason || ""),
      });
    }
  }
  if (notes) attrs.push({ Attribute: notesField, Value: notes });
  return attrs;
}

/* ── LSQ calls ───────────────────────────────────────────────── */
const q = (params) => new URLSearchParams({ accessKey: LSQ_ACCESS, secretKey: LSQ_SECRET, ...params }).toString();

async function findByPhone(phone) {
  const res = await fetch(
    `https://${LSQ_HOST}/v2/LeadManagement.svc/RetrieveLeadByPhoneNumber?${q({ phone })}`,
  );
  const data = await res.json().catch(() => null);
  if (res.ok && Array.isArray(data) && data.length > 0) return data[0].ProspectID ?? null;
  return null;
}

async function updateLead(leadId, attrs) {
  const res = await fetch(`https://${LSQ_HOST}/v2/LeadManagement.svc/Lead.Update?${q({ leadId })}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(attrs),
  });
  if (!res.ok) throw new Error(`Update ${res.status}: ${await res.text().catch(() => "")}`);
}

async function captureLead(attrs) {
  const res = await fetch(`https://${LSQ_HOST}/v2/LeadManagement.svc/Lead.Capture?${q({})}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(attrs),
  });
  if (!res.ok) throw new Error(`Capture ${res.status}: ${await res.text().catch(() => "")}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── main ────────────────────────────────────────────────────── */
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: "classroom_landingpage" },
  auth: { persistSession: false },
});

const { data: leads, error } = await supabase
  .from("classroom_leads")
  .select("*")
  .order("created_at", { ascending: true });

if (error) {
  console.error("Supabase read failed:", error.message);
  process.exit(1);
}

await loadValidFields();

const withPhone = leads.filter((l) => l.phone);
const scored = withPhone.filter((l) => l.lead_score);
console.log(`\nMode: ${COMMIT ? "COMMIT (writing to LeadSquared)" : "DRY RUN (no writes)"}`);
console.log(`Leads in Supabase: ${leads.length}  |  with phone: ${withPhone.length}  |  scored: ${scored.length}`);
console.log(`Notes field: ${notesField}  |  field filter: ${VALID_FIELDS ? VALID_FIELDS.size + " valid fields" : "OFF"}`);

if (!COMMIT) {
  const sample = withPhone[0];
  if (sample) {
    console.log(`\nSample payload for lead created ${sample.created_at}:`);
    console.log(JSON.stringify(keepExisting(buildAttrs(sample)), null, 2));
  }
  console.log(`\nDry run only. Re-run with --commit to push all ${withPhone.length} leads.\n`);
  process.exit(0);
}

let created = 0,
  updated = 0,
  failed = 0;
for (let i = 0; i < withPhone.length; i++) {
  const lead = withPhone[i];
  const attrs = keepExisting(buildAttrs(lead));
  const tag = `${i + 1}/${withPhone.length} ${lead.phone}`;
  try {
    const existingId = await findByPhone(lead.phone);
    if (existingId) {
      await updateLead(existingId, attrs);
      updated++;
      console.log(`✓ ${tag} updated (${existingId})`);
    } else {
      await captureLead(attrs);
      created++;
      console.log(`✓ ${tag} created`);
    }
  } catch (e) {
    failed++;
    console.error(`✗ ${tag} FAILED: ${e.message}`);
  }
  await sleep(150); // be gentle on LSQ rate limits
}

console.log(`\nDone. created: ${created}  updated: ${updated}  failed: ${failed}  (total ${withPhone.length})\n`);
