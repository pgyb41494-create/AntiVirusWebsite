import { NextRequest, NextResponse } from "next/server";

export const API_URL = (
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://antivirusapi-production.up.railway.app"
).replace(/\/$/, "");

export function controlUnauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function checkControlAuth(req: NextRequest): boolean {
  const pin = process.env.CONTROL_PIN?.trim();
  if (pin) {
    const provided = req.headers.get("x-control-pin")?.trim();
    if (provided !== pin) return false;
  }
  return Boolean(process.env.BOT_API_KEY?.trim());
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
