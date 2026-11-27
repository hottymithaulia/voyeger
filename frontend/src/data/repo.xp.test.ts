import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BHOPAL_CITY } from "@/config/city";
import { db } from "@/data/db";
import { calculatePlaceXp, getDiscoveryStats, recordDiscovery } from "@/data/repo";
import { makeTestPlace } from "@/test/place-fixture";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe("city bounds and discovery XP rules", () => {
  it("matches backend authoritative BHOPAL_BBOX", () => {
    expect(BHOPAL_CITY.bounds).toEqual({
      south: 23.1,
      west: 77.25,
      north: 23.35,
      east: 77.55,
    });
  });

  it("applies anchor=10, food=20, other non-anchor=30 independent of hidden_gem or partner_id", async () => {
    const anchor = makeTestPlace({ id: "upper-lake", slug: "upper-lake", is_anchor: true, category: "experience", partner_id: "sample-lakeside-stay" });
    const anchorFood = makeTestPlace({ id: "anchor-food", slug: "anchor-food", is_anchor: true, category: "food" });
    const hiddenGem = makeTestPlace({ id: "gauhar-mahal", slug: "gauhar-mahal", is_anchor: false, category: "hidden_gem" });
    const foodSpot = makeTestPlace({ id: "old-city-food", slug: "old-city-food", is_anchor: false, category: "food", partner_id: "sample-chowk-kitchen" });
    const cultureSpot = makeTestPlace({ id: "moti-masjid", slug: "moti-masjid", is_anchor: false, category: "culture" });
    const experienceWithPartner = makeTestPlace({ id: "courtyard-walk", slug: "courtyard-walk", is_anchor: false, category: "experience", partner_id: "sample-begum-studio" });
    const experiencePlain = makeTestPlace({ id: "lake-walk", slug: "lake-walk", is_anchor: false, category: "experience" });

    expect(calculatePlaceXp(anchor)).toBe(10);
    expect(calculatePlaceXp(anchorFood)).toBe(10);
    expect(calculatePlaceXp(foodSpot)).toBe(20);
    expect(calculatePlaceXp(hiddenGem)).toBe(30);
    expect(calculatePlaceXp(cultureSpot)).toBe(30);
    expect(calculatePlaceXp(experienceWithPartner)).toBe(calculatePlaceXp(experiencePlain));
    expect(calculatePlaceXp(experienceWithPartner)).toBe(30);

    const first = await recordDiscovery(hiddenGem);
    const duplicate = await recordDiscovery(hiddenGem);
    await recordDiscovery(anchor);
    await recordDiscovery(foodSpot);
    await recordDiscovery(cultureSpot);

    expect(first).toEqual({ awarded: true, xp: 30 });
    expect(duplicate).toEqual({ awarded: false, xp: 0 });

    const stats = await getDiscoveryStats();
    expect(stats.totalXp).toBe(90);
    expect(stats.hiddenGemsCount).toBe(1);
    expect(stats.totalDiscoveries).toBe(4);
    expect(stats.lastExplorationAt).not.toBeNull();
  });
});
