"use client";

import Script from "next/script";

/**
 * Loads Meta Pixel + Google Ads/GA4 gtag, all env-driven. Any tag whose id is
 * blank is silently skipped, so the page works with zero tracking configured.
 *
 * Conversion events are fired from LeadForm via the helpers below on a
 * SUCCESSFUL submit (not on page load).
 */

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const GADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID;

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/**
 * Fire the form-submit conversion across every configured platform.
 * Meta side is the CUSTOM event `lead_classroom` (distinct from masterclass's
 * standard `Lead` on the shared pixel). Pass the same `eventId` sent to the
 * server-side Conversions API so Meta deduplicates the browser + server event.
 */
export function trackLead(eventId?: string) {
  if (typeof window === "undefined") return;
  try {
    if (eventId) window.fbq?.("trackCustom", "lead_classroom", {}, { eventID: eventId });
    else window.fbq?.("trackCustom", "lead_classroom");
  } catch {}
  // ─────────────────────────────────────────────────────────────
  // GOOGLE ADS — DISABLED (commented out, not deleted)
  // This repo/app is Meta-only for now. This code was inherited
  // from the careersuccess (Google Ads) fork and is currently inert
  // (env vars unset in production). Commented out rather than removed
  // so Google Ads support can be re-enabled quickly if this campaign
  // is ever extended to Google Ads. Do not uncomment without confirming
  // the relevant AW-.../label conversion action is correctly configured
  // and intended for THIS app specifically.
  // ─────────────────────────────────────────────────────────────
  // try {
  //   const label = process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL;
  //   if (window.gtag && GADS_ID && label) {
  //     window.gtag("event", "conversion", { send_to: `${GADS_ID}/${label}` });
  //   }
  // } catch {}
  try {
    window.gtag?.("event", "generate_lead", { value: 1 });
  } catch {}
}

/**
 * Deeper-funnel conversion: user confirmed "Yes, lock my seat!" after the
 * Gemini qualification chat. Meta CUSTOM event `lock_seat_classroom`; pass the
 * shared `eventId` so it dedups against the server-side CAPI event.
 */
export function trackLockSeat(eventId?: string) {
  if (typeof window === "undefined") return;
  try {
    if (eventId) window.fbq?.("trackCustom", "lock_seat_classroom", {}, { eventID: eventId });
    else window.fbq?.("trackCustom", "lock_seat_classroom");
  } catch {}
}

export default function Analytics() {
  const gtagId = GADS_ID || GA4_ID;
  // ─────────────────────────────────────────────────────────────
  // GOOGLE ADS — DISABLED (commented out, not deleted)
  // This repo/app is Meta-only for now. This code was inherited
  // from the careersuccess (Google Ads) fork and is currently inert
  // (env vars unset in production). Commented out rather than removed
  // so Google Ads support can be re-enabled quickly if this campaign
  // is ever extended to Google Ads. Do not uncomment without confirming
  // the relevant AW-.../label conversion action is correctly configured
  // and intended for THIS app specifically.
  // ─────────────────────────────────────────────────────────────
  // const gadsConfigLine = GADS_ID ? `gtag('config','${GADS_ID}');` : "";
  const gadsConfigLine = "";

  return (
    <>
      {PIXEL_ID && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window,document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init','${PIXEL_ID}');fbq('track','PageView');`}
        </Script>
      )}
      {PIXEL_ID && (
        // eslint-disable-next-line @next/next/no-img-element
        <noscript>
          <img
            height="1"
            width="1"
            alt=""
            style={{ display: "none" }}
            src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
          />
        </noscript>
      )}

      {gtagId && (
        <>
          <Script
            id="gtag-src"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${gtagId}`}
          />
          <Script id="gtag-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];
            function gtag(){dataLayer.push(arguments);}
            gtag('js',new Date());
            ${gadsConfigLine}
            ${GA4_ID ? `gtag('config','${GA4_ID}');` : ""}`}
          </Script>
        </>
      )}
    </>
  );
}
