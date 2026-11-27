import { hasValidGeo } from "@/lib/geo";
import type { Place } from "@/types";

const EARTH_RADIUS_KM = 6371;

export function distanceKm(a: Place["geo"], b: Place["geo"]): number {
  if (!hasValidGeo(a) || !hasValidGeo(b)) return Number.POSITIVE_INFINITY;
  const radians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = radians(b.lat - a.lat);
  const deltaLng = radians(b.lng - a.lng);
  const latA = radians(a.lat);
  const latB = radians(b.lat);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function rankNearbySpots(anchor: Place, places: Place[], limit = 5, radiusKm = 3): Place[] {
  if (!hasValidGeo(anchor.geo)) return [];
  const candidates = places
    .filter(
      (place) =>
        place.id !== anchor.id &&
        hasValidGeo(place.geo) &&
        distanceKm(anchor.geo, place.geo) <= radiusKm,
    )
    .map((place) => ({ place, distance: distanceKm(anchor.geo, place.geo) }))
    .sort((a, b) => a.distance - b.distance);
  const ranked: Place[] = [];
  const categoryCounts = new Map<string, number>();
  while (ranked.length < limit && candidates.length > 0) {
    candidates.sort((a, b) => {
      const balanceA = categoryCounts.get(a.place.category) ?? 0;
      const balanceB = categoryCounts.get(b.place.category) ?? 0;
      return balanceA - balanceB || a.distance - b.distance;
    });
    const next = candidates.shift();
    if (!next) break;
    ranked.push(next.place);
    categoryCounts.set(next.place.category, (categoryCounts.get(next.place.category) ?? 0) + 1);
  }
  return ranked;
}