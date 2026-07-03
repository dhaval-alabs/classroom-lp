// Probe: list all LeadSquared lead fields (SchemaName + DisplayName + DataType)
// so we only send attributes that actually exist in this account.
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
if (!Array.isArray(data)) {
  console.log("Unexpected response:", JSON.stringify(data).slice(0, 500));
  process.exit(1);
}
const want = ["FirstName", "LastName", "Phone", "mx_Extra_Notes", "mx_Remarks", "mx_Page_Url", "SourceTerm", "SourceMedium", "SourceCampaign", "SourceContent", "mx_Lead_Score", "mx_Chat_Transcript", "mx_FBCLID", "EmailAddress", "Source"];
console.log(`Total fields: ${data.length}\n`);
console.log("Fields we care about:");
for (const w of want) {
  const f = data.find((x) => x.SchemaName === w);
  console.log(`  ${w.padEnd(20)} ${f ? "EXISTS  (" + f.DataType + ")" : "MISSING"}`);
}
console.log("\nAll mx_ custom fields:");
for (const f of data.filter((x) => x.SchemaName?.startsWith("mx_"))) {
  console.log(`  ${f.SchemaName.padEnd(28)} "${f.DisplayName}" (${f.DataType})`);
}
