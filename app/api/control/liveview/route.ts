import { NextRequest } from "next/server";
import { controlUnauthorized, getControlAuthError, proxyJson } from "@/lib/control-server";

export async function PUT(req: NextRequest) {
  const authErr = getControlAuthError(req);
  if (authErr) return controlUnauthorized(authErr);
  const body = await req.json();
  if (!body.hostname) {
    return Response.json({ error: "hostname required" }, { status: 400 });
  }
  return proxyJson("/api/bot/liveview", {
    method: "PUT",
      body: JSON.stringify({
        hostname: body.hostname,
        enabled: Boolean(body.enabled),
        interval: Number(body.interval ?? 1 / 30),
        quality: String(body.quality ?? "balanced"),
        guild_id: "website",
      }),
  });
}
