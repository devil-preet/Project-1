import { postRoute, ok } from "@/lib/api/route";
import { draftSaveSchema } from "@/lib/validations/onboarding";
import { saveDraft } from "@/services/onboarding.service";

export const POST = postRoute({
  schema: draftSaveSchema,
  auth: "verified",
  limits: (_i, _ip, s) => [{ key: `onb-draft:uid:${s!.uid}`, limit: 120, windowSec: 600 }],
  handler: async ({ input, session }) => {
    const draft = await saveDraft(session.uid, input);
    return ok({ status: draft.status, step: draft.step });
  },
});
