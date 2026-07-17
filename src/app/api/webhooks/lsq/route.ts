// src/app/api/webhooks/lsq/route.ts
//
// Path 3A — standalone LSQ Lead-Stage-Change webhook → Meta CAPI.
// Same pattern as the masterclass repo's equivalent endpoint (built and
// live-tested first, per Sumeet's own sequencing). Adapted to this repo's
// conventions: leadsquared.ts's env var names (LSQ_ACCESS/LSQ_SECRET/
// LSQ_HOST, bare host + explicit https:// prefix), lib/meta.ts's
// isMetaCapiConfigured() guard, and this repo's double-quote/runtime-export
// style.
//
// Deliberately NOT shared with the Google Ads Apps Script relay (Jul-9
// trunk/branches note: Google and Meta are intentionally separate campaign
// architectures at AnalytixLabs today).
//
// STATELESS — no ledger, no day-5 delay, no import-cutoff windows. Per the
// Meta primer: Meta optimizes one event per ad set, value lives only on
// Purchase, lead quality is expressed through audiences (Ads Manager,
// Phase M2), not a graded value ladder. Receive stage change → map to one
// of three events → fire CAPI → done.
//
// SCOPING: LSQ's Lead Stage Change webhook is account-wide across ALL
// AnalytixLabs properties (careersuccess/Google, masterclass/Meta,
// classroom-lp/Meta) — not filterable by property at the subscription
// level. This endpoint filters by Source internally (isMetaSourced /
// META_SOURCE_PREFIXES) — the mirror image of the Google Apps Script
// relay's own SKIP_NON_PPC filter. Without it, every Google Ads stage
// change would also fire a Meta CAPI event and get mislabeled 'social'.
//
// PAYLOAD SHAPE + FIELD NAMES — confirmed against a real live call to the
// masterclass sibling endpoint (Jul 17), same LSQ account/webhook mechanism:
//   - Before/After shape is correct.
//   - Field is "EmailAddress", not "Email".
//   - CRITICAL: the webhook payload does NOT include custom fields
//     (mx_FBCLID, City) at all. A separate LSQ lookup is required — see
//     fetchCustomFieldsFromLsq() below. Confirmed on a real lead with a
//     genuinely populated mx_FBCLID that the raw payload still omitted it.

import { NextRequest, NextResponse } from "next/server";
import { sendMetaCapiEvent, isMetaCapiConfigured, type MetaUserData } from "@/lib/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Auth — LSQ does not sign its webhook payloads. Shared secret via query
// param, matching how the masterclass sibling endpoint and the LSQ webhook
// URL convention are already configured.
function isAuthorized(req: NextRequest): boolean {
  const key = req.nextUrl.searchParams.get("key");
  const expected = process.env.LSQ_WEBHOOK_SECRET;
  if (!expected) {
    console.error("LSQ webhook: LSQ_WEBHOOK_SECRET not configured — rejecting all requests.");
    return false;
  }
  return key === expected;
}

// ── source_class stamp (Jul-9 architecture note, decision #2) ──────────────
const SOURCE_CLASS = "social";

// ── LSQ stage → Meta event mapping — same as masterclass, kept in sync
// manually until Phase 1.9 unifies the trunk. SQL stage list reuses the
// Google relay's mapping pending Sabrish's sign-off.
const SQL_STAGES = new Set(["enquiry", "re-enquiry", "hot", "warm", "priority-call"]);
const DISQUALIFIED_STAGES = new Set([
  "disqualified", "junk", "cold", "not interested", "marketing lead",
  "recruitment/hiring candidate", "job role/trainer job role",
  "collaboration/college events", "corporate training", "test",
]);
const ENROLLED_STAGE = "enrolled";

type MetaEventPlan = { eventName: "SalesQualified" | "Disqualified" | "Purchase"; value?: number };

function mapStageToMetaEvent(stage: string): MetaEventPlan | null {
  const s = (stage || "").trim().toLowerCase();
  if (s === ENROLLED_STAGE) {
    return { eventName: "Purchase", value: 1 }; // TODO: real value pending Sumeet's sign-off
  }
  if (DISQUALIFIED_STAGES.has(s)) {
    return { eventName: "Disqualified" }; // suppression-audience seed only — never value-bearing
  }
  if (SQL_STAGES.has(s)) {
    return { eventName: "SalesQualified" };
  }
  return null;
}

// ── Source filter — the inverse of the Google relay's SKIP_NON_PPC check ──
// VERIFY the prefix list against real production Source values before
// relying on it fully — inferred from live relay-log observations, not
// exhaustively confirmed against every classroom-lp source tag in use.
const META_SOURCE_PREFIXES = ["ppc-sm", "meta"];

function isMetaSourced(source: string): boolean {
  const s = (source || "").trim().toLowerCase();
  return META_SOURCE_PREFIXES.some((prefix) => s.startsWith(prefix));
}

interface LsqLeadFields {
  ProspectID?: string;
  ProspectStage?: string;
  Source?: string;
  FirstName?: string;
  LastName?: string;
  EmailAddress?: string;
  Phone?: string;
  ModifiedOn?: string;
}
interface LsqStageChangeBody {
  Before?: LsqLeadFields;
  After?: LsqLeadFields;
}

