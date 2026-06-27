import { NextRequest } from "next/server";
import { controlUnauthorized, getControlAuthError, proxyJson } from "@/lib/control-server";

export async function GET(req: NextRequest) {
  const authErr = getControlAuthError(req);
  if (authErr) return controlUnauthorized(authErr);
  const minutes = req.nextUrl.searchParams.get("minutes") || "5";
  return proxyJson(`/api/bot/online?minutes=${minutes}`);
}
