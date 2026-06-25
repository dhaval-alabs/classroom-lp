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

/** Fire the lead/conversion event across every configured platform. */
export function trackLead() {
  if (typeof window === "undefined") return;
  try {
    window.fbq?.("track", "Lead");
  } catch {}
  try {
    const label = process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL;
    if (window.gtag && GADS_ID && label) {
      window.gtag("event", "conversion", { send_to: `${GADS_ID}/${label}` });
    }
    window.gtag?.("event", "generate_lead", { value: 1 });
  } catch {}
}

export default function Analytics() {
  const gtagId = GADS_ID || GA4_ID;

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
            ${GADS_ID ? `gtag('config','${GADS_ID}');` : ""}
            ${GA4_ID ? `gtag('config','${GA4_ID}');` : ""}`}
          </Script>
        </>
      )}
    </>
  );
}
