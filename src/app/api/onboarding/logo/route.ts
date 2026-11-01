import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, ok, sessionFromRequest } from "@/lib/api/route";
import { AuthError } from "@/lib/auth/errors";
import { assertSameOrigin } from "@/lib/security/request";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { LOGO_MAX_BYTES } from "@/lib/validations/onboarding";
import { attachLogo } from "@/services/onboarding.service";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(req, { multipart: true });
    const session = await sessionFromRequest(req, "verified");
    // Reject oversized bodies before buffering them.
    if (Number(req.headers.get("content-length") ?? 0) > LOGO_MAX_BYTES + 64 * 1024) {
      throw new AuthError("invalid_input", "Logo must be 2 MB or smaller.");
    }
    await enforceRateLimit([{ key: `onb-logo:uid:${session.uid}`, limit: 10, windowSec: 600 }]);

    const form = await req.formData().catch(() => {
      throw new AuthError("invalid_input");
    });
    const file = form.get("file");
    if (!(file instanceof File)) throw new AuthError("invalid_input", "Choose an image to upload.");
    const logo = await attachLogo(session.uid, Buffer.from(await file.arrayBuffer()), file.name);
    return ok({ logo: { fileName: logo.fileName, sizeBytes: logo.sizeBytes, contentType: logo.contentType } });
  } catch (e) {
    return errorResponse(e);
  }
}
