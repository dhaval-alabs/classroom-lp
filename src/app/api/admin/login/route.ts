import { NextRequest, NextResponse } from "next/server";
import {
  adminConfigured,
  checkPassword,
  createSessionToken,
  ADMIN_COOKIE,
  ADMIN_TTL_MS,
} from "@/lib/adminauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!adminConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Admin not configured. Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET." },
      { status: 503 },
    );
  }

  let password: unknown = "";
  try {
    ({ password } = await req.json());
  } catch {
    /* fall through to failure */
  }

  // Small constant delay to blunt brute-forcing.
  await new Promise((r) => setTimeout(r, 300));

  if (!checkPassword(password)) {
    return NextResponse.json({ ok: false, error: "Incorrect password." }, { status: 401 });
  }

  const token = createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ADMIN_TTL_MS / 1000),
  });
  return res;
}
