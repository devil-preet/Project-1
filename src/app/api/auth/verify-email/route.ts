import { postRoute, ok } from "@/lib/api/route";
import { verifyEmailSchema } from "@/lib/validations/auth";
import { completeEmailVerification } from "@/services/auth.service";

export const POST = postRoute({
  schema: verifyEmailSchema,
  limits: (_i, ip) => [{ key: `verify:ip:${ip}`, limit: 20, windowSec: 3600 }],
  handler: async ({ input }) => {
    await completeEmailVerification(input.oobCode);
    return ok();
  },
});
