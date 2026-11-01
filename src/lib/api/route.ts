import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AuthError } from "@/lib/auth/errors";
import { verifySessionValue, type Session } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/config";
import { assertSameOrigin, clientIp } from "@/lib/security/request";
import { enforceRateLimit, type RateRule } from "@/lib/security/rate-limit";

const MAX_BODY_BYTES = 16 * 1024;

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof z.ZodError) {
    // Key by the innermost property name so nested payloads ({product:{name}}) still map to form fields.
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of e.issues) {
      const key = [...issue.path].reverse().find((p): p is string => typeof p === "string") ?? "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    const err = new AuthError("invalid_input", undefined, { fieldErrors });
    return NextResponse.json(
      { ok: false, code: err.code, error: err.message, fieldErrors },
      { status: err.status },
    );
  }
  if (e instanceof AuthError) {
    const res = NextResponse.json(
      { ok: false, code: e.code, error: e.message, fieldErrors: e.extra?.fieldErrors },
      { status: e.status },
    );
    if (e.extra?.retryAfterSec) res.headers.set("Retry-After", String(e.extra.retryAfterSec));
    return res;
  }
  // Never leak internals: log server-side, return a generic message.
  console.error("[api] unhandled error:", e instanceof Error ? e.message : e);
  const err = new AuthError("internal");
  return NextResponse.json({ ok: false, code: err.code, error: err.message }, { status: 500 });
}

export function ok<T extends object>(data: T = {} as T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, ...data }, init);
}

export type AuthLevel = "session" | "verified";

/** Verifies the session cookie on the request itself (revocation-checked). */
export async function sessionFromRequest(req: NextRequest, level: AuthLevel): Promise<Session> {
  const s = await verifySessionValue(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!s) throw new AuthError("unauthenticated");
  if (level === "verified" && !s.emailVerified) throw new AuthError("email_unverified");
  return s;
}

interface RouteConfig<S extends z.ZodType, A extends AuthLevel | undefined> {
  schema: S;
  /** When set, a valid (and for "verified", email-verified) session is required BEFORE anything else runs. */
  auth?: A;
  /** Rate-limit rules evaluated after validation (so they can key on the email / user). */
  limits?: (input: z.output<S>, ip: string, session: Session | null) => RateRule[];
  handler: (ctx: {
    input: z.output<S>;
    req: NextRequest;
    ip: string;
    session: A extends AuthLevel ? Session : null;
  }) => Promise<NextResponse>;
}

/**
 * POST handler pipeline: CSRF/same-origin → authentication (optional) → body size →
 * JSON parse → Zod → rate limit → handler → safe error mapping.
 * Authentication precedes parsing so anonymous callers learn nothing about the schema.
 */
export function postRoute<S extends z.ZodType, A extends AuthLevel | undefined = undefined>(
  cfg: RouteConfig<S, A>,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      assertSameOrigin(req);
      const session = cfg.auth ? await sessionFromRequest(req, cfg.auth) : null;
      const len = Number(req.headers.get("content-length") ?? 0);
      if (len > MAX_BODY_BYTES) throw new AuthError("invalid_input");
      const raw = await req.json().catch(() => {
        throw new AuthError("invalid_input");
      });
      const input = cfg.schema.parse(raw);
      const ip = clientIp(req);
      const rules = cfg.limits?.(input, ip, session);
      if (rules?.length) await enforceRateLimit(rules);
      return await cfg.handler({ input, req, ip, session: session as never });
    } catch (e) {
      return errorResponse(e);
    }
  };
}
