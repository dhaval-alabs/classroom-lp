import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminauth";
import { getServiceClient, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCORES = ["hot", "warm", "cold", "junk"];

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase || !isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, configured: false, leads: [] });
  }

  const url = new URL(req.url);
  const score = url.searchParams.get("score");
  // Strip characters that would break the PostgREST or-filter, then cap length.
  const q = (url.searchParams.get("q") || "").replace(/[%,()*\\]/g, "").trim().slice(0, 80);

  let query = supabase
    .from("classroom_leads")
    .select(
      "id,created_at,full_name,phone,email,course,city,background,status,lead_score,lead_reason,qualified_at,chat_conversation,utm_source,utm_campaign,gclid,fbclid",
    )
    .order("created_at", { ascending: false })
    .limit(2000);

  if (score && SCORES.includes(score)) query = query.eq("lead_score", score);
  else if (score === "unscored") query = query.is("lead_score", null);
  if (q) query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) {
    console.error("[admin/leads]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, configured: true, leads: data ?? [] });
}
