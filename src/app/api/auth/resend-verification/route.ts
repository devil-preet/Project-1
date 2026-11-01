import { z } from "zod";
import { postRoute, ok } from "@/lib/api/route";
import { AuthError } from "@/lib/auth/errors";
import { verifySessionValue } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/config";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { resendVerificationEmail } from "@/services/auth.service";

export const POST = postRoute({
  schema: z.object({}),
  limits: (_i, ip) => [{ key: `resend:ip:${ip}`, limit: 10, windowSec: 3600 }],
  handler: async ({ req }) => {
    const s = await verifySessionValue(req.cookies.get(SESSION_COOKIE_NAME)?.value);
    if (!s) throw new AuthError("unauthenticated");
    await enforceRateLimit([{ key: `resend:uid:${s.uid}`, limit: 3, windowSec: 3600 }]);
    const r = await resendVerificationEmail(s.uid);
    return ok({ alreadyVerified: r.alreadyVerified });
  },
});
