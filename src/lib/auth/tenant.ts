import "server-only";
import { cache } from "react";
import { listMemberships } from "@/services/business.service";

/** Request-scoped memoisation so a layout and its page share one membership query. */
export const getMemberships = cache((uid: string) => listMemberships(uid));
