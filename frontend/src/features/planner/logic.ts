import { distanceKm } from "@/features/nudge/logic";
import { hasValidGeo } from "@/lib/geo";
import type { Place } from "@/types";

export type ItineraryStop = { place: Place; distanceFromPreviousKm: number; minutesFromPrevious: number };

export function buildDayItinerary(anchor: Place, places: Place[]): ItineraryStop[] {
  if (!hasValidGeo(anchor.geo)) return [];
  const hidden = places.filter(
    (place) => place.id !== anchor.id && hasValidGeo(place.geo) && place.category === "hidden_gem",
  );
  const food = places.filter(
    (place) => place.id !== anchor.id && hasValidGeo(place.geo) && place.category === "food",
  );
  const selectedHidden: Place[] = [];
  const remaining = [...hidden];
  let current = anchor;
  while (selectedHidden.length < 4 && remaining.length > 0) {
    remaining.sort((a, b) => distanceKm(current.geo, a.geo) - distanceKm(current.geo, b.geo));
    const next = remaining.shift();
    if (!next) break;
    selectedHidden.push(next);
    current = next;
  }
  const closestFood = food.sort((a, b) => distanceKm(current.geo, a.geo) - distanceKm(current.geo, b.geo))[0];
  const ordered = [anchor, ...selectedHidden, ...(closestFood ? [closestFood] : [])];
  return ordered.map((place, index) => {
    const previous = index === 0 ? undefined : ordered[index - 1];
    const km = previous ? distanceKm(previous.geo, place.geo) : 0;
    return { place, distanceFromPreviousKm: km, minutesFromPrevious: Math.round((km / 4.5) * 60) };
  });
}