import { db } from "@/data/db";
import { getMeta, setMeta } from "@/data/repo";
import { api, apiMode } from "@/net/api";
import { consumeMockMidwayFailure } from "@/net/mockApi";
import type { Delta, Enrichment, Language, Manifest, PackPayload, Place } from "@/types";

const APP_VERSION = "1.0.0";
const SIX_HOURS = 6 * 60 * 60 * 1000;

export type TransferProgress = { loaded: number; total: number; label: "core" | "images" | "tiles" };

export function mergeEnrichment(current: Enrichment, incoming: Enrichment): Enrichment {
  return {
    ...current,
    ...(incoming.osm ? { osm: { ...current.osm, ...incoming.osm } } : {}),
    ...(incoming.wikivoyage ? { wikivoyage: { ...current.wikivoyage, ...incoming.wikivoyage } } : {}),
    ...(incoming.fetched_at ? { fetched_at: incoming.fetched_at } : {}),
  };
}

export function applyEnrichmentToPlace(place: Place, incoming: Enrichment): Place {
  return { ...place, enrichment: mergeEnrichment(place.enrichment, incoming) };
}

function textRows(payload: PackPayload, language: Language) {
  return Object.entries(payload.text).flatMap(([placeId, languages]) => {
    const copy = languages[language];
    return copy ? [{ placeId, lang: language, ...copy }] : [];
  });
}

async function writePack(payload: PackPayload, manifest: Manifest, language: Language): Promise<void> {
  await db.transaction("rw", db.places, db.partners, db.text, db.meta, async () => {
    await db.places.clear();
    await db.partners.clear();
    await db.text.clear();
    await db.places.bulkPut(payload.places);
    await db.partners.bulkPut(payload.partners);
    await db.text.bulkPut(textRows(payload, language));
    const prior = (await db.meta.get("languages_installed"))?.value;
    const languages = Array.isArray(prior) ? prior.filter((value): value is Language => value === "en" || value === "hi") : [];
    const installed = Array.from(new Set([...languages, language]));
    await db.meta.bulkPut([
      { key: "content_version", value: manifest.version },
      { key: "languages_installed", value: installed },
      { key: "last_sync_at", value: new Date().toISOString() },
      { key: "pack_state", value: "ready" },
      { key: "pack_manifest", value: manifest },
      { key: "active_language", value: language },
      { key: "app_version", value: APP_VERSION },
      { key: "synced_api_mode", value: apiMode },
    ]);
  });
}

export async function loadManifest(): Promise<Manifest> {
  const manifest = await api.getManifest();
  await setMeta("remote_manifest", manifest);
  return manifest;
}

export async function installPack(
  language: Language,
  onProgress: (progress: TransferProgress) => void,
): Promise<Manifest> {
  const manifest = await api.getManifest();
  if (!manifest.languages.includes(language)) throw new Error("This language is not included in the Bhopal pack.");
  await setMeta("pack_state", "downloading");
  try {
    onProgress({ loaded: 0, total: 4, label: "core" });
    const payload = await api.getPack(manifest.version, language);
    onProgress({ loaded: 3, total: 4, label: "core" });
    await writePack(payload, manifest, language);
    onProgress({ loaded: 4, total: 4, label: "core" });
    if (typeof navigator !== "undefined" && "storage" in navigator) {
      await navigator.storage.persist().catch(() => false);
    }
    void downloadBackgroundAssets(manifest, onProgress);
    return manifest;
  } catch (error) {
    const currentVersion = await getMeta<number>("content_version");
    await setMeta("pack_state", currentVersion ? "ready" : "empty");
    throw error;
  }
}

export async function downloadBackgroundAssets(
  manifest: Manifest,
  onProgress: (progress: TransferProgress) => void = () => {},
): Promise<void> {
  const report = (progress: TransferProgress) => {
    onProgress(progress);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("voyeger:transfer-progress", { detail: progress }));
  };
  const imageFiles = manifest.files.filter((file) => /\/images\/.*\.(?:webp|png|jpg|jpeg)$/i.test(file.path));
  if (imageFiles.length > 0 && typeof caches !== "undefined") {
    const cache = await caches.open(`img-v${manifest.version}`);
    for (let index = 0; index < imageFiles.length; index += 1) {
      const file = imageFiles[index];
      if (!file) continue;
      try {
        const bytes = await api.getAsset(file);
        const response = new Response(bytes, { headers: { "content-type": "image/webp" } });
        await cache.put(file.path, response);
        await db.media_meta.put({ id: file.path, place_id: "", file: file.path, bytes: file.bytes, verified_at: new Date().toISOString() });
      } catch {
        // Place photos remain requestable by the page and the service worker when online.
      }
      report({ loaded: index + 1, total: imageFiles.length, label: "images" });
    }
  }
  await downloadTileArchive(report);
}

async function downloadTileArchive(onProgress: (progress: TransferProgress) => void): Promise<void> {
  if (typeof window === "undefined" || typeof caches === "undefined") return;
  const url = import.meta.env["VITE_TILES_URL"] || "/tiles/bhopal.pmtiles";
  try {
    const response = await fetch(url);
    if (!response.ok || !response.body) return;
    const total = Number(response.headers.get("content-length")) || 0;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      if (!result.value) continue;
      chunks.push(result.value);
      loaded += result.value.byteLength;
      onProgress({ loaded, total, label: "tiles" });
    }
    const headers = new Headers(response.headers);
    const archive = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      archive.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const cache = await caches.open("map-tiles-v1");
    await cache.put(url, new Response(new Blob([archive.buffer]), { status: 200, headers }));
    onProgress({ loaded: total || loaded, total: total || loaded, label: "tiles" });
  } catch {
    // The real tile archive is supplied later; marker-only map rendering remains available.
  }
}

