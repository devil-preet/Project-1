import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionFromRequest } from "@/lib/api/route";
import { AuthError } from "@/lib/auth/errors";
import { authorizeMember } from "@/lib/auth/guard";
import { adminDb } from "@/lib/firebase/admin";
import { idSchema } from "@/lib/validations/catalog";
import { readMediaObject } from "@/services/media.service";

/** Members-only image bytes (workspace previews incl. drafts). Authorised on every request. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ businessId: string; mediaId: string }> },
): Promise<NextResponse> {
  try {
    const session = await sessionFromRequest(req, "verified");
    const { businessId, mediaId } = await params;
    await authorizeMember(adminDb(), session.uid, businessId, "business:view");
    if (!idSchema.safeParse(mediaId).success) throw new AuthError("not_found");
    const snap = await adminDb().doc(`businesses/${businessId}/media/${mediaId}`).get();
    if (!snap.exists || snap.get("deletedAt") || snap.get("businessId") !== businessId) throw new AuthError("not_found");
    const bytes = await readMediaObject(snap.get("storagePath"));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": snap.get("contentType"),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
