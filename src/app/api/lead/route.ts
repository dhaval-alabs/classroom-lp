import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, isSupabaseConfigured } from "@/lib/supabase";
import { captureLead, lsqConfigured } from "@/lib/leadsquared";
import { sendMetaCapiEvent, extractClientContext, isMetaCapiConfigured } from "@/lib/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keep the payload small and predictable; anything else is ignored.
type LeadPayload = {
  full_name?: string;
  phone?: string;
  email?: string;
  course?: string;
  city?: string;
  background?: string;
  message?: string;
  consent?: boolean;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
  page_url?: string;
  referrer?: string;
  // Meta dedup + matching context from the browser (see LeadForm).
  meta?: {
    event_id?: string;
    event_source_url?: string;
    fbp?: string;
    fbc?: string;
  };
};

const clean = (v: unknown, max = 500): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

const splitName = (full: string): { first: string; last: string } => {
  const parts = (full || "").trim().split(/\s+/);
  return { first: parts[0] || "", last: parts.length > 1 ? parts.slice(1).join(" ") : "" };
};

// India mobile: 10 digits, optional +91 / 0 prefix.
const normalizePhone = (raw: string): string | null => {
  const digits = raw.replace(/[^\d]/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
};

export async function POST(req: NextRequest) {
  let body: LeadPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const full_name = clean(body.full_name, 120);
  const phoneRaw = clean(body.phone, 20);
  if (!full_name) {
    return NextResponse.json({ ok: false, error: "Please enter your name." }, { status: 422 });
  }
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (!phone) {
    return NextResponse.json(
      { ok: false, error: "Please enter a valid 10-digit mobile number." },
      { status: 422 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;

  const record = {
    full_name,
    phone,
    email: clean(body.email, 160),
    course: clean(body.course, 120),
    city: clean(body.city, 80),
    background: clean(body.background, 80),
    message: clean(body.message, 1000),
    consent: body.consent === true,
    utm_source: clean(body.utm_source, 120),
    utm_medium: clean(body.utm_medium, 120),
    utm_campaign: clean(body.utm_campaign, 160),
    utm_term: clean(body.utm_term, 160),
    utm_content: clean(body.utm_content, 160),
    gclid: clean(body.gclid, 200),
    fbclid: clean(body.fbclid, 200),
    page_url: clean(body.page_url, 500),
    referrer: clean(body.referrer, 500),
    user_agent: clean(req.headers.get("user-agent"), 400),
    ip,
  };

  // Push to LeadSquared (fire-and-forget) — independent of Supabase so the CRM
  // gets the lead even during local preview / if the DB write hiccups.
  if (lsqConfigured()) {
    captureLead(record).catch((e) => console.error("[lead] LSQ capture failed:", e));
  }

  const supabase = getServiceClient();
  let leadId: string | null = null;
  let stored = false;
  if (supabase && isSupabaseConfigured()) {
    // Dedup by phone: one lead per number. A repeat submit UPDATES the existing
    // lead (merging in any new non-null form/attribution fields) instead of
    // creating a duplicate row. Qualification fields (score/chat/status) are
    // left untouched so re-submits never wipe enrichment.
    const { data: existing } = await supabase
      .from("classroom_leads")
      .select(
        "id,full_name,email,course,city,background,utm_source,utm_medium,utm_campaign,utm_term,utm_content,gclid,fbclid,page_url,referrer",
      )
      .eq("phone", record.phone)
      .maybeSingle();

    if (existing) {
      const merged = {
        full_name: record.full_name || existing.full_name,
        email: record.email ?? existing.email,
        course: record.course ?? existing.course,
        city: record.city ?? existing.city,
        background: record.background ?? existing.background,
        consent: record.consent,
        utm_source: record.utm_source ?? existing.utm_source,
        utm_medium: record.utm_medium ?? existing.utm_medium,
        utm_campaign: record.utm_campaign ?? existing.utm_campaign,
        utm_term: record.utm_term ?? existing.utm_term,
        utm_content: record.utm_content ?? existing.utm_content,
        gclid: record.gclid ?? existing.gclid,
        fbclid: record.fbclid ?? existing.fbclid,
        page_url: record.page_url ?? existing.page_url,
        referrer: record.referrer ?? existing.referrer,
        user_agent: record.user_agent,
        ip: record.ip,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("classroom_leads").update(merged).eq("id", existing.id);
      if (error) {
        console.error("[lead] update failed:", error.message);
        return NextResponse.json(
          { ok: false, error: "Could not submit right now. Please try again or call us." },
          { status: 500 },
        );
      }
      leadId = existing.id;
    } else {
      const { data, error } = await supabase
        .from("classroom_leads")
        .insert(record)
        .select("id")
        .single();
      if (error) {
        console.error("[lead] insert failed:", error.message);
        return NextResponse.json(
          { ok: false, error: "Could not submit right now. Please try again or call us." },
          { status: 500 },
        );
      }
      leadId = data?.id ?? null;
    }
    stored = true;
  } else {
    // Local preview / unconfigured: don't lose the lead, surface it in logs.
    console.warn("[lead] Supabase not configured — lead not persisted:", record);
  }

  // Meta Conversions API (server-side Lead), deduped against the browser pixel
  // via the shared event_id. Hashed PII + fbp/fbc/IP/UA give Meta the strongest
  // signal to optimise the campaign. Best-effort — never fails the lead.
  const meta = body.meta;
  if (meta?.event_id && isMetaCapiConfigured()) {
    const { first, last } = splitName(full_name);
    const { ip: capiIp, userAgent } = extractClientContext(req);
    const capi = await sendMetaCapiEvent({
      eventName: "lead_classroom",
      eventId: meta.event_id,
      eventSourceUrl: meta.event_source_url || record.page_url || undefined,
      userData: {
        email: record.email ?? undefined,
        phone: record.phone,
        firstName: first,
        lastName: last,
        city: record.city ?? undefined,
        country: "in",
        clientIp: capiIp || record.ip || undefined,
        clientUserAgent: userAgent || record.user_agent || undefined,
        fbp: meta.fbp,
        fbc: meta.fbc,
        externalId: leadId ?? undefined,
      },
      customData: {
        content_name: record.course ?? undefined,
        content_category: "classroom_lead",
        lead_city: record.city ?? undefined,
      },
    });
    if (!capi.ok) console.error("[lead] Meta CAPI:", capi.error);
  }

  // id lets the qualification chat attach its transcript + score to this lead.
  return NextResponse.json({ ok: true, stored, id: leadId });
}
