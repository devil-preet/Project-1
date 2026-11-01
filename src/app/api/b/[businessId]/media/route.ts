import { type NextRequest, type NextResponse } from "next/server";
import { errorResponse, ok, sessionFromRequest } from "@/lib/api/route";
import type { BusinessParams } from "@/lib/api/business-route";
import { AuthError } from "@/lib/auth/errors";
import { authorizeMember } from "@/lib/auth/guard";
import { adminDb } from "@/lib/firebase/admin";
import { assertSameOrigin } from "@/lib/security/request";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { MEDIA_MAX_BYTES } from "@/lib/validations/catalog";
import { adminMediaUrl, uploadMedia } from "@/services/media.service";

/** Upload one image into the business media folder (unattached until a product/category claims it). */
export async function POST(req: NextRequest, { params }: BusinessParams): Promise<NextResponse> {
  try {
    assertSameOrigin(req, { multipart: true });
    const session = await sessionFromRequest(req, "verified");
    const { businessId } = await params;
    await authorizeMember(adminDb(), session.uid, businessId, "media:upload");
    if (Number(req.headers.get("content-length") ?? 0) > MEDIA_MAX_BYTES + 128 * 1024) {
      throw new AuthError("invalid_input", "Images must be 8 MB or smaller.");
    }
    await enforceRateLimit([{ key: `media-up:${session.uid}:${businessId}`, limit: 60, windowSec: 600 }]);
    const form = await req.formData().catch(() => {
      throw new AuthError("invalid_input");
    });
    const file = form.get("file");
    if (!(file instanceof File)) throw new AuthError("invalid_input", "Choose an image to upload.");
    const m = await uploadMedia(businessId, session.uid, Buffer.from(await file.arrayBuffer()), file.name);
    return ok({ media: { ...m, url: adminMediaUrl(businessId, m.mediaId) } });
  } catch (e) {
    return errorResponse(e);
  }
}
