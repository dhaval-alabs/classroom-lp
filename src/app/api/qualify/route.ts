import { NextRequest, NextResponse } from "next/server";
import { scoreConversation, saveConversation, updateLeadScore, type ConversationTurn } from "@/lib/qualify";
import { getServiceClient, isSupabaseConfigured } from "@/lib/supabase";
import { tagLeadScore, lsqConfigured } from "@/lib/leadsquared";
import { sendMetaCapiEvent, extractClientContext, isMetaCapiConfigured } from "@/lib/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const splitName = (full: string): { first: string; last: string } => {
  const parts = (full || "").trim().split(/\s+/);
  return { first: parts[0] || "", last: parts.length > 1 ? parts.slice(1).join(" ") : "" };
};

/**
 * Fire the "lock_seat_classroom" CAPI conversion when a lead confirms their
 * seat after the qualification chat. Looks up the lead's hashed matching data.
 * Best-effort — never throws.
 */
async function fireLockSeatCapi(
  req: NextRequest,
  leadId: string,
  meta: { event_id?: string; event_source_url?: string; fbp?: string; fbc?: string },
): Promise<void> {
  try {
    let lead: { full_name?: string; phone?: string; email?: string; city?: string } | null = null;
    const supabase = getServiceClient();
    if (supabase && isSupabaseConfigured()) {
      const { data } = await supabase
        .from("classroom_leads")
        .select("full_name,phone,email,city")
        .eq("id", leadId)
        .single();
      lead = data ?? null;
    }
    const { first, last } = splitName(lead?.full_name ?? "");
    const { ip, userAgent } = extractClientContext(req);
    const res = await sendMetaCapiEvent({
      eventName: "lock_seat_classroom",
      eventId: meta.event_id!,
      eventSourceUrl: meta.event_source_url,
      userData: {
        email: lead?.email ?? undefined,
        phone: lead?.phone ?? undefined,
        firstName: first,
        lastName: last,
        city: lead?.city ?? undefined,
        country: "in",
        clientIp: ip,
        clientUserAgent: userAgent,
        fbp: meta.fbp,
        fbc: meta.fbc,
        externalId: leadId,
      },
      customData: { content_category: "classroom_qualified" },
    });
    if (!res.ok) console.error("[qualify] lock-seat CAPI:", res.error);
  } catch (e) {
    console.error("[qualify] lock-seat CAPI error:", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      leadId?: string;
      conversation: ConversationTurn[];
      meta?: { event_id?: string; event_source_url?: string; fbp?: string; fbc?: string };
    };
    const { leadId, conversation } = body;

    if (!conversation || !Array.isArray(conversation) || conversation.length === 0) {
      return NextResponse.json({ error: "conversation is required" }, { status: 400 });
    }

    // Always persist the transcript first — independent of Gemini so chat data
    // is never lost even if scoring fails or no API key is configured.
    if (leadId) {
      saveConversation(leadId, conversation).catch((e) =>
        console.error("[qualify] conversation save failed:", e),
      );
    }

    // Deeper-funnel Meta conversion when the user locks their seat. Independent
    // of Gemini scoring; best-effort — never blocks completion.
    if (body.meta?.event_id && leadId && isMetaCapiConfigured()) {
      await fireLockSeatCapi(req, leadId, body.meta);
    }

    // Score only if Gemini is configured; never block completion.
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ success: true, score: null });
    }

    let score: string | null = null;
    let reason = "";
    try {
      const result = await scoreConversation(conversation);
      score = result.score;
      reason = result.reason;
      if (leadId) await updateLeadScore(leadId, result.score, result.reason);
    } catch (err) {
      console.error("[qualify] scoring failed:", err);
    }

    // Tag the score + transcript onto the LeadSquared lead (fire-and-forget).
    // Look up the lead's phone/email from Supabase so we can match it in LSQ.
    if (score && leadId && lsqConfigured() && isSupabaseConfigured()) {
      const supabase = getServiceClient();
      supabase
        ?.from("classroom_leads")
        .select("phone,email")
        .eq("id", leadId)
        .single()
        .then(({ data }) => {
          if (data) {
            tagLeadScore({ phone: data.phone, email: data.email, score: score!, reason, conversation }).catch(
              (e) => console.error("[qualify] LSQ tag failed:", e),
            );
          }
        });
    }

    return NextResponse.json({ success: true, score, reason });
  } catch (err) {
    console.error("[qualify] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
