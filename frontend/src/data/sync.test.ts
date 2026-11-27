import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/data/db";
import { applyDeltaTransaction, applyEnrichmentToPlace } from "@/data/sync";
import type { Delta, Manifest } from "@/types";
import { makeTestPlace } from "@/test/place-fixture";

const manifest: Manifest = {
  version: 2,
  built_at: "2026-11-27T00:00:00Z",
  min_app_version: "1.0.0",
  files: [],
  languages: ["en", "hi"],
  total_bytes: 0,
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe("safe local content updates", () => {
  it("writes enrichment without replacing curated place fields", () => {
    const curated = makeTestPlace();
    const updated = applyEnrichmentToPlace(curated, {
      osm: { note: "Web reference" },
      fetched_at: "2026-11-27T12:00:00Z",
    });

    expect(updated.i18n.en.title).toBe("Curated title");
    expect(updated.category).toBe("hidden_gem");
    expect(updated.geo).toEqual({ lat: 23.25, lng: 77.4 });
    expect(updated.enrichment.osm).toEqual({ url: "https://www.openstreetmap.org/old", note: "Web reference" });
  });

  it("rolls back every changed record and the version when a delta fails mid-transaction", async () => {
    const first = makeTestPlace();
    const second = makeTestPlace({ id: "second-place", slug: "second-place" });
    await db.places.bulkPut([first, second]);
    await db.meta.put({ key: "content_version", value: 1 });
    const changedFirst = makeTestPlace({ i18n: { ...first.i18n, en: { ...first.i18n.en, title: "New title" } } });
    const changedSecond = makeTestPlace({ id: second.id, slug: second.slug, i18n: { ...second.i18n, en: { ...second.i18n.en, title: "Second title" } } });
    const delta: Delta = { from: 1, to: 2, places: [changedFirst, changedSecond], partners: [], text: {}, deleted_ids: [] };

    await expect(applyDeltaTransaction(delta, manifest, "en", true)).rejects.toThrow("previous pack is still active");

    expect((await db.places.get(first.id))?.i18n.en.title).toBe("Curated title");
    expect((await db.places.get(second.id))?.i18n.en.title).toBe("Curated title");
    expect((await db.meta.get("content_version"))?.value).toBe(1);
  });
});