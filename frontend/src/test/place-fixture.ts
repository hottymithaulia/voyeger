import type { Place } from "@/types";

export function makeTestPlace(overrides: Partial<Place> = {}): Place {
  const base: Place = {
    id: "curated-place",
    slug: "curated-place",
    category: "hidden_gem",
    tags: ["sample"],
    geo: { lat: 23.25, lng: 77.4 },
    is_anchor: false,
    anchor_for: [],
    i18n: {
      en: { title: "Curated title", summary: "Curated summary", story: "Curated story", tips: ["Curated tip"] },
      hi: { title: "हिंदी नाम", summary: "हिंदी परिचय", story: "हिंदी कहानी", tips: ["हिंदी सुझाव"] },
    },
    media: { images: [] },
    hours: "Sample hours",
    best_time: "Morning",
    cost_note: "Sample cost",
    sensitivity: { is_sacred: false, note: "" },
    enrichment: { osm: { url: "https://www.openstreetmap.org/old" } },
    provenance: { source: "Sample pack", license: "Sample", verified_by: "Tests", verified_at: "2026-11-27" },
    updated_in_version: 1,
  };
  return { ...base, ...overrides };
}