import { NextRequest, NextResponse, after } from "next/server";
import {
  scoreConversation,
  saveConversation,
  updateLeadScore,
  type ConversationTurn,
  type LeadContext,
} from "@/lib/qualify";
import { getServiceClient, isSupabaseConfigured } from "@/lib/supabase";
import { tagLeadScore, updateLeadPostChat, lsqConfigured } from "@/lib/leadsquared";
import { sendMetaCapiEvent, extractClientContext, isMetaCapiConfigured } from "@/lib/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel cancels a serverless invocation the moment the client disconnects
// (tab close / navigation) — which happens almost immediately now that the
// chat shows "Thank you!" without waiting for this request. Gemini scoring +
// LSQ sync (10-60s) are scheduled via after() below, which the platform
// guarantees runs to completion regardless of client connection state.
// maxDuration bounds that guaranteed background work, not the response time.
export const maxDuration = 60;

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
      // Structured chat answers → LSQ Select fields. Allowlisted server-side.
      crmFields?: Array<{ Attribute?: string; Value?: string }>;
      // Chip-picked counsellor-call day + slot; validated server-side.
      preferredCall?: { date?: string; slot?: string };
    };
    const { leadId, conversation } = body;

    if (!conversation || !Array.isArray(conversation) || conversation.length === 0) {
      return NextResponse.json({ error: "conversation is required" }, { status: 400 });
    }

    // Persist the transcript first, AWAITED. An un-awaited promise gets frozen
    // when the serverless response returns, which was silently dropping some
    // transcripts (and the status:"qualified" flip). Never fail the request.
    if (leadId) {
      try {
        await saveConversation(leadId, conversation);
      } catch (e) {
        console.error("[qualify] conversation save failed:", e);
      }
    }

    // One lead fetch, reused by scoring (identity signals), the LSQ post-chat
    // update (verified flag + notes rebuild) and the LSQ score tag below.
    type LeadRow = LeadContext & {
      consent?: boolean | null;
      gclid?: string | null;
      page_url?: string | null;
    };
    let lead: LeadRow | null = null;
    if (leadId && isSupabaseConfigured()) {
      const sb = getServiceClient();
      if (sb) {
        const { data } = await sb
          .from("classroom_leads")
          .select("full_name,phone,email,course,city,background,message,consent,gclid,page_url")
          .eq("id", leadId)
          .single();
        lead = data ?? null;
      }
    }

    // Everything below is best-effort background work (seat-lock CAPI, LSQ
    // sync, Gemini scoring) that can take 10-60s. Scheduled via after() so it
    // runs to completion even though the client isn't waiting for it — a bare
    // un-awaited call here would race the response and could get cancelled by
    // the platform the instant the client disconnects.
    after(async () => {
      // User locked their seat ("Yes, lock my seat!"): flag it for the funnel
      // and fire the deeper Meta conversion. Independent of Gemini scoring.
      if (body.meta?.event_id && leadId) {
        const sb = getServiceClient();
        if (sb && isSupabaseConfigured()) {
          const { error } = await sb
            .from("classroom_leads")
            .update({ seat_locked: true, updated_at: new Date().toISOString() })
            .eq("id", leadId);
          if (error) console.error("[qualify] seat_locked update failed:", error.message);
        }
        if (isMetaCapiConfigured()) await fireLockSeatCapi(req, leadId, body.meta);
      }

      // Reaching this endpoint means the chat completed → the lead is Verified.
      // One consolidated LSQ update: Verified flag + rebuilt notes + preferred
      // counsellor-call day/slot + allowlisted dropdown answers (a crafted
      // request can't set arbitrary fields — client values pass an exact
      // allowlist and the call fields are composed server-side from a
      // validated date+slot).
      if (lead && lsqConfigured()) {
        const clientFields = (Array.isArray(body.crmFields) ? body.crmFields : [])
          .filter((f): f is { Attribute: string; Value: string } => Boolean(f?.Attribute && f?.Value))
          .map((f) => ({ Attribute: f.Attribute, Value: f.Value }));
        try {
          await updateLeadPostChat({
            phone: lead.phone,
            email: lead.email,
            clientFields,
            preferredCall: body.preferredCall,
            lead,
          });
        } catch (e) {
          console.error("[qualify] LSQ post-chat update failed:", e);
        }
      }

      // Score only if Gemini is configured.
      if (!process.env.GEMINI_API_KEY) return;

      let score: string | null = null;
      let reason = "";
      try {
        // Form data gives the scorer identity-quality signals (name/email/phone).
        const result = await scoreConversation(conversation, lead);
        score = result.score;
        reason = result.reason;
        if (leadId) await updateLeadScore(leadId, result.score, result.reason);
      } catch (err) {
        console.error("[qualify] scoring failed:", err);
      }

      // Tag the score + transcript onto the LeadSquared lead.
      if (score && lead && lsqConfigured()) {
        try {
          await tagLeadScore({ phone: lead.phone, email: lead.email, score, reason, conversation });
        } catch (e) {
          console.error("[qualify] LSQ tag failed:", e);
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[qualify] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