// ── Fetch custom fields (mx_FBCLID, City) the webhook payload doesn't carry.
// This repo's own leadsquared.ts config convention: bare LSQ_HOST, explicit
// https:// prefix at each call site (matching Lead.Update/RetrieveLeadBy*
// patterns already in this file).
async function fetchCustomFieldsFromLsq(prospectId: string): Promise<{ fbclid?: string; city?: string }> {
  const access = process.env.LSQ_ACCESS;
  const secret = process.env.LSQ_SECRET;
  const host = process.env.LSQ_HOST || "api-in21.leadsquared.com";
  if (!access || !secret || !prospectId) return {};

  try {
    const res = await fetch(
      `https://${host}/v2/LeadManagement.svc/Leads.GetById?accessKey=${access}&secretKey=${secret}&id=${encodeURIComponent(prospectId)}`,
      { method: "GET", signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) {
      console.error("fetchCustomFieldsFromLsq: LSQ API error", res.status, prospectId);
      return {};
    }
    const data = await res.json();
    const record = Array.isArray(data) ? data[0] : data;
    if (!record) return {};
    return {
      fbclid: record.mx_FBCLID || undefined,
      city: record.City || record.mx_City || undefined,
    };
  } catch (err) {
    console.error("fetchCustomFieldsFromLsq failed for", prospectId, err);
    return {};
  }
}

// ── Write source_class back to LSQ (fire-and-forget). This repo's Lead.Update
// convention: leadId as a query param, body is the flat attribute array
// itself (NOT wrapped in a Leads/Parameter object) — matches the existing
// post-chat update call in leadsquared.ts.
async function stampSourceClassOnLsq(prospectId: string): Promise<void> {
  const access = process.env.LSQ_ACCESS;
  const secret = process.env.LSQ_SECRET;
  const host = process.env.LSQ_HOST || "api-in21.leadsquared.com";
  if (!access || !secret || !prospectId) return;

  try {
    await fetch(
      `https://${host}/v2/LeadManagement.svc/Lead.Update?accessKey=${access}&secretKey=${secret}&leadId=${prospectId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ Attribute: "mx_Source_Class", Value: SOURCE_CLASS }]),
        signal: AbortSignal.timeout(8000),
      }
    );
  } catch (err) {
    console.error("stampSourceClassOnLsq failed for", prospectId, err);
  }
}

// Logs the outcome of every request before returning it — a 200 status alone
// doesn't tell you whether an event actually reached Meta or was silently
// skipped for a reason (learned this the hard way on the masterclass sibling
// endpoint's first real test).
function logAndRespond(body: Record<string, unknown>, init?: { status?: number }) {
  console.log("LSQ webhook outcome:", JSON.stringify(body));
  return NextResponse.json(body, init);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isMetaCapiConfigured()) {
    console.error("LSQ webhook: Meta CAPI not configured (missing pixel ID or access token).");
    return logAndRespond({ status: "skipped", reason: "meta_capi_not_configured" }, { status: 500 });
  }

  let body: LsqStageChangeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("LSQ webhook raw payload:", JSON.stringify(body));

  const after = body.After;
  if (!after || !after.ProspectID) {
    console.warn("LSQ webhook: no After.ProspectID in payload — skipping.", body);
    return logAndRespond({ status: "skipped", reason: "no_prospect_id" });
  }

  if (!isMetaSourced(after.Source || "")) {
    return logAndRespond({ status: "skipped", reason: "not_meta_sourced", source: after.Source });
  }

  const plan = mapStageToMetaEvent(after.ProspectStage || "");
  if (!plan) {
    return logAndRespond({ status: "skipped", reason: "stage_not_in_event_set", stage: after.ProspectStage });
  }

  const customFields = await fetchCustomFieldsFromLsq(after.ProspectID);

  const userData: MetaUserData = {
    email: after.EmailAddress,
    phone: after.Phone,
    firstName: after.FirstName,
    lastName: after.LastName,
    city: customFields.city,
    country: "in",
    fbc: customFields.fbclid, // raw, not hashed — sendMetaCapiEvent expects the cookie-format value as-is
  };

  const stageChangedAt = after.ModifiedOn ? Date.parse(after.ModifiedOn) : Date.now();
  const eventId = `${after.ProspectID}_${plan.eventName}_${stageChangedAt}`;

  const result = await sendMetaCapiEvent({
    eventName: plan.eventName,
    eventId,
    eventTime: Math.floor(stageChangedAt / 1000),
    actionSource: "system_generated",
    userData,
    customData: plan.value !== undefined ? { value: plan.value, currency: "INR" } : undefined,
  });

  stampSourceClassOnLsq(after.ProspectID); // fire-and-forget

  if (!result.ok) {
    return logAndRespond(
      { status: "capi_failed", error: result.error, prospectId: after.ProspectID },
      { status: 502 }
    );
  }

  return logAndRespond({
    status: "sent",
    prospectId: after.ProspectID,
    eventName: plan.eventName,
    eventId,
    hadFbclid: !!customFields.fbclid,
  });
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ status: "ok" });
}
