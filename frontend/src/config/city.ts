import type { CityConfig } from "@/types";

/**
 * Authoritative Bhopal bounding box matching backend BHOPAL_BBOX=23.10,77.25,23.35,77.55
 * (south, west, north, east).
 */
export const BHOPAL_CITY: CityConfig = {
  id: "bhopal",
  name: {
    en: "Bhopal",
    hi: "भोपाल",
  },
  tagline: {
    en: "A city of stories waiting to be discovered.",
    hi: "कहानियों का शहर, खोजे जाने की प्रतीक्षा में।",
  },
  country: "India",
  center: [77.4006, 23.2583],
  bounds: {
    south: 23.10,
    west: 77.25,
    north: 23.35,
    east: 77.55,
  },
  defaultZoom: 12.1,
  minZoom: 10,
  maxZoom: 16,
  languages: ["en", "hi"],
};

export const AVAILABLE_CITIES: CityConfig[] = [BHOPAL_CITY];

export function getCityConfig(cityId?: string): CityConfig {
  return AVAILABLE_CITIES.find((city) => city.id === cityId) ?? BHOPAL_CITY;
}

/**
 * Resolve pack/media URLs consistently in both mock (same-origin) and http (separate backend origin) modes.
 */
export function resolveMediaUrl(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  if (import.meta.env["VITE_API_MODE"] === "http") {
    const base = (import.meta.env["VITE_API_BASE_URL"] || "").replace(/\/$/, "");
    if (base) {
      return `${base}${path.startsWith("/") ? path : `/${path}`}`;
    }
  }
  return path;
}
