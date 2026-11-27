import { Compass, Footprints, Landmark, Sparkles, Utensils } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

vi.mock("maplibre-gl", () => ({
  addProtocol: vi.fn(),
  Map: vi.fn(),
  NavigationControl: vi.fn(),
}));

vi.mock("pmtiles", () => ({
  PMTiles: vi.fn(),
  Protocol: class {
    tile = vi.fn();
    add = vi.fn();
  },
}));

import {
  isMarkerVisibleAtZoom,
  markerIcon,
  matchesPlaceFilter,
} from "@/features/discover/MapCanvas";
import { makeTestPlace } from "@/test/place-fixture";

describe("MapCanvas hierarchy and marker helpers", () => {
  it("assigns distinct icon components by anchor state and place category", () => {
    const anchor = makeTestPlace({ id: "a1", is_anchor: true, category: "culture" });
    const gem = makeTestPlace({ id: "g1", is_anchor: false, category: "hidden_gem" });
    const food = makeTestPlace({ id: "f1", is_anchor: false, category: "food" });
    const culture = makeTestPlace({ id: "c1", is_anchor: false, category: "culture" });
    const experience = makeTestPlace({ id: "e1", is_anchor: false, category: "experience" });

    expect(markerIcon(anchor)).toBe(Compass);
    expect(markerIcon(gem)).toBe(Sparkles);
    expect(markerIcon(food)).toBe(Utensils);
    expect(markerIcon(culture)).toBe(Landmark);
    expect(markerIcon(experience)).toBe(Footprints);
  });

  it("shows anchors and non-anchors at all zooms (clustered when close) and respects active filters", () => {
    const anchor = makeTestPlace({ id: "anchor-1", is_anchor: true, category: "culture" });
    const gem = makeTestPlace({ id: "gem-1", is_anchor: false, category: "hidden_gem" });
    const food = makeTestPlace({ id: "food-1", is_anchor: false, category: "food" });

    expect(isMarkerVisibleAtZoom(anchor, 10, "all", "")).toBe(true);
    expect(isMarkerVisibleAtZoom(gem, 10, "all", "")).toBe(true);
    expect(isMarkerVisibleAtZoom(gem, 12.9, "all", "")).toBe(true);
    expect(isMarkerVisibleAtZoom(gem, 13, "all", "")).toBe(true);

    expect(isMarkerVisibleAtZoom(gem, 11, "hidden_gem", "")).toBe(true);
    expect(isMarkerVisibleAtZoom(food, 11, "hidden_gem", "")).toBe(false);
    expect(isMarkerVisibleAtZoom(food, 11, "all", "food-1")).toBe(true);
  });

  it("matches category and partner filters accurately", () => {
    const partnerFood = makeTestPlace({ id: "pf", category: "food", partner_id: "partner-1" });
    const gem = makeTestPlace({ id: "g", category: "hidden_gem" });

    expect(matchesPlaceFilter(partnerFood, "all")).toBe(true);
    expect(matchesPlaceFilter(partnerFood, "food")).toBe(true);
    expect(matchesPlaceFilter(partnerFood, "partners")).toBe(true);
    expect(matchesPlaceFilter(gem, "partners")).toBe(false);
    expect(matchesPlaceFilter(gem, "culture")).toBe(false);
  });

  it("skips markers whose geo coordinates are null regardless of zoom or filter", () => {
    const nullAnchor = makeTestPlace({ id: "a-null", is_anchor: true, geo: { lat: null, lng: null } });
    const partialNull = makeTestPlace({ id: "p-null", is_anchor: false, category: "food", geo: { lat: 23.25, lng: null } });

    expect(isMarkerVisibleAtZoom(nullAnchor, 16, "all", "a-null")).toBe(false);
    expect(isMarkerVisibleAtZoom(partialNull, 16, "food", "p-null")).toBe(false);
  });
});
