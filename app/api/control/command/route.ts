import { NextRequest } from "next/server";
import { checkControlAuth, controlUnauthorized, proxyJson } from "@/lib/control-server";

export async function POST(req: NextRequest) {
  if (!checkControlAuth(req)) return controlUnauthorized();
  const body = await req.json();
  const hostname = body.hostname as string;
  if (!hostname) {
    return Response.json({ error: "hostname required" }, { status: 400 });
  }

  const kind = (body.kind as string) || "module";
  if (kind === "input") {
    if (!body.payload) {
      return Response.json({ error: "payload required" }, { status: 400 });
    }
    return proxyJson("/api/bot/commands", {
      method: "POST",
      body: JSON.stringify({
        hostname,
        command_kind: "input",
        payload: body.payload,
        guild_id: "website",
      }),
    });
  }

  const module = body.module as string;
  if (!module) {
    return Response.json({ error: "module required" }, { status: 400 });
  }
  return proxyJson("/api/bot/commands", {
    method: "POST",
    body: JSON.stringify({
      hostname,
      module,
      command_kind: "module",
      guild_id: "website",
    }),
  });
}
