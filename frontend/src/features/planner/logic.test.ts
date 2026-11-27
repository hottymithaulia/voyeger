import { describe, expect, it } from "vitest";

import { buildDayItinerary } from "@/features/planner/logic";
import { makeTestPlace } from "@/test/place-fixture";

describe("Bhopal day itinerary", () => {
  it("starts at one anchor and includes four hidden gems plus one food stop when available", () => {
    const anchor = makeTestPlace({ id: "anchor", is_anchor: true, category: "culture", geo: { lat: 23.25, lng: 77.4 } });
    const gems = [1, 2, 3, 4, 5].map((step) => makeTestPlace({ id: `gem-${step}`, slug: `gem-${step}`, geo: { lat: 23.25 + step * 0.001, lng: 77.4 } }));
    const food = makeTestPlace({ id: "food", slug: "food", category: "food", geo: { lat: 23.255, lng: 77.4 } });

    const itinerary = buildDayItinerary(anchor, [anchor, ...gems, food]);

    expect(itinerary).toHaveLength(6);
    expect(itinerary[0]?.place.id).toBe("anchor");
    expect(itinerary.filter((stop) => stop.place.category === "hidden_gem")).toHaveLength(4);
    expect(itinerary.at(-1)?.place.category).toBe("food");
  });

  it("excludes spots with null geo and returns empty when anchor geo is null", () => {
    const validAnchor = makeTestPlace({ id: "anchor", is_anchor: true, category: "culture", geo: { lat: 23.25, lng: 77.4 } });
    const nullAnchor = makeTestPlace({ id: "null-anchor", is_anchor: true, category: "culture", geo: { lat: null, lng: null } });
    const validGem = makeTestPlace({ id: "gem-valid", slug: "gem-valid", geo: { lat: 23.252, lng: 77.401 } });
    const nullGem = makeTestPlace({ id: "gem-null", slug: "gem-null", geo: { lat: null, lng: null } });
    const nullFood = makeTestPlace({ id: "food-null", slug: "food-null", category: "food", geo: { lat: null, lng: null } });

    const result = buildDayItinerary(validAnchor, [validAnchor, validGem, nullGem, nullFood]);
    expect(result.map((stop) => stop.place.id)).toEqual(["anchor", "gem-valid"]);
    expect(buildDayItinerary(nullAnchor, [nullAnchor, validGem])).toEqual([]);
  });
});