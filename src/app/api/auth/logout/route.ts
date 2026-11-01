import { z } from "zod";
import { postRoute, ok } from "@/lib/api/route";
import { clearSessionCookie, verifySessionValue } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/config";
import { revokeAllSessions } from "@/services/auth.service";

export const POST = postRoute({
  schema: z.object({ everywhere: z.boolean().optional() }),
  handler: async ({ input, req }) => {
    if (input.everywhere) {
      const s = await verifySessionValue(req.cookies.get(SESSION_COOKIE_NAME)?.value);
      if (s) await revokeAllSessions(s.uid);
    }
    const res = ok();
    clearSessionCookie(res);
    return res;
  },
});
