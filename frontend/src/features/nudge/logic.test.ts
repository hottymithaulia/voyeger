import { describe, expect, it } from "vitest";

import { distanceKm, rankNearbySpots } from "@/features/nudge/logic";
import { makeTestPlace } from "@/test/place-fixture";

describe("nearby discovery", () => {
  it("uses haversine distance in kilometres", () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.19, 1);
  });

  it("returns at most five places within three kilometres, nearest first when categories match", () => {
    const anchor = makeTestPlace({ id: "anchor", is_anchor: true, geo: { lat: 23.25, lng: 77.4 } });
    const nearby = [1, 2, 3, 4, 5, 6].map((step) => makeTestPlace({
      id: `near-${step}`,
      slug: `near-${step}`,
      geo: { lat: 23.25 + step * 0.001, lng: 77.4 },
    }));
    const outside = makeTestPlace({ id: "outside", slug: "outside", geo: { lat: 23.29, lng: 77.4 } });

    const result = rankNearbySpots(anchor, [...nearby, outside], 5, 3);

    expect(result).toHaveLength(5);
    expect(result[0]?.id).toBe("near-1");
    expect(result.some((place) => place.id === "outside")).toBe(false);
  });

  it("excludes places with null geo and returns empty when anchor lacks geo", () => {
    const validAnchor = makeTestPlace({ id: "anchor", is_anchor: true, geo: { lat: 23.25, lng: 77.4 } });
    const nullAnchor = makeTestPlace({ id: "null-anchor", is_anchor: true, geo: { lat: null, lng: null } });
    const validSpot = makeTestPlace({ id: "valid", slug: "valid", geo: { lat: 23.252, lng: 77.402 } });
    const nullSpot = makeTestPlace({ id: "no-geo", slug: "no-geo", geo: { lat: null, lng: null } });

    expect(distanceKm({ lat: null, lng: null }, { lat: 23.25, lng: 77.4 })).toBe(Number.POSITIVE_INFINITY);
    expect(rankNearbySpots(validAnchor, [validSpot, nullSpot]).map((place) => place.id)).toEqual(["valid"]);
    expect(rankNearbySpots(nullAnchor, [validSpot, nullSpot])).toEqual([]);
  });
});