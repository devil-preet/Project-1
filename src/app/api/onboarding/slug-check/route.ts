import { postRoute, ok } from "@/lib/api/route";
import { slugCheckSchema } from "@/lib/validations/onboarding";
import { checkSlug } from "@/services/onboarding.service";

export const POST = postRoute({
  schema: slugCheckSchema,
  auth: "verified",
  limits: (_i, _ip, s) => [{ key: `onb-slug:uid:${s!.uid}`, limit: 90, windowSec: 600 }],
  handler: async ({ input }) => ok(await checkSlug(input.slug)),
});
