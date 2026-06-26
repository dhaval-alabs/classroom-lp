import { NextRequest, NextResponse } from "next/server";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import { captureLead, lsqConfigured } from "@/lib/leadsquared";

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
};

const clean = (v: unknown, max = 500): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
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

  const supabase = db();
  if (!supabase || !isSupabaseConfigured()) {
    // Local preview / unconfigured: don't lose the lead, surface it in logs.
    console.warn("[lead] Supabase not configured — lead not persisted:", record);
    return NextResponse.json({ ok: true, stored: false, id: null });
  }

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

  // id lets the qualification chat attach its transcript + score to this lead.
  return NextResponse.json({ ok: true, stored: true, id: data?.id ?? null });
}
