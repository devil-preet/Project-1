import { NextResponse, type NextRequest } from "next/server";
import { verifySessionValue } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/config";

/** Read-only session probe (used by the verify-email page). */
export async function GET(req: NextRequest) {
  const s = await verifySessionValue(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  return NextResponse.json(
    { authenticated: !!s, emailVerified: s?.emailVerified ?? false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
