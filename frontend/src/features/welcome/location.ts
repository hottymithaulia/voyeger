import { AVAILABLE_CITIES } from "@/config/city";
import { getMeta, getPlaces, isPackReady, setMeta } from "@/data/repo";
import { distanceKm } from "@/features/nudge/logic";
import { hasValidGeo } from "@/lib/geo";
import type { CityConfig, Place, PlaceGeo } from "@/types";

export type GeoPoint = { lat: number; lng: number };

export const USER_LOCATION_META_KEY = "user_location";
export const MAX_NEAREST_ANCHOR_KM = 50;

export interface CachedUserLocation {
  coords?: GeoPoint | undefined;
  city?: string | undefined;
  state?: string | undefined;
  updatedAt?: string | undefined;
}

export interface ResolvedUserLocation {
  coords?: GeoPoint | undefined;
  city?: string | undefined;
  state?: string | undefined;
  source: "geolocation" | "cache" | "selected" | "none";
}

export type HomepageLocationScenario =
  | "matched_city"
  | "unavailable_map"
  | "state_only"
  | "unknown";

export interface HomepageLocationContext {
  scenario: HomepageLocationScenario;
  headingEn: string;
  headingHi: string;
  userLocation: ResolvedUserLocation;
  matchedCity: CityConfig | null;
  availableInstalledCity: CityConfig | null;
  nearestAnchor: Place | null;
  nearestDistanceKm: number | null;
}

