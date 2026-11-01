import { NextRequest } from "next/server";

export const PROJECT = "demo-brand-portal";
const authBase = () => `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}`;
const fsBase = () => `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}`;

export async function resetEmulators() {
  await fetch(`${authBase()}/accounts`, { method: "DELETE" });
  await fetch(`${fsBase()}/databases/(default)/documents`, { method: "DELETE" });
}

export interface OobCode {
  email: string;
  requestType: string;
  oobCode: string;
}
export async function oobCodes(email?: string, requestType?: string): Promise<OobCode[]> {
  const res = await fetch(`${authBase()}/oobCodes`);
  const { oobCodes } = (await res.json()) as { oobCodes: OobCode[] };
  return oobCodes.filter((c) => (!email || c.email === email) && (!requestType || c.requestType === requestType));
}

let ipCounter = 0;
export const freshIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

export function apiRequest(
  path: string,
  body: unknown,
  opts: { headers?: Record<string, string | null>; cookie?: string; ip?: string; method?: string } = {},
): NextRequest {
  const headers: Record<string, string> = {
    host: "localhost:3000",
    origin: "http://localhost:3000",
    "sec-fetch-site": "same-origin",
    "x-requested-with": "fetch",
    "content-type": "application/json",
    "x-forwarded-for": opts.ip ?? freshIp(),
  };
  if (opts.cookie) headers.cookie = opts.cookie;
  for (const [k, v] of Object.entries(opts.headers ?? {})) {
    if (v === null) delete headers[k];
    else headers[k] = v;
  }
  return new NextRequest(`http://localhost:3000${path}`, {
    method: opts.method ?? "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export const PASSWORD = "Str0ngPassw0rdX";
export const registerBody = (email: string, over: Record<string, unknown> = {}) => ({
  fullName: "Ada Lovelace",
  email,
  password: PASSWORD,
  confirmPassword: PASSWORD,
  ...over,
});

/** Extracts "__session=<value>" from a response, or null if cleared/absent. */
export function sessionCookieOf(res: Response): string | null {
  const raw = res.headers.get("set-cookie") ?? "";
  const m = raw.match(/__session=([^;]*)/);
  return m && m[1] ? `__session=${m[1]}` : null;
}
export const cookieValue = (c: string) => c.split("=")[1];
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- Phase 3 helpers -------------------------------------------------------
import { adminAuth } from "@/lib/firebase/admin";
import { POST as registerRoute } from "@/app/api/auth/register/route";

let userCounter = 0;
export interface TestUser {
  uid: string;
  email: string;
  cookie: string;
}

/** Registers through the real route; optionally marks the email verified (default true). */
export async function makeUser(opts: { verified?: boolean; email?: string } = {}): Promise<TestUser> {
  const email = opts.email ?? `user${++userCounter}-${Date.now()}@example.com`;
  const res = await registerRoute(apiRequest("/api/auth/register", registerBody(email)));
  const cookie = sessionCookieOf(res)!;
  const { uid } = await adminAuth().getUserByEmail(email);
  if (opts.verified !== false) await adminAuth().updateUser(uid, { emailVerified: true });
  return { uid, email, cookie };
}

export const validBusiness = (over: Record<string, unknown> = {}) => ({
  businessName: "Northstar Clothing",
  industry: "Apparel & Fashion",
  description: "Modern essentials.",
  contactEmail: "hello@northstar.example",
  contactPhone: "+1 555 010 2030",
  storeDisplayName: "Northstar",
  slug: "northstar-clothing",
  storeDescription: "Clothing for every day.",
  storeStatus: "unpublished",
  primaryColor: "#111827",
  secondaryColor: "#6B7280",
  accentColor: "#2563EB",
  defaultTheme: "light",
  ...over,
});

export function multipartRequest(path: string, file: { bytes: Uint8Array; name: string; type: string } | null, cookie?: string) {
  const form = new FormData();
  if (file) form.set("file", new File([file.bytes as BlobPart], file.name, { type: file.type }));
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      "x-requested-with": "fetch",
      "x-forwarded-for": freshIp(),
      ...(cookie ? { cookie } : {}),
    },
    body: form,
  });
}

export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
export const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0]);
