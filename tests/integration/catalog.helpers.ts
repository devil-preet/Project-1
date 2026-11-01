/* eslint-disable @typescript-eslint/no-explicit-any -- API response bodies are asserted field by field in tests */
import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { POST as categoriesPost } from "@/app/api/b/[businessId]/categories/route";
import { POST as productsPost } from "@/app/api/b/[businessId]/products/route";
import { POST as settingsPost } from "@/app/api/b/[businessId]/settings/route";
import { POST as mediaPost } from "@/app/api/b/[businessId]/media/route";
import { GET as adminMediaGet } from "@/app/api/b/[businessId]/media/[mediaId]/route";
import { GET as publicMediaGet } from "@/app/api/public/media/[businessId]/[mediaId]/route";
import { apiRequest, freshIp, makeUser, multipartRequest, PNG, type TestUser } from "./helpers";

export type Json = Record<string, any>;
export type Role = "OWNER" | "ADMIN" | "MANAGER" | "EDITOR";

export interface World {
  bizId: string;
  slug: string;
  users: Record<Role | "outsider", TestUser>;
}

/** Seeds one business (members for every role) directly with the Admin SDK, plus an outsider user. */
export async function seedBusiness(bizId: string, slug: string, opts: { published?: boolean; users?: World["users"] } = {}): Promise<World> {
  const db = adminDb();
  const users = opts.users ?? {
    OWNER: await makeUser(),
    ADMIN: await makeUser(),
    MANAGER: await makeUser(),
    EDITOR: await makeUser(),
    outsider: await makeUser(),
  };
  const status = opts.published ? "published" : "unpublished";
  await db.doc(`businesses/${bizId}`).set({
    name: `Biz ${bizId}`, slug, industry: "Other", description: "d", contactEmail: "", contactPhone: "",
    ownerId: users.OWNER.uid, storeStatus: status, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
  });
  await db.doc(`slugs/${slug}`).set({ businessId: bizId, type: "primary" });
  await db.doc(`businesses/${bizId}/settings/store`).set({
    displayName: `Store ${bizId}`, description: "A shop", currency: "INR", status, publicVisibility: opts.published === true,
  });
  await db.doc(`businesses/${bizId}/settings/branding`).set({
    displayName: `Store ${bizId}`, defaultTheme: "light", logo: null, primaryColor: "#111827", secondaryColor: "#6B7280",
    accentColor: "#2563EB", backgroundColor: "#FFFFFF", brandDescription: "", contactEmail: "owner@secret.example", contactPhone: "", social: {},
  });
  for (const role of ["OWNER", "ADMIN", "MANAGER", "EDITOR"] as const) {
    await db.doc(`businesses/${bizId}/members/${users[role].uid}`).set({ uid: users[role].uid, businessId: bizId, role, email: users[role].email });
  }
  return { bizId, slug, users };
}

const params = (businessId: string) => ({ params: Promise.resolve({ businessId }) });

export async function call(
  route: typeof categoriesPost | typeof productsPost | typeof settingsPost,
  businessId: string,
  body: unknown,
  cookie?: string,
  extra: Parameters<typeof apiRequest>[2] = {},
) {
  const res = await route(apiRequest(`/api/b/${businessId}/x`, body, { cookie, ...extra }), params(businessId));
  return { status: res.status, body: (await res.json()) as Json };
}

export const cat = (b: string, body: unknown, cookie?: string) => call(categoriesPost, b, body, cookie);
export const prod = (b: string, body: unknown, cookie?: string) => call(productsPost, b, body, cookie);
export const settings = (b: string, body: unknown, cookie?: string) => call(settingsPost, b, body, cookie);

export async function upload(businessId: string, bytes: Uint8Array, name: string, type: string, cookie?: string) {
  const res = await mediaPost(multipartRequest(`/api/b/${businessId}/media`, { bytes, name, type }, cookie), params(businessId));
  return { status: res.status, body: (await res.json()) as Json };
}

export async function getAdminMedia(businessId: string, mediaId: string, cookie?: string) {
  const req = new NextRequest(`http://localhost:3000/api/b/${businessId}/media/${mediaId}`, {
    headers: { host: "localhost:3000", "x-forwarded-for": freshIp(), ...(cookie ? { cookie } : {}) },
  });
  return adminMediaGet(req, { params: Promise.resolve({ businessId, mediaId }) });
}

export async function getPublicMediaRes(businessId: string, mediaId: string, headers: Record<string, string> = {}) {
  const req = new NextRequest(`http://localhost:3000/api/public/media/${businessId}/${mediaId}`, { headers });
  return publicMediaGet(req, { params: Promise.resolve({ businessId, mediaId }) });
}

export const validProduct = (categoryId: string, over: Record<string, unknown> = {}) => ({
  name: "Linen Shirt", categoryId, description: "A breathable linen shirt.", priceCents: 129900, status: "draft", ...over,
});

/** Uploads a PNG as `cookie` and returns its media id. */
export async function pngId(businessId: string, cookie: string): Promise<string> {
  const r = await upload(businessId, PNG, "p.png", "image/png", cookie);
  if (r.status !== 200) throw new Error(`upload failed: ${JSON.stringify(r.body)}`);
  return r.body.media.mediaId as string;
}
