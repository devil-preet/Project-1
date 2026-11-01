import { postRoute, ok } from "@/lib/api/route";
import { onboardingSchema } from "@/lib/validations/onboarding";
import { completeOnboarding } from "@/services/onboarding.service";

/**
 * The request body carries ONLY the form fields. Unknown keys (businessId, ownerId, role,
 * slug ownership, …) are stripped by Zod: identity, tenant id and role come exclusively
 * from the verified session and the server-held draft.
 */
export const POST = postRoute({
  schema: onboardingSchema,
  auth: "verified",
  limits: (_i, _ip, s) => [{ key: `onb-complete:uid:${s!.uid}`, limit: 10, windowSec: 3600 }],
  handler: async ({ input, session }) => {
    const r = await completeOnboarding({ uid: session.uid, email: session.email, name: session.name }, input);
    return ok(r);
  },
});
