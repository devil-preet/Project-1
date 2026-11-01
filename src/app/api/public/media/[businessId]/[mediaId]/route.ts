import { NextResponse, type NextRequest } from "next/server";
import { idSchema } from "@/lib/validations/catalog";
import { readMediaObject } from "@/services/media.service";
import { getPublicMedia } from "@/services/public-store.service";

/**
 * Public image bytes. Served ONLY when the asset is attached to something customers can see:
 * the branding logo of a published business, an active category, or an active product in an
 * active category. Everything else (drafts, archived, unattached uploads, other tenants) is 404.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ businessId: string; mediaId: string }> },
): Promise<NextResponse> {
  const { businessId, mediaId } = await params;
  const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!idSchema.safeParse(businessId).success || !idSchema.safeParse(mediaId).success) return notFound();
  try {
    const media = await getPublicMedia(businessId, mediaId);
    if (!media) return notFound();
    // Object names are immutable UUIDs, so the id is a perfect ETag. Caches may keep the bytes for at most
    // 60 s (hiding a product/category or unpublishing the store takes effect within a minute) and then
    // revalidate here: the visibility check above runs again and a 304 avoids re-downloading the file.
    const etag = `"${mediaId}"`;
    const cacheHeaders = { ETag: etag, "Cache-Control": "public, max-age=60, s-maxage=60, must-revalidate" };
    if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: cacheHeaders });
    const bytes = await readMediaObject(media.storagePath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        ...cacheHeaders,
        "Content-Type": media.contentType,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    console.error("[public-media] error:", e instanceof Error ? e.message : e);
    return notFound();
  }
}
