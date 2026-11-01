import { postRoute, ok } from "@/lib/api/route";
import { setSessionCookie } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validations/auth";
import { loginUser } from "@/services/auth.service";

export const POST = postRoute({
  schema: loginSchema,
  // Per-(ip,email) stops password guessing; per-ip bounds credential stuffing;
  // per-email is the cross-IP backstop.
  limits: (i, ip) => [
    { key: `login:ip:${ip}`, limit: 30, windowSec: 900 },
    { key: `login:ip-email:${ip}:${i.email}`, limit: 5, windowSec: 900 },
    // Distributed guessing (many IPs, one account). Generous so it is a backstop,
    // not a trivial lockout lever against a victim.
    { key: `login:email:${i.email}`, limit: 20, windowSec: 3600 },
  ],
  handler: async ({ input }) => {
    const r = await loginUser(input);
    const res = ok({ emailVerified: r.emailVerified });
    setSessionCookie(res, r.cookieValue, r.remember);
    return res;
  },
});
