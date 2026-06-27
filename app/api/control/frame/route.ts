import { NextRequest } from "next/server";
import {
  API_URL,
  botHeaders,
  controlUnauthorized,
  getControlAuthError,
} from "@/lib/control-server";

/** Stream frame JSON through without parse/re-stringify (large base64 payloads). */
export async function GET(req: NextRequest) {
  const authErr = getControlAuthError(req);
  if (authErr) return controlUnauthorized(authErr);
  const hostname = req.nextUrl.searchParams.get("hostname");
  if (!hostname) {
    return Response.json({ error: "hostname required" }, { status: 400 });
  }
  const since = req.nextUrl.searchParams.get("since_id");
  const q = since ? `&since_id=${since}` : "";
  try {
    const upstream = await fetch(
      `${API_URL}/api/bot/liveview/latest?hostname=${encodeURIComponent(hostname)}${q}`,
      { headers: botHeaders(), cache: "no-store" },
    );
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Proxy failed" },
      { status: 502 },
    );
  }
}
