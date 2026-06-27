import { NextRequest, NextResponse } from "next/server";
import {
  SITE_AUTH_COOKIE,
  expectedAuthToken,
  siteAuthEnabled,
  sitePassword,
} from "@/lib/site-auth";

export async function POST(req: NextRequest) {
  if (!siteAuthEnabled()) {
    return NextResponse.json({ ok: true });
  }

  let password = "";
  try {
    const body = await req.json();
    password = String(body.password || "");
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (password !== sitePassword()) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const token = await expectedAuthToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SITE_AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
