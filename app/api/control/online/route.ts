import { NextRequest } from "next/server";
import { checkControlAuth, controlUnauthorized, proxyJson } from "@/lib/control-server";

export async function GET(req: NextRequest) {
  if (!checkControlAuth(req)) return controlUnauthorized();
  const minutes = req.nextUrl.searchParams.get("minutes") || "5";
  return proxyJson(`/api/bot/online?minutes=${minutes}`);
}
