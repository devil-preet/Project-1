import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allPlans } from "@/lib/catalog/query-plan";

/**
 * The Firestore emulator does NOT enforce indexes, so a missing index only fails in
 * production (FAILED_PRECONDITION). This test is the offline safety net: every
 * collection-group query in src/ must be backed by an index defined in
 * firestore.indexes.json, and firebase.json must actually deploy that file.
 */
type Scope = "COLLECTION" | "COLLECTION_GROUP";
interface IndexFile {
  indexes: { collectionGroup: string; queryScope: Scope; fields: { fieldPath: string }[] }[];
  fieldOverrides: { collectionGroup: string; fieldPath: string; indexes: { order?: string; arrayConfig?: string; queryScope: Scope }[] }[];
}

const root = path.resolve(__dirname, "../..");
const indexFile = JSON.parse(readFileSync(path.join(root, "firestore.indexes.json"), "utf8")) as IndexFile;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

/** Finds `collectionGroup("x").where("a", ...).where("b", ...)` chains in application code. */
function collectionGroupQueries(): { file: string; group: string; fields: string[] }[] {
  const out: { file: string; group: string; fields: string[] }[] = [];
  const re = /collectionGroup\(\s*["'](\w+)["']\s*\)((?:\s*\.where\(\s*["'][\w.]+["'][^)]*\))*)/g;
  for (const file of sourceFiles(path.join(root, "src"))) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(re)) {
      const fields = [...m[2].matchAll(/\.where\(\s*["']([\w.]+)["']/g)].map((x) => x[1]);
      out.push({ file: path.relative(root, file), group: m[1], fields });
    }
  }
  return out;
}

describe("Firestore index configuration", () => {
  it("firebase.json deploys firestore.indexes.json", () => {
    const fb = JSON.parse(readFileSync(path.join(root, "firebase.json"), "utf8"));
    expect(fb.firestore.indexes).toBe("firestore.indexes.json");
    expect(statSync(path.join(root, "firestore.indexes.json")).isFile()).toBe(true);
  });

  it("contains no composite index that Firestore would reject (needs 2+ fields, no duplicates)", () => {
    // A "composite" index over a single field is rejected at deploy time (HTTP 400
    // "this index is not necessary, configure using single field index controls").
    const sig = (i: IndexFile["indexes"][number]) => `${i.collectionGroup}|${i.queryScope}|${i.fields.map((f) => f.fieldPath).join(",")}`;
    const seen = new Set<string>();
    for (const i of indexFile.indexes) {
      const real = i.fields.filter((f) => f.fieldPath !== "__name__");
      expect(real.length, `single-field "composite" index: ${sig(i)}`).toBeGreaterThanOrEqual(2);
      expect(seen.has(sig(i)), `duplicate index: ${sig(i)}`).toBe(false);
      seen.add(sig(i));
    }
  });

  it("defines the members.uid single-field exemption with COLLECTION_GROUP scope, ascending", () => {
    const o = indexFile.fieldOverrides.find((f) => f.collectionGroup === "members" && f.fieldPath === "uid");
    expect(o, "missing fieldOverride for members.uid").toBeDefined();
    expect(o!.indexes).toContainEqual({ order: "ASCENDING", queryScope: "COLLECTION_GROUP" });
  });

  it("the application actually uses that collection-group query (keeps this guard honest)", () => {
    const q = collectionGroupQueries();
    expect(q.some((x) => x.group === "members" && x.fields.join() === "uid")).toBe(true);
  });

  it("every catalogue query plan (admin lists + storefront) is covered by a composite index", () => {
    // Plans come from the same module the services build their queries from. A plan with equality
    // filters plus an orderBy needs a COLLECTION composite index containing all those fields; a plan
    // with no equality filter is served by Firestore's automatic single-field indexes.
    const missing = new Set<string>();
    for (const plan of allPlans()) {
      if (plan.equality.length === 0) continue;
      const group = plan.equality.includes("active") ? "categories" : "products";
      const want = [...plan.equality, plan.orderBy];
      const ok = indexFile.indexes.some(
        (i) =>
          i.collectionGroup === group &&
          i.queryScope === "COLLECTION" &&
          i.fields.length === want.length &&
          want.every((f) => i.fields.some((x) => x.fieldPath === f)),
      );
      if (!ok) missing.add(`${group}: ${want.join(" + ")}`);
    }
    expect([...missing], `missing indexes:\n${[...missing].join("\n")}`).toEqual([]);
  });

  it("every collection-group query in src/ is covered by an index in firestore.indexes.json", () => {
    const missing: string[] = [];
    for (const q of collectionGroupQueries()) {
      if (q.fields.length === 0) continue; // unfiltered scans need no index
      if (q.fields.length === 1) {
        const ok = indexFile.fieldOverrides.some(
          (f) =>
            f.collectionGroup === q.group &&
            f.fieldPath === q.fields[0] &&
            f.indexes.some((i) => i.queryScope === "COLLECTION_GROUP" && (i.order === "ASCENDING" || i.arrayConfig)),
        );
        if (!ok) missing.push(`${q.file}: ${q.group}.${q.fields[0]} needs a COLLECTION_GROUP fieldOverride`);
      } else {
        const ok = indexFile.indexes.some(
          (i) =>
            i.collectionGroup === q.group &&
            i.queryScope === "COLLECTION_GROUP" &&
            q.fields.every((f) => i.fields.some((x) => x.fieldPath === f)),
        );
        if (!ok) missing.push(`${q.file}: ${q.group}(${q.fields.join(", ")}) needs a COLLECTION_GROUP composite index`);
      }
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });
});
