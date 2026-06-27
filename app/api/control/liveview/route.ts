import { NextRequest } from "next/server";
import { checkControlAuth, controlUnauthorized, proxyJson } from "@/lib/control-server";

export async function PUT(req: NextRequest) {
  if (!checkControlAuth(req)) return controlUnauthorized();
  const body = await req.json();
  if (!body.hostname) {
    return Response.json({ error: "hostname required" }, { status: 400 });
  }
  return proxyJson("/api/bot/liveview", {
    method: "PUT",
      body: JSON.stringify({
        hostname: body.hostname,
        enabled: Boolean(body.enabled),
        interval: Number(body.interval ?? 0.25),
        guild_id: "website",
      }),
  });
}