interface RegionBox {
  stateEn: string;
  stateHi: string;
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Coarse offline fallback lookup for Indian states/UTs when reverse geocoding
 * is unavailable without an external paid service. City coverage still uses
 * authoritative AVAILABLE_CITIES + pack metadata rather than inferring coverage.
 */
const INDIA_STATE_BOXES: readonly RegionBox[] = [
  { stateEn: "Delhi", stateHi: "दिल्ली", south: 28.4, west: 76.84, north: 28.89, east: 77.35 },
  { stateEn: "Chandigarh", stateHi: "चंडीगढ़", south: 30.67, west: 76.7, north: 30.8, east: 76.85 },
  { stateEn: "Goa", stateHi: "गोवा", south: 14.89, west: 73.68, north: 15.8, east: 74.34 },
  { stateEn: "Kerala", stateHi: "केरल", south: 8.17, west: 74.86, north: 12.79, east: 77.41 },
  { stateEn: "Karnataka", stateHi: "कर्नाटक", south: 11.59, west: 74.05, north: 18.47, east: 78.59 },
  { stateEn: "Tamil Nadu", stateHi: "तमिलनाडु", south: 8.07, west: 76.23, north: 13.56, east: 80.35 },
  { stateEn: "Telangana", stateHi: "तेलंगाना", south: 15.84, west: 77.24, north: 19.92, east: 81.32 },
  { stateEn: "Andhra Pradesh", stateHi: "आंध्र प्रदेश", south: 12.62, west: 76.76, north: 19.16, east: 84.76 },
  { stateEn: "Maharashtra", stateHi: "महाराष्ट्र", south: 15.6, west: 72.65, north: 22.03, east: 80.89 },
  { stateEn: "Gujarat", stateHi: "गुजरात", south: 20.12, west: 68.16, north: 24.71, east: 74.48 },
  { stateEn: "Madhya Pradesh", stateHi: "मध्य प्रदेश", south: 21.08, west: 74.03, north: 26.87, east: 82.81 },
  { stateEn: "Rajasthan", stateHi: "राजस्थान", south: 23.06, west: 69.5, north: 30.2, east: 78.28 },
  { stateEn: "Uttar Pradesh", stateHi: "उत्तर प्रदेश", south: 23.87, west: 77.09, north: 30.41, east: 84.63 },
  { stateEn: "West Bengal", stateHi: "पश्चिम बंगाल", south: 21.52, west: 85.82, north: 27.22, east: 89.88 },
  { stateEn: "Bihar", stateHi: "बिहार", south: 24.28, west: 83.33, north: 27.52, east: 88.29 },
  { stateEn: "Odisha", stateHi: "ओडिशा", south: 17.78, west: 81.37, north: 22.57, east: 87.48 },
  { stateEn: "Punjab", stateHi: "पंजाब", south: 29.55, west: 73.88, north: 32.51, east: 76.93 },
  { stateEn: "Haryana", stateHi: "हरियाणा", south: 27.65, west: 74.46, north: 30.93, east: 77.6 },
  { stateEn: "Uttarakhand", stateHi: "उत्तराखंड", south: 28.72, west: 77.57, north: 31.46, east: 81.03 },
  { stateEn: "Himachal Pradesh", stateHi: "हिमाचल प्रदेश", south: 30.38, west: 75.59, north: 33.26, east: 79.01 },
  { stateEn: "Chhattisgarh", stateHi: "छत्तीसगढ़", south: 17.78, west: 80.24, north: 24.12, east: 84.4 },
  { stateEn: "Jharkhand", stateHi: "झारखंड", south: 21.97, west: 83.32, north: 25.35, east: 87.95 },
  { stateEn: "Assam", stateHi: "असम", south: 24.13, west: 89.7, north: 27.97, east: 96.02 },
];

const CITY_STATE_BY_ID: Record<string, { en: string; hi: string }> = {
  bhopal: { en: "Madhya Pradesh", hi: "मध्य प्रदेश" },
};

export function isPointInBounds(coords: GeoPoint, bounds: CityConfig["bounds"]): boolean {
  return (
    coords.lat >= bounds.south &&
    coords.lat <= bounds.north &&
    coords.lng >= bounds.west &&
    coords.lng <= bounds.east
  );
}

export function resolveCityByCoords(
  coords: GeoPoint,
  cities: readonly CityConfig[] = AVAILABLE_CITIES,
): CityConfig | null {
  return cities.find((city) => isPointInBounds(coords, city.bounds)) ?? null;
}

export function resolveStateFromCoords(coords: GeoPoint): { en: string; hi: string } | null {
  for (const box of INDIA_STATE_BOXES) {
    if (
      coords.lat >= box.south &&
      coords.lat <= box.north &&
      coords.lng >= box.west &&
      coords.lng <= box.east
    ) {
      return { en: box.stateEn, hi: box.stateHi };
    }
  }
  return null;
}

function normalizeCache(raw: unknown): CachedUserLocation | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  const rawCoords = candidate["coords"] as PlaceGeo | null | undefined;
  const coords = hasValidGeo(rawCoords)
    ? { lat: rawCoords.lat, lng: rawCoords.lng }
    : undefined;
  const rawCity = candidate["city"];
  const city = typeof rawCity === "string" && rawCity.trim() ? rawCity.trim() : undefined;
  const rawState = candidate["state"];
  const state = typeof rawState === "string" && rawState.trim() ? rawState.trim() : undefined;
  const rawUpdatedAt = candidate["updatedAt"];
  const updatedAt = typeof rawUpdatedAt === "string" ? rawUpdatedAt : undefined;
  if (!coords && !city && !state) return null;
  return { coords, city, state, updatedAt };
}

export function findNearestAnchor(
  coords: GeoPoint | undefined,
  matchedCity: CityConfig | null,
  places: readonly Place[],
  maxDistanceKm = MAX_NEAREST_ANCHOR_KM,
): { anchor: Place; distanceKm: number } | null {
  if (!coords || !hasValidGeo(coords) || !matchedCity) return null;
  if (!isPointInBounds(coords, matchedCity.bounds)) return null;

  let bestAnchor: Place | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const place of places) {
    if (!place.is_anchor || place.deleted || !hasValidGeo(place.geo)) continue;
    if (!isPointInBounds(place.geo, matchedCity.bounds)) continue;
    const dist = distanceKm(coords, place.geo);
    if (dist <= maxDistanceKm && dist < bestDistance) {
      bestDistance = dist;
      bestAnchor = place;
    }
  }

  return bestAnchor ? { anchor: bestAnchor, distanceKm: bestDistance } : null;
}

