// Client-side Meta helpers shared by the lead form and the qualification chat.

/** Stable id shared between the browser pixel and server CAPI for dedup. */
export function newEventId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : undefined;
}

/** Meta's _fbp / _fbc ad cookies; derives _fbc from the fbclid URL param if absent. */
export function readFbCookies(): { fbp?: string; fbc?: string } {
  const fbp = readCookie("_fbp");
  let fbc = readCookie("_fbc");
  if (!fbc && typeof window !== "undefined") {
    const fbclid = new URLSearchParams(window.location.search).get("fbclid");
    if (fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
  }
  return { fbp: fbp || undefined, fbc: fbc || undefined };
}
