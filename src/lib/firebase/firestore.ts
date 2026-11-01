import "server-only";
import { Timestamp } from "firebase-admin/firestore";

/** Firestore Timestamp → ISO string (DTO shape). Tolerates already-serialized values. */
export function iso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (typeof v === "string") return v;
  return "";
}
