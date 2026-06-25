import crypto from "crypto";
import { cookies } from "next/headers";

// Lite admin auth: a single shared password (ADMIN_PASSWORD) verified server-side,
// with an HMAC-signed, httpOnly session cookie (signed with ADMIN_SESSION_SECRET).
// No DB, no external dep — just Node crypto. Both env vars are required for admin
// to be enabled.

export const ADMIN_COOKIE = "admin_session";
export const ADMIN_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function secret(): string | null {
  return process.env.ADMIN_SESSION_SECRET || null;
}

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET);
}

function hmac(data: string, key: string): string {
  return crypto.createHmac("sha256", key).update(data).digest("base64url");
}

/** Mint a signed session token. Returns null if the secret isn't configured. */
export function createSessionToken(): string | null {
  const key = secret();
  if (!key) return null;
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + ADMIN_TTL_MS })).toString("base64url");
  return `${payload}.${hmac(payload, key)}`;
}

export function verifyToken(token: string | undefined | null): boolean {
  const key = secret();
  if (!key || !token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = hmac(payload, key);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp?: number };
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

/** Constant-time-ish password check against ADMIN_PASSWORD. */
export function checkPassword(input: unknown): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || typeof input !== "string") return false;
  const a = Buffer.from(input);
  const b = Buffer.from(pw);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Read + verify the admin cookie (server components & route handlers). */
export async function isAdminAuthed(): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return verifyToken(token);
}
