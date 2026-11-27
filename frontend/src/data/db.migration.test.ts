import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VoyegerDatabase, db } from "@/data/db";
import { getDiscoveryStats, recordDiscovery } from "@/data/repo";
import { clearOfflineCaches } from "@/features/settings/SettingsPage";
import { makeTestPlace } from "@/test/place-fixture";

beforeEach(async () => {
  await db.delete();
});

afterEach(async () => {
  await db.delete();
  vi.unstubAllGlobals();
});

describe("Dexie v1 to v2 migration and cache clearing", () => {
  it("upgrades an existing v1 database without losing places, saved, outbox, or meta rows", async () => {
    const v1 = new Dexie("voyeger-bhopal");
    v1.version(1).stores({
      places: "id, slug, category, deleted, partner_id, *tags",
      partners: "id, type",
      text: "[placeId+lang], placeId, lang",
      media_meta: "id, place_id",
      meta: "key",
      outbox: "++id, idempotency_id, kind, created_at, retry_at",
      saved: "placeId, saved_at",
      events: "id, type, ts",
    });
    await v1.open();

    const samplePlace = makeTestPlace({ id: "v1-place", slug: "v1-place" });
    await v1.table("places").put(samplePlace);
    await v1.table("saved").put({ placeId: "v1-place", saved_at: "2026-11-27T10:00:00Z" });
    await v1.table("outbox").add({
      idempotency_id: "outbox-v1-1",
      kind: "event",
      payload: {
        id: "outbox-v1-1",
        type: "view",
        place_id: "v1-place",
        ts: "2026-11-27T10:00:00Z",
        session_id: "sess-v1",
      },
      created_at: "2026-11-27T10:00:00Z",
      retry_at: 0,
      attempts: 0,
    });
    await v1.table("meta").bulkPut([
      { key: "content_version", value: 1 },
      { key: "pack_state", value: "ready" },
    ]);
    v1.close();

    const upgraded = new VoyegerDatabase();
    await upgraded.open();
    expect(upgraded.verno).toBe(2);

    expect(await upgraded.places.get("v1-place")).toEqual(samplePlace);
    expect(await upgraded.saved.get("v1-place")).toEqual({
      placeId: "v1-place",
      saved_at: "2026-11-27T10:00:00Z",
    });
    const outboxRows = await upgraded.outbox.toArray();
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]?.idempotency_id).toBe("outbox-v1-1");
    expect((await upgraded.meta.get("content_version"))?.value).toBe(1);
    expect((await upgraded.meta.get("pack_state"))?.value).toBe("ready");

    await upgraded.discoveries.put({
      placeId: "v1-place",
      category: samplePlace.category,
      isAnchor: false,
      xp: 30,
      discoveredAt: "2026-11-27T10:05:00Z",
    });
    expect((await upgraded.discoveries.get("v1-place"))?.xp).toBe(30);
    upgraded.close();
  });

  it("preserves the discoveries table when Settings > Clear cache clears Cache Storage", async () => {
    await db.open();
    const gem = makeTestPlace({ id: "gauhar-mahal", slug: "gauhar-mahal", category: "hidden_gem" });
    await recordDiscovery(gem);

    const deletedCaches: string[] = [];
    vi.stubGlobal("caches", {
      keys: async () => ["img-v1", "map-tiles-v1", "voyeger-pack-json", "voyeger-api", "unrelated-cache"],
      delete: async (name: string) => {
        deletedCaches.push(name);
        return true;
      },
    });

    await clearOfflineCaches();

    expect(deletedCaches).toEqual(["img-v1", "map-tiles-v1", "voyeger-pack-json", "voyeger-api"]);
    const stats = await getDiscoveryStats();
    expect(stats.totalXp).toBe(30);
    expect(stats.totalDiscoveries).toBe(1);
  });
});
