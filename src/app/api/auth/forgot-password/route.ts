import { postRoute, ok } from "@/lib/api/route";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { requestPasswordReset } from "@/services/auth.service";

export const POST = postRoute({
  schema: forgotPasswordSchema,
  limits: (i, ip) => [
    { key: `forgot:ip:${ip}`, limit: 10, windowSec: 3600 },
    { key: `forgot:ip-email:${ip}:${i.email}`, limit: 3, windowSec: 3600 },
  ],
  // Identical response whether or not the account exists.
  handler: async ({ input }) => {
    await requestPasswordReset(input.email);
    return ok();
  },
});