/**
 * Reads browser geolocation ONLY when permission is already "granted", never
 * triggering an unsolicited permission prompt on homepage load.
 */
async function readGrantedGeolocation(timeoutMs = 3500): Promise<GeoPoint | null> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return null;
  try {
    if (!("permissions" in navigator) || typeof navigator.permissions?.query !== "function") {
      return null;
    }
    const status = await navigator.permissions.query({ name: "geolocation" });
    if (status.state !== "granted") return null;
  } catch {
    return null;
  }

  return await new Promise<GeoPoint | null>((resolve) => {
    let settled = false;
    const finish = (value: GeoPoint | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = globalThis.setTimeout(() => finish(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        globalThis.clearTimeout(timer);
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        finish(hasValidGeo(coords) ? coords : null);
      },
      () => {
        globalThis.clearTimeout(timer);
        finish(null);
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: timeoutMs },
    );
  });
}

export interface ResolveHomepageDeps {
  packReady?: boolean | undefined;
  explicitCityId?: string | undefined;
  cachedLocation?: CachedUserLocation | null | undefined;
  liveCoords?: GeoPoint | null | undefined;
  places?: Place[] | undefined;
  skipPermissionQuery?: boolean | undefined;
}

export async function resolveHomepageContext(
  deps: ResolveHomepageDeps = {},
): Promise<HomepageLocationContext> {
  const [packReady, explicitCityId, rawCached, places] = await Promise.all([
    deps.packReady !== undefined ? Promise.resolve(deps.packReady) : isPackReady().catch(() => false),
    deps.explicitCityId !== undefined
      ? Promise.resolve(deps.explicitCityId)
      : getMeta<string>("active_city").catch(() => undefined),
    deps.cachedLocation !== undefined
      ? Promise.resolve(deps.cachedLocation)
      : getMeta<unknown>(USER_LOCATION_META_KEY).catch(() => undefined),
    deps.places !== undefined ? Promise.resolve(deps.places) : getPlaces().catch(() => [] as Place[]),
  ]);

  const installedCities = packReady ? AVAILABLE_CITIES : [];
  const availableInstalledCity = installedCities[0] ?? null;
  const cached = normalizeCache(rawCached);

  const liveCoords =
    deps.liveCoords !== undefined
      ? deps.liveCoords
      : deps.skipPermissionQuery
        ? null
        : await readGrantedGeolocation();

  // Persist freshly obtained granted coordinates for offline reuse.
  if (liveCoords && deps.liveCoords === undefined) {
    const detectedCity = resolveCityByCoords(liveCoords, AVAILABLE_CITIES);
    const detectedState = resolveStateFromCoords(liveCoords);
    void setMeta(USER_LOCATION_META_KEY, {
      coords: liveCoords,
      city: detectedCity?.name.en,
      state: detectedState?.en,
      updatedAt: new Date().toISOString(),
    } satisfies CachedUserLocation).catch(() => undefined);
  }

  const effectiveCoords = liveCoords ?? cached?.coords;
  const explicitCity = explicitCityId
    ? AVAILABLE_CITIES.find((city) => city.id === explicitCityId) ?? null
    : null;

  // 1. Live or cached coordinates decide actual physical presence cleanly first.
  if (effectiveCoords && hasValidGeo(effectiveCoords)) {
    const cityInAvailable = resolveCityByCoords(effectiveCoords, AVAILABLE_CITIES);
    const cityInInstalled = resolveCityByCoords(effectiveCoords, installedCities);
    const regionState = resolveStateFromCoords(effectiveCoords);
    const resolvedStateEn =
      (cityInAvailable ? CITY_STATE_BY_ID[cityInAvailable.id]?.en : undefined) ??
      regionState?.en ??
      cached?.state;
    const resolvedStateHi =
      (cityInAvailable ? CITY_STATE_BY_ID[cityInAvailable.id]?.hi : undefined) ??
      regionState?.hi ??
      resolvedStateEn;

    if (cityInInstalled) {
      const nearest = findNearestAnchor(effectiveCoords, cityInInstalled, places);
      return {
        scenario: "matched_city",
        headingEn: cityInInstalled.name.en.toUpperCase(),
        headingHi: cityInInstalled.name.hi,
        userLocation: {
          coords: effectiveCoords,
          city: cityInInstalled.name.en,
          state: resolvedStateEn,
          source: liveCoords ? "geolocation" : "cache",
        },
        matchedCity: cityInInstalled,
        availableInstalledCity,
        nearestAnchor: nearest?.anchor ?? null,
        nearestDistanceKm: nearest?.distanceKm ?? null,
      };
    }

    // Coordinates exist, but corresponding city map is not downloaded/available.
    if (resolvedStateEn) {
      return {
        scenario: "unavailable_map",
        headingEn: resolvedStateEn.toUpperCase(),
        headingHi: resolvedStateHi ?? resolvedStateEn,
        userLocation: {
          coords: effectiveCoords,
          city: cached?.city,
          state: resolvedStateEn,
          source: liveCoords ? "geolocation" : "cache",
        },
        matchedCity: null,
        availableInstalledCity,
        nearestAnchor: null,
        nearestDistanceKm: null,
      };
    }
  }

  // 2. Cached location metadata without coordinates (city/state only).
  if (cached && (cached.city || cached.state)) {
    const matchedInstalled = cached.city
      ? installedCities.find(
          (city) => city.name.en.toLowerCase() === cached.city!.toLowerCase(),
        ) ?? null
      : null;

    if (matchedInstalled) {
      return {
        scenario: "matched_city",
        headingEn: matchedInstalled.name.en.toUpperCase(),
        headingHi: matchedInstalled.name.hi,
        userLocation: {
          city: matchedInstalled.name.en,
          state: cached.state ?? CITY_STATE_BY_ID[matchedInstalled.id]?.en,
          source: "cache",
        },
        matchedCity: matchedInstalled,
        availableInstalledCity,
        nearestAnchor: null,
        nearestDistanceKm: null,
      };
    }

    if (cached.state) {
      const knownState = INDIA_STATE_BOXES.find(
        (box) => box.stateEn.toLowerCase() === cached.state!.toLowerCase(),
      );
      return {
        scenario: cached.city ? "unavailable_map" : "state_only",
        headingEn: cached.state.toUpperCase(),
        headingHi: knownState?.stateHi ?? cached.state,
        userLocation: {
          city: cached.city,
          state: cached.state,
          source: "cache",
        },
        matchedCity: null,
        availableInstalledCity,
        nearestAnchor: null,
        nearestDistanceKm: null,
      };
    }
  }

  // 3. Explicitly selected installed city context (only when no conflicting physical location exists).
  if (explicitCity && installedCities.some((city) => city.id === explicitCity.id)) {
    return {
      scenario: "matched_city",
      headingEn: explicitCity.name.en.toUpperCase(),
      headingHi: explicitCity.name.hi,
      userLocation: {
        city: explicitCity.name.en,
        source: "selected",
      },
      matchedCity: explicitCity,
      availableInstalledCity,
      nearestAnchor: null,
      nearestDistanceKm: null,
    };
  }

  // 4. Safe fallback when location cannot be determined.
  return {
    scenario: "unknown",
    headingEn: "TRAVELLER",
    headingHi: "यात्री",
    userLocation: {
      source: "none",
    },
    matchedCity: null,
    availableInstalledCity,
    nearestAnchor: null,
    nearestDistanceKm: null,
  };
}
