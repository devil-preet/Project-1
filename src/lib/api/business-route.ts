import "server-only";
import { type NextRequest, type NextResponse } from "next/server";
import { z } from "zod";
import { AuthError } from "@/lib/auth/errors";
import { authorizeMember } from "@/lib/auth/guard";
import type { Session } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import type { Permission } from "@/lib/permissions";
import { assertSameOrigin } from "@/lib/security/request";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import type { Role } from "@/types";
import { errorResponse, sessionFromRequest } from "./route";

const MAX_BODY_BYTES = 16 * 1024;

export type BusinessParams = { params: Promise<{ businessId: string }> };

interface Cfg<S extends z.ZodType> {
  schema: S;
  /** Permission required for THIS input (it can depend on the action). Checked against members/{uid}, never the client. */
  permission: (input: z.output<S>) => Permission;
  handler: (ctx: { input: z.output<S>; session: Session; businessId: string; role: Role; req: NextRequest }) => Promise<NextResponse>;
}

/**
 * Tenant-scoped JSON POST pipeline: CSRF -> verified session -> size -> JSON -> Zod ->
 * membership + role permission (businessId comes from the URL and is re-verified, never trusted) ->
 * per-user write rate limit -> handler -> safe error mapping.
 */
export function businessRoute<S extends z.ZodType>(cfg: Cfg<S>) {
  return async (req: NextRequest, { params }: BusinessParams): Promise<NextResponse> => {
    try {
      assertSameOrigin(req);
      const session = await sessionFromRequest(req, "verified");
      if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) throw new AuthError("invalid_input");
      const raw = await req.json().catch(() => {
        throw new AuthError("invalid_input");
      });
      const input = cfg.schema.parse(raw);
      const { businessId } = await params;
      const role = await authorizeMember(adminDb(), session.uid, businessId, cfg.permission(input));
      await enforceRateLimit([{ key: `catalog:${session.uid}:${businessId}`, limit: 300, windowSec: 600 }]);
      return await cfg.handler({ input, session, businessId, role, req });
    } catch (e) {
      return errorResponse(e);
    }
  };
}
