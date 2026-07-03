// Dump full metadata (incl. dropdown options) for specific LSQ fields.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
const HOST = process.env.LSQ_HOST || "api-in21.leadsquared.com";
const q = new URLSearchParams({ accessKey: process.env.LSQ_ACCESS, secretKey: process.env.LSQ_SECRET }).toString();

const res = await fetch(`https://${HOST}/v2/LeadManagement.svc/LeadsMetaData.Get?${q}`);
const data = await res.json();

const targets = data.filter((f) =>
  /enrol on a Program|Counseling Time|seeking a change|Lead Profile|Course Suggested|Batch Interested/i.test(
    f.DisplayName || "",
  ),
);
for (const f of targets) {
  console.log(`\n${f.DisplayName}  [${f.SchemaName}]  (${f.DataType})`);
  const opts = f.ListItems || f.Options || f.SchemaOptions;
  if (Array.isArray(opts) && opts.length) {
    for (const o of opts) console.log(`   - ${o.Value ?? o.value ?? o.DisplayName ?? JSON.stringify(o)}`);
  } else {
    console.log("   (no inline options in metadata)");
  }
}