export async function syncNow(): Promise<{ updated: boolean; version: number }> {
  try {
    const result = await performSync();
    await db.meta.bulkPut([
      { key: "sync_attempts", value: 0 },
      { key: "sync_retry_at", value: 0 },
    ]);
    return result;
  } catch (error) {
    const attempts = (await getMeta<number>("sync_attempts")) ?? 0;
    const nextAttempts = attempts + 1;
    const delay = Math.min(1000 * 2 ** nextAttempts, 6 * 60 * 60 * 1000);
    await db.meta.bulkPut([
      { key: "sync_attempts", value: nextAttempts },
      { key: "sync_retry_at", value: Date.now() + delay },
    ]);
    throw error;
  }
}

async function performSync(): Promise<{ updated: boolean; version: number }> {
  const manifest = await api.getManifest();
  await setMeta("remote_manifest", manifest);
  const currentVersion = (await getMeta<number>("content_version")) ?? 0;
  if (manifest.min_app_version.localeCompare(APP_VERSION, undefined, { numeric: true }) > 0) {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("voyeger:reload-required"));
  }
  const hasLegacySample = currentVersion === 1 && Boolean(await db.places.get("upper-lake"));
  if (manifest.version === currentVersion && !hasLegacySample) {
    await setMeta("last_sync_at", new Date().toISOString());
    return { updated: false, version: currentVersion };
  }
  const language = (await getMeta<Language>("active_language")) ?? "en";
  const distance = manifest.version - currentVersion;
  if (!hasLegacySample && currentVersion > 0 && distance > 0 && distance <= 5) {
    try {
      const delta = await api.getDelta(currentVersion, manifest.version);
      await applyDelta(delta, language);
    } catch {
      const payload = await api.getPack(manifest.version, language);
      await writePack(payload, manifest, language);
    }
  } else {
    const payload = await api.getPack(manifest.version, language);
    await writePack(payload, manifest, language);
  }
  void downloadBackgroundAssets(manifest);
  return { updated: true, version: manifest.version };
}

export async function applyDelta(delta: Delta, language: Language): Promise<void> {
  if (delta.to <= delta.from || delta.places.length === 0 && delta.deleted_ids.length === 0 && delta.partners.length === 0) {
    throw new Error("The content update is incomplete.");
  }
  const manifest = await api.getManifest();
  const failMidway = apiMode === "mock" && consumeMockMidwayFailure();
  await applyDeltaTransaction(delta, manifest, language, failMidway);
}

export async function applyDeltaTransaction(
  delta: Delta,
  manifest: Manifest,
  language: Language,
  failAfterFirstPlace = false,
): Promise<void> {
  await db.transaction("rw", db.places, db.partners, db.text, db.meta, async () => {
    for (let index = 0; index < delta.places.length; index += 1) {
      const place = delta.places[index];
      if (!place) continue;
      const current = await db.places.get(place.id);
      await db.places.put(current ? { ...place, enrichment: mergeEnrichment(current.enrichment, place.enrichment) } : place);
      if (index === 0 && failAfterFirstPlace) {
        throw new Error("Sample sync failed mid-update; the previous pack is still active.");
      }
    }
    for (const id of delta.deleted_ids) {
      const place = await db.places.get(id);
      if (place) await db.places.put({ ...place, deleted: true, updated_in_version: delta.to });
    }
    if (delta.partners.length > 0) await db.partners.bulkPut(delta.partners);
    for (const [placeId, translations] of Object.entries(delta.text)) {
      for (const [lang, copy] of Object.entries(translations)) {
        if (copy && (lang === "en" || lang === "hi")) {
          await db.text.put({ placeId, lang, ...copy });
        }
      }
    }
    await db.meta.bulkPut([
      { key: "content_version", value: delta.to },
      { key: "last_sync_at", value: new Date().toISOString() },
      { key: "pack_state", value: "ready" },
      { key: "pack_manifest", value: manifest },
      { key: "active_language", value: language },
    ]);
  });
}

export async function refreshEnrichment(placeIds: string[]): Promise<void> {
  if (placeIds.length === 0) return;
  const incoming = await api.getEnrichment(placeIds);
  await db.transaction("rw", db.places, async () => {
    for (const placeId of placeIds) {
      const place: Place | undefined = await db.places.get(placeId);
      const enrichment = incoming[placeId];
      if (!place || !enrichment) continue;
      await db.places.put(applyEnrichmentToPlace(place, enrichment));
    }
  });
}

export async function shouldSyncByTime(): Promise<boolean> {
  const retryAt = (await getMeta<number>("sync_retry_at")) ?? 0;
  if (retryAt > Date.now()) return false;
  if (await db.places.get("upper-lake")) return true;
  const syncedMode = await getMeta<string>("synced_api_mode");
  if (apiMode === "http" && syncedMode !== "http") return true;
  const lastSyncAt = await getMeta<string>("last_sync_at");
  return !lastSyncAt || Date.now() - Date.parse(lastSyncAt) >= SIX_HOURS;
}

export async function installLanguage(language: Language): Promise<void> {
  const manifest = await api.getManifest();
  const payload = await api.getPack(manifest.version, language);
  await db.transaction("rw", db.text, db.meta, async () => {
    await db.text.bulkPut(textRows(payload, language));
    const prior = (await db.meta.get("languages_installed"))?.value;
    const languages = Array.isArray(prior) ? prior.filter((value): value is Language => value === "en" || value === "hi") : [];
    await db.meta.put({ key: "languages_installed", value: Array.from(new Set([...languages, language])) });
    await db.meta.put({ key: "active_language", value: language });
  });
}