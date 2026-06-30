import { NextRequest, NextResponse } from "next/server";
import { scoreConversation, saveConversation, updateLeadScore, type ConversationTurn } from "@/lib/qualify";
import { getServiceClient, isSupabaseConfigured } from "@/lib/supabase";
import { tagLeadScore, lsqConfigured } from "@/lib/leadsquared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      leadId?: string;
      conversation: ConversationTurn[];
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
