import "server-only";
import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { AuthError } from "@/lib/auth/errors";

export interface RateRule {
  /** Namespaced identifier, e.g. `login:ip:1.2.3.4`. Hashed before storage. */
  key: string;
  limit: number;
  windowSec: number;
}

/**
 * Fixed-window limiter backed by Firestore (`rateLimits/{sha256(key)}`), so the
 * limit holds across all Cloud Run instances. Documents carry `expiresAt`; enable
 * a Firestore TTL policy on that field to garbage-collect them (see docs).
 * Fails CLOSED: if the store is unreachable, the request is refused.
 */
export async function enforceRateLimit(rules: RateRule[]): Promise<void> {
  let db: ReturnType<typeof adminDb>;
  try {
    db = adminDb();
  } catch (e) {
    // Misconfigured credentials: log a clear message and fail closed without an unhandled throw.
    console.error("[rate-limit] admin init failed, failing closed:", e instanceof Error ? e.message : "unknown error");
    throw new AuthError("internal");
  }
  for (const rule of rules) {
    const id = createHash("sha256").update(rule.key).digest("hex");
    const ref = db.collection("rateLimits").doc(id);
    const now = Date.now();

    const retryAfterSec = await db
      .runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.data() as { count: number; windowStart: number } | undefined;

        if (!data || now - data.windowStart >= rule.windowSec * 1000) {
          tx.set(ref, {
            count: 1,
            windowStart: now,
            expiresAt: Timestamp.fromMillis(now + rule.windowSec * 1000 * 2),
          });
          return 0;
        }
        if (data.count >= rule.limit) {
          return Math.ceil((data.windowStart + rule.windowSec * 1000 - now) / 1000);
        }
        tx.update(ref, { count: data.count + 1 });
        return 0;
      })
      .catch((e) => {
        console.error("[rate-limit] store error, failing closed:", e?.message ?? e);
        throw new AuthError("internal");
      });

    if (retryAfterSec > 0) throw new AuthError("rate_limited", undefined, { retryAfterSec });
  }
}
