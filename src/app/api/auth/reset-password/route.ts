import { postRoute, ok } from "@/lib/api/route";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { completePasswordReset } from "@/services/auth.service";

export const POST = postRoute({
  schema: resetPasswordSchema,
  limits: (_i, ip) => [{ key: `reset:ip:${ip}`, limit: 10, windowSec: 3600 }],
  handler: async ({ input }) => {
    await completePasswordReset(input.oobCode, input.password);
    return ok();
  },
});
