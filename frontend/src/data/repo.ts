import MiniSearch from "minisearch";

import { getCityConfig } from "@/config/city";
import { db } from "@/data/db";
import { hasValidGeo } from "@/lib/geo";
import type { CityConfig, DiscoveryStats, Language, PackBounds, Partner, Place } from "@/types";

export async function isPackReady(): Promise<boolean> {
  return (await getMeta<string>("pack_state")) === "ready";
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const record = await db.meta.get(key);
  return record?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

export async function getActiveCity(): Promise<CityConfig> {
  const cityId = await getMeta<string>("active_city").catch(() => undefined);
  return getCityConfig(cityId);
}

export async function setActiveCity(cityId: string): Promise<CityConfig> {
  const city = getCityConfig(cityId);
  await setMeta("active_city", city.id);
  return city;
}

export async function getPlaces(): Promise<Place[]> {
  return db.places.filter((place) => !place.deleted).toArray();
}

export async function getPlaceById(id: string): Promise<Place | undefined> {
  const place = await db.places.get(id);
  return place?.deleted ? undefined : place;
}

const LEGACY_SLUG_ALIASES: Record<string, string> = {
  "upper-lake": "upper-lake-bhojtal",
  "gauhar-mahal": "gohar-mahal",
  "tribal-museum": "tribal-museum-bhopal",
  "shaukat-mahal": "shaukat-mahal-sadar-manzil",
  "sadar-manzil": "shaukat-mahal-sadar-manzil",
};

export async function getPlaceBySlug(slug: string): Promise<Place | undefined> {
  const direct = await db.places.where("slug").equals(slug).first();
  if (direct && !direct.deleted) return direct;
  const alias = LEGACY_SLUG_ALIASES[slug];
  if (!alias) return undefined;
  const aliased = await db.places.where("slug").equals(alias).first();
  return aliased?.deleted ? undefined : aliased;
}

export async function placesInBounds(bounds: PackBounds): Promise<Place[]> {
  return db.places
    .filter(
      (place) =>
        !place.deleted &&
        hasValidGeo(place.geo) &&
        place.geo.lng >= bounds.west &&
        place.geo.lng <= bounds.east &&
        place.geo.lat >= bounds.south &&
        place.geo.lat <= bounds.north,
    )
    .toArray();
}

export async function getPartners(): Promise<Partner[]> {
  return db.partners.toArray();
}

export async function getPartner(id: string): Promise<Partner | undefined> {
  return db.partners.get(id);
}

export async function getSavedPlaces(): Promise<Place[]> {
  const records = await db.saved.orderBy("saved_at").reverse().toArray();
  const places = await db.places.bulkGet(records.map((record) => record.placeId));
  return places.filter((place): place is Place => Boolean(place && !place.deleted));
}

export async function isSaved(placeId: string): Promise<boolean> {
  return Boolean(await db.saved.get(placeId));
}

export async function toggleSaved(placeId: string): Promise<boolean> {
  const existing = await db.saved.get(placeId);
  if (existing) {
    await db.saved.delete(placeId);
    return false;
  }
  await db.saved.put({ placeId, saved_at: new Date().toISOString() });
  return true;
}

/**
 * Deterministic, mutually exclusive XP rules:
 * - Anchor landmark: 10 XP
 * - Food destination: 20 XP
 * - Any other non-anchor place: 30 XP (independent of hidden_gem enum)
 * Partner/sponsored links never independently award or modify XP.
 */
export function calculatePlaceXp(place: Place): number {
  if (place.is_anchor) return 10;
  if (place.category === "food") return 20;
  return 30;
}

export async function recordDiscovery(place: Place): Promise<{ awarded: boolean; xp: number }> {
  return db.transaction("rw", db.discoveries, async () => {
    const existing = await db.discoveries.get(place.id);
    if (existing) {
      return { awarded: false, xp: 0 };
    }
    const xp = calculatePlaceXp(place);
    await db.discoveries.put({
      placeId: place.id,
      category: place.category,
      isAnchor: place.is_anchor,
      xp,
      discoveredAt: new Date().toISOString(),
    });
    return { awarded: xp > 0, xp };
  });
}

export async function getDiscoveryStats(): Promise<DiscoveryStats> {
  const rows = await db.discoveries.toArray();
  let totalXp = 0;
  let hiddenGemsCount = 0;
  let lastExplorationAt: string | null = null;

  for (const row of rows) {
    totalXp += row.xp;
    if (!row.isAnchor && row.category === "hidden_gem") {
      hiddenGemsCount += 1;
    }
    if (!lastExplorationAt || row.discoveredAt > lastExplorationAt) {
      lastExplorationAt = row.discoveredAt;
    }
  }

  return {
    totalXp,
    hiddenGemsCount,
    totalDiscoveries: rows.length,
    lastExplorationAt,
  };
}

type SearchDocument = { id: string; title: string; summary: string; tags: string };

export async function searchPlaces(query: string, language: Language): Promise<Place[]> {
  const normalized = query.trim();
  if (!normalized) return [];
  const places = await getPlaces();
  const miniSearch = new MiniSearch<SearchDocument>({
    fields: ["title", "summary", "tags"],
    storeFields: ["id"],
    idField: "id",
  });
  miniSearch.addAll(
    places.map((place) => ({
      id: place.id,
      title: place.i18n[language]?.title ?? place.i18n.en.title,
      summary: place.i18n[language]?.summary ?? place.i18n.en.summary,
      tags: place.tags.join(" "),
    })),
  );
  const results = miniSearch.search(normalized);
  const byId = new Map(places.map((place) => [place.id, place]));
  return results.flatMap((result) => {
    const place = byId.get(result.id);
    return place ? [place] : [];
  });
}
