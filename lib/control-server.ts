import { NextRequest, NextResponse } from "next/server";

export const API_URL = (
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://antivirusapi-production.up.railway.app"
).replace(/\/$/, "");

export function controlUnauthorized(message?: string) {
  return NextResponse.json(
    { error: message || "Unauthorized" },
    { status: 401 },
  );
}

/** Returns null if OK, otherwise a user-facing error string. */
export function getControlAuthError(req: NextRequest): string | null {
  if (!process.env.BOT_API_KEY?.trim()) {
    return (
      "BOT_API_KEY is missing on Vercel. Add it under Project Settings → Environment Variables " +
      "(same value as Railway AntiVirusAPI), then redeploy."
    );
  }
  const pin = process.env.CONTROL_PIN?.trim();
  if (pin) {
    const provided = req.headers.get("x-control-pin")?.trim();
    if (provided !== pin) {
      return "Wrong CONTROL_PIN. Enter the PIN you set in Vercel, or remove CONTROL_PIN if unused.";
    }
  }
  return null;
}

export function checkControlAuth(req: NextRequest): boolean {
  return getControlAuthError(req) === null;
}

export function botHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": process.env.BOT_API_KEY || "",
  };
}

export async function proxyJson(
  path: string,
  init: RequestInit = {},
): Promise<NextResponse> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...botHeaders(), ...(init.headers as Record<string, string>) },
      cache: "no-store",
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    return NextResponse.json(body, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Proxy failed" },
      { status: 502 },
    );
  }
}
