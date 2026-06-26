import { NextResponse } from "next/server";

const API_URL = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const SIMULATOR_API_KEY = process.env.SIMULATOR_API_KEY || "";

export async function DELETE() {
  if (!API_URL) {
    return NextResponse.json({ error: "API_URL not configured" }, { status: 500 });
  }
  const res = await fetch(`${API_URL}/api/events`, {
    method: "DELETE",
    headers: SIMULATOR_API_KEY ? { "x-api-key": SIMULATOR_API_KEY } : {},
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
