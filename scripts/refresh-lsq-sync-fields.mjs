// Refresh the two app-owned sync fields (mx_Page_Url, mx_Extra_Notes) on every
// LeadSquared lead from the Supabase source of truth. Reads each field's
// CURRENT MaxLength from LSQ metadata and targets value.slice(0, maxLen), so:
//   - it is idempotent (no-op when stored already matches), and
//   - after an admin raises a field's max chars in LSQ, one re-run upgrades all
//     past leads to the fuller value (Supabase keeps the originals forever).
// Only these two fields are ever written — names/scores/counsellor fields are
// never touched.
//
// Usage:
//   node scripts/refresh-lsq-sync-fields.mjs            # DRY RUN
//   node scripts/refresh-lsq-sync-fields.mjs --commit   # apply

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const COMMIT = process.argv.includes("--commit");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
for (const line of raw.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let v = m[2];
  if (!/^["']/.test(v)) v = v.replace(/\s+#.*$/, "").trim();
  v = v.replace(/^["']|["']$/g, "");
  if (!(m[1] in process.env)) process.env[m[1]] = v;
}

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SECRET_KEY;
const HOST = process.env.LSQ_HOST || "api-in21.leadsquared.com";
const q = (extra) =>
  new URLSearchParams({ accessKey: process.env.LSQ_ACCESS, secretKey: process.env.LSQ_SECRET, ...extra }).toString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!SB_URL || !SB_KEY || !process.env.LSQ_ACCESS) {
  console.error("Missing Supabase/LSQ credentials in .env.local");
  process.exit(1);
}

// Current field limits straight from LSQ — adapts automatically when raised.
const meta = await fetch(`https://${HOST}/v2/LeadManagement.svc/LeadsMetaData.Get?${q({})}`).then((r) => r.json());
const maxLen = (schema, fallback) => {
  const f = Array.isArray(meta) ? meta.find((x) => x.SchemaName === schema) : null;
  const n = f ? parseInt(f.MaxLength, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const URL_MAX = maxLen("mx_Page_Url", 256);
const NOTES_MAX = maxLen("mx_Extra_Notes", 256);
console.log(`Field limits from LSQ metadata: mx_Page_Url=${URL_MAX}, mx_Extra_Notes=${NOTES_MAX}`);

// Same notes shape/order as src/lib/leadsquared.ts (short fields first — they
// must survive the truncation; the long URL goes last).
function buildNotes(l) {
  return [
    l.course && `Course: ${l.course}`,
    l.city && `City: ${l.city}`,
    l.background && `Profile: ${l.background}`,
    l.consent != null && `Consent: ${l.consent ? "Yes" : "No"}`,
    l.message && `Message: ${l.message}`,
    l.gclid && `gclid: ${l.gclid}`,
    l.page_url && `Page: ${l.page_url}`,
  ]
    .filter(Boolean)
    .join(" | ");
}

const sbRes = await fetch(
  `${SB_URL}/rest/v1/classroom_leads?select=full_name,phone,page_url,course,city,background,consent,message,gclid,created_at&phone=not.is.null&order=created_at.asc`,
  { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Accept-Profile": "classroom_landingpage" } },
);
const leads = await sbRes.json();
if (!sbRes.ok || !Array.isArray(leads)) {
  console.error("Supabase read failed:", JSON.stringify(leads).slice(0, 300));
  process.exit(1);
}
console.log(`Mode: ${COMMIT ? "COMMIT" : "DRY RUN"} — ${leads.length} Supabase leads\n`);

const retrieve = async (phone) => {
  // The retrieve index flakes under load — one retry with a pause.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(`https://${HOST}/v2/LeadManagement.svc/RetrieveLeadByPhoneNumber?${q({ phone })}`);
    const data = await res.json().catch(() => null);
    if (res.ok && Array.isArray(data) && data.length > 0) return data[0];
    await sleep(1500);
  }
  return null;
};

let updated = 0, ok = 0, notFound = 0, failed = 0;
const truncatedUrls = [];
for (const lead of leads) {
  const tag = `${lead.phone} (${lead.full_name})`;
  try {
    const rec = await retrieve(lead.phone);
    if (!rec) {
      notFound++;
      console.log(`- ${tag}: not in LSQ, skipped`);
      continue;
    }
    const attrs = [];
    if (lead.page_url) {
      const target = lead.page_url.slice(0, URL_MAX);
      if ((rec.mx_Page_Url || "") !== target) attrs.push({ Attribute: "mx_Page_Url", Value: target });
      if (lead.page_url.length > URL_MAX) truncatedUrls.push(tag);
    }
    const notes = buildNotes(lead);
    if (notes) {
      const target = notes.slice(0, NOTES_MAX);
      if ((rec.mx_Extra_Notes || "") !== target) attrs.push({ Attribute: "mx_Extra_Notes", Value: target });
    }
    if (!attrs.length) {
      ok++;
      continue;
    }
    if (!COMMIT) {
      updated++;
      console.log(`~ ${tag}: would update ${attrs.map((a) => a.Attribute).join(", ")}`);
      continue;
    }
    const up = await fetch(`https://${HOST}/v2/LeadManagement.svc/Lead.Update?${q({ leadId: rec.ProspectID })}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attrs),
    });
    if (up.ok) {
      updated++;
      console.log(`✓ ${tag}: ${attrs.map((a) => a.Attribute).join(", ")}`);
    } else {
      failed++;
      console.error(`✗ ${tag}: ${up.status} ${(await up.text().catch(() => "")).slice(0, 150)}`);
    }
    await sleep(250);
  } catch (e) {
    failed++;
    console.error(`✗ ${tag}: ${e.message}`);
  }
}

console.log(`\nDone. ${COMMIT ? "updated" : "would update"}: ${updated}  already current: ${ok}  not in LSQ: ${notFound}  failed: ${failed}`);
if (truncatedUrls.length) {
  console.log(
    `\n⚠ ${truncatedUrls.length} lead(s) have URLs longer than the mx_Page_Url limit (${URL_MAX} chars) — stored truncated.` +
      `\n  To store them in full: LSQ admin → lead field "PageUrl" (and "Extra Notes") → raise max chars to 1000, then re-run this script with --commit.`,
  );
}
