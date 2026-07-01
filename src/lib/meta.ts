// Meta Conversions API (server-side). Sends events straight to Meta so they
// survive ad-blockers / iOS / cookie loss, deduplicated against the browser
// pixel via a shared event_id. All user data is SHA-256 hashed before sending.
// Best-effort: never throws — returns a result the caller can log.
import crypto from "crypto";

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalize(s: string | undefined | null): string {
  return (s ?? "").toString().trim().toLowerCase();
}

function hashIfPresent(value: string | undefined | null): string | undefined {
  const n = normalize(value);
  if (!n) return undefined;
  return sha256(n);
}

function hashPhone(phone: string | undefined | null): string | undefined {
  if (!phone) return undefined;
  // Meta expects E.164-style digits only, no '+' or spaces.
  const digits = phone.toString().replace(/\D/g, "");
  if (!digits) return undefined;
  // 10 digits → assume India (this app's audience).
  const e164 = digits.length === 10 ? `91${digits}` : digits;
  return sha256(e164);
}

export type MetaUserData = {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  country?: string; // ISO-3166 alpha-2, e.g. 'in'
  clientIp?: string;
  clientUserAgent?: string;
  fbp?: string; // raw _fbp cookie (NOT hashed)
  fbc?: string; // raw _fbc cookie (NOT hashed)
  externalId?: string; // e.g. internal lead id; hashed
};

export type MetaCapiEvent = {
  eventName: "Lead" | "CompleteRegistration" | "PageView" | "ViewContent" | (string & {});
  eventId: string; // MUST match the eventID used by the browser pixel for dedup
  eventTime?: number; // unix seconds; defaults to now
  eventSourceUrl?: string;
  actionSource?: "website" | "app" | "phone_call" | "chat" | "email" | "system_generated" | "other";
  userData: MetaUserData;
  customData?: Record<string, unknown>;
};

type CapiResult = { ok: true; eventsReceived: number } | { ok: false; error: string };

export function isMetaCapiConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID && process.env.META_CAPI_ACCESS_TOKEN);
}

export async function sendMetaCapiEvent(event: MetaCapiEvent): Promise<CapiResult> {
  try {
    const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
    const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
    if (!pixelId || !accessToken) {
      return { ok: false, error: "META_CAPI not configured (missing pixel ID or access token)" };
    }

    // event_id is required for browser ↔ server dedup; refuse to send without it.
    const eventId = (event.eventId ?? "").toString().trim();
    if (!eventId) {
      return { ok: false, error: `[${event.eventName}] refusing to send without event_id (would break dedup)` };
    }

    const user_data: Record<string, unknown> = {};
    const em = hashIfPresent(event.userData.email);
    const ph = hashPhone(event.userData.phone);
    const fn = hashIfPresent(event.userData.firstName);
    const ln = hashIfPresent(event.userData.lastName);
    const ct = hashIfPresent(event.userData.city);
    const country = hashIfPresent(event.userData.country);
    const external_id = hashIfPresent(event.userData.externalId);

    if (em) user_data.em = [em];
    if (ph) user_data.ph = [ph];
    if (fn) user_data.fn = [fn];
    if (ln) user_data.ln = [ln];
    if (ct) user_data.ct = [ct];
    if (country) user_data.country = [country];
    if (external_id) user_data.external_id = [external_id];
    if (event.userData.clientIp) user_data.client_ip_address = event.userData.clientIp;
    if (event.userData.clientUserAgent) user_data.client_user_agent = event.userData.clientUserAgent;
    if (event.userData.fbp) user_data.fbp = event.userData.fbp;
    if (event.userData.fbc) user_data.fbc = event.userData.fbc;

    const payload: Record<string, unknown> = {
      data: [
        {
          event_name: event.eventName,
          event_id: eventId,
          event_time: event.eventTime ?? Math.floor(Date.now() / 1000),
          event_source_url: event.eventSourceUrl,
          action_source: event.actionSource ?? "website",
          user_data,
          custom_data: event.customData ?? {},
        },
      ],
    };
    const testCode = process.env.META_TEST_EVENT_CODE;
    if (testCode) payload.test_event_code = testCode;

    // Bound the request so a slow Meta endpoint can't hang the lead submit.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          ok: false,
          error: `Meta CAPI ${res.status} for ${event.eventName} (event_id=${eventId.slice(0, 12)}…): ${body.slice(0, 300)}`,
        };
      }
      const data = await res.json().catch(() => ({}));
      return { ok: true, eventsReceived: typeof data.events_received === "number" ? data.events_received : 1 };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function extractClientContext(req: Request): { ip: string | undefined; userAgent: string | undefined } {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip") || undefined;
  const userAgent = req.headers.get("user-agent") || undefined;
  return { ip, userAgent };
}
