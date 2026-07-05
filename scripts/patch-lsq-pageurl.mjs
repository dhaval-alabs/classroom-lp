// Surgical backfill: fill LSQ's mx_Page_Url from Supabase page_url for every
// lead where it's blank. Touches ONLY that one field (Lead.Update), so no other
// counsellor-edited data can be clobbered. Idempotent — leads that already have
// mx_Page_Url are skipped.
//
// Why it was blank: production ran a build where the dedicated page-URL field
// was env-gated (LSQ_PAGE_URL_FIELD, unset in Vercel), so captures put the URL
// in notes (truncated by LSQ at 256 chars) but never in mx_Page_Url.
//
// Usage:
//   node scripts/patch-lsq-pageurl.mjs            # DRY RUN — shows what would change
//   node scripts/patch-lsq-pageurl.mjs --commit   # applies the updates

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
const FIELD = "mx_Page_Url";
const q = (extra) =>
  new URLSearchParams({ accessKey: process.env.LSQ_ACCESS, secretKey: process.env.LSQ_SECRET, ...extra }).toString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!SB_URL || !SB_KEY || !process.env.LSQ_ACCESS) {
  console.error("Missing Supabase/LSQ credentials in .env.local");
  process.exit(1);
}

// All leads that have a page_url in Supabase (source of truth).
const sbRes = await fetch(
  `${SB_URL}/rest/v1/classroom_leads?select=full_name,phone,page_url,created_at&page_url=not.is.null&order=created_at.asc`,
  { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Accept-Profile": "classroom_landingpage" } },
);
const leads = await sbRes.json();
if (!sbRes.ok || !Array.isArray(leads)) {
  console.error("Supabase read failed:", JSON.stringify(leads).slice(0, 300));
  process.exit(1);
}
console.log(`Mode: ${COMMIT ? "COMMIT" : "DRY RUN"} — ${leads.length} Supabase leads have page_url\n`);

let filled = 0, already = 0, notFound = 0, failed = 0;
for (const lead of leads) {
  if (!lead.phone) continue;
  const tag = `${lead.phone} (${lead.full_name})`;
  try {
    const res = await fetch(
      `https://${HOST}/v2/LeadManagement.svc/RetrieveLeadByPhoneNumber?${q({ phone: lead.phone })}`,
    );
    const data = await res.json().catch(() => null);
    const rec = res.ok && Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!rec) {
      notFound++;
      console.log(`- ${tag}: not in LSQ, skipped`);
      continue;
    }
    if (rec[FIELD]) {
      already++;
      continue;
    }
    if (!COMMIT) {
      filled++;
      console.log(`~ ${tag}: would set ${FIELD}`);
      continue;
    }
    const doUpdate = (value) =>
      fetch(`https://${HOST}/v2/LeadManagement.svc/Lead.Update?${q({ leadId: rec.ProspectID })}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ Attribute: FIELD, Value: value }]),
      });
    let up = await doUpdate(lead.page_url);
    if (!up.ok) {
      // Some LSQ Text fields cap length and reject long values — retry truncated.
      const body = await up.text().catch(() => "");
      console.warn(`  ${tag}: full URL rejected (${up.status} ${body.slice(0, 120)}); retrying truncated`);
      up = await doUpdate(lead.page_url.slice(0, 200));
    }
    if (up.ok) {
      filled++;
      console.log(`✓ ${tag}: ${FIELD} set`);
    } else {
      failed++;
      console.error(`✗ ${tag}: FAILED ${up.status} ${(await up.text().catch(() => "")).slice(0, 200)}`);
    }
    await sleep(150);
  } catch (e) {
    failed++;
    console.error(`✗ ${tag}: ${e.message}`);
  }
}

console.log(
  `\nDone. ${COMMIT ? "filled" : "would fill"}: ${filled}  already set: ${already}  not in LSQ: ${notFound}  failed: ${failed}`,
);
