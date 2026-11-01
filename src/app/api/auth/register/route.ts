import { postRoute, ok } from "@/lib/api/route";
import { setSessionCookie } from "@/lib/auth/session";
import { registerSchema } from "@/lib/validations/auth";
import { registerUser } from "@/services/auth.service";

export const POST = postRoute({
  schema: registerSchema,
  limits: (_i, ip) => [{ key: `register:ip:${ip}`, limit: 5, windowSec: 3600 }],
  handler: async ({ input }) => {
    const r = await registerUser(input);
    const res = ok({ emailVerified: false, verificationEmailSent: r.verificationEmailSent });
    setSessionCookie(res, r.cookieValue, r.remember);
    return res;
  },
});
