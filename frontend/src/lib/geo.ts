import type { Place } from "@/types";

export function hasValidGeo(
  geo: Place["geo"] | null | undefined,
): geo is { lat: number; lng: number } {
  return (
    typeof geo?.lat === "number" &&
    Number.isFinite(geo.lat) &&
    typeof geo?.lng === "number" &&
    Number.isFinite(geo.lng)
  );
}
