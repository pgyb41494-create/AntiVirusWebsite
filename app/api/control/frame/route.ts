import { NextRequest } from "next/server";
import { controlUnauthorized, getControlAuthError, proxyJson } from "@/lib/control-server";

export async function GET(req: NextRequest) {
  const authErr = getControlAuthError(req);
  if (authErr) return controlUnauthorized(authErr);
  const hostname = req.nextUrl.searchParams.get("hostname");
  if (!hostname) {
    return Response.json({ error: "hostname required" }, { status: 400 });
  }
  const since = req.nextUrl.searchParams.get("since_id");
  const q = since ? `&since_id=${since}` : "";
  return proxyJson(
    `/api/bot/liveview/latest?hostname=${encodeURIComponent(hostname)}${q}`,
  );
}
