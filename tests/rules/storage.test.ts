import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc } from "firebase/firestore";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import { BIZ_A, BIZ_B, USERS, createEnv, seed } from "./helpers";

let env: RulesTestEnvironment;
const storageAs = (uid: string) => env.authenticatedContext(uid).storage();
const anonStorage = () => env.unauthenticatedContext().storage();

type Storage = ReturnType<typeof storageAs>;
type Payload = { data: Uint8Array; meta: { contentType: string } };

const bytes = (n: number) => new Uint8Array(n).fill(1);
const png = (n = 1024): Payload => ({ data: bytes(n), meta: { contentType: "image/png" } });
const upload = (s: Storage, path: string, f: Payload = png()) =>
  uploadBytes(ref(s, path), f.data, f.meta);

beforeAll(async () => {
  env = await createEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await seed(env);
});

describe("upload authorization", () => {
  it("members of every role can upload into their own business folder", async () => {
    for (const uid of [USERS.ownerA, USERS.adminA, USERS.managerA, USERS.editorA]) {
      await assertSucceeds(upload(storageAs(uid), `businesses/${BIZ_A}/media/${uid}.png`));
    }
  });

  it("unauthenticated users cannot upload", async () => {
    await assertFails(upload(anonStorage(), `businesses/${BIZ_A}/media/a.png`));
  });

  it("users cannot upload into another business (both directions)", async () => {
    await assertFails(upload(storageAs(USERS.ownerA), `businesses/${BIZ_B}/media/a.png`));
    await assertFails(upload(storageAs(USERS.ownerB), `businesses/${BIZ_A}/media/a.png`));
  });

  it("authenticated non-members cannot upload", async () => {
    await assertFails(upload(storageAs(USERS.outsider), `businesses/${BIZ_A}/media/a.png`));
  });

  it("uploads outside the media folder are rejected", async () => {
    const s = storageAs(USERS.ownerA);
    await assertFails(upload(s, `businesses/${BIZ_A}/other/a.png`));
    await assertFails(upload(s, `businesses/${BIZ_A}/media/nested/a.png`));
    await assertFails(upload(s, `random/a.png`));
  });
});

describe("file validation", () => {
  const s = () => storageAs(USERS.ownerA);

  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s", async (contentType) => {
    await assertSucceeds(
      upload(s(), `businesses/${BIZ_A}/media/ok-${contentType.split("/")[1]}`, {
        data: bytes(100),
        meta: { contentType },
      }),
    );
  });

  it.each(["image/gif", "image/svg+xml", "application/pdf", "text/html", "application/octet-stream"])(
    "rejects %s",
    async (contentType) => {
      await assertFails(
        upload(s(), `businesses/${BIZ_A}/media/bad`, { data: bytes(100), meta: { contentType } }),
      );
    },
  );

  it("rejects files above the 10 MB hard cap, accepts just under it", async () => {
    await assertFails(upload(s(), `businesses/${BIZ_A}/media/big.png`, png(10 * 1024 * 1024 + 1)));
    await assertSucceeds(upload(s(), `businesses/${BIZ_A}/media/edge.png`, png(10 * 1024 * 1024 - 1024)));
  });

  it("rejects empty files", async () => {
    await assertFails(upload(s(), `businesses/${BIZ_A}/media/empty.png`, png(0)));
  });
});

describe("immutability, reads and deletion", () => {
  const path = `businesses/${BIZ_A}/media/existing.png`;

  const seedObject = () =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), path), bytes(64), { contentType: "image/png" });
    });

  beforeEach(seedObject);

  it("existing objects cannot be overwritten", async () => {
    await assertFails(upload(storageAs(USERS.ownerA), path));
  });

  it("media is publicly readable (storefront assets)", async () => {
    await assertSucceeds(getBytes(ref(anonStorage(), path)));
  });

  it("OWNER, ADMIN and MANAGER can delete", async () => {
    for (const uid of [USERS.ownerA, USERS.adminA, USERS.managerA]) {
      await seedObject();
      await assertSucceeds(deleteObject(ref(storageAs(uid), path)));
    }
  });

  it("EDITOR, outsiders, other tenants and anonymous cannot delete", async () => {
    await assertFails(deleteObject(ref(storageAs(USERS.editorA), path)));
    await assertFails(deleteObject(ref(storageAs(USERS.outsider), path)));
    await assertFails(deleteObject(ref(storageAs(USERS.ownerB), path)));
    await assertFails(deleteObject(ref(anonStorage(), path)));
  });

  it("a removed member loses upload rights", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      deleteDoc(doc(ctx.firestore(), `businesses/${BIZ_A}/members/${USERS.editorA}`)),
    );
    await assertFails(upload(storageAs(USERS.editorA), `businesses/${BIZ_A}/media/late.png`));
  });
});
