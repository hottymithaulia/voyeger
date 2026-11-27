import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/i18n";
import { CircularReveal } from "@/components/CircularReveal";
import * as revealModule from "@/components/CircularReveal";
import { WelcomePage } from "@/features/welcome/WelcomePage";
import { findNearestAnchor, resolveHomepageContext } from "@/features/welcome/location";
import {
  LAST_TAGLINE_INDEX_KEY,
  pickSessionTaglineIndex,
  TRAVEL_TAGLINES_EN,
  TRAVEL_TAGLINES_HI,
} from "@/features/welcome/taglines";
import type { Place } from "@/types";

const mockNavigate = vi.fn().mockResolvedValue(undefined);

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
}));

function makePlace(partial: Partial<Place> & { id: string; title: string }): Place {
  return {
    id: partial.id,
    slug: partial.id,
    category: partial.category ?? "culture",
    is_anchor: partial.is_anchor ?? true,
    anchor_for: [],
    geo: partial.geo ?? { lat: 23.2583, lng: 77.4006 },
    tags: [],
    media: { images: [] },
    hours: null,
    best_time: null,
    cost_note: null,
    sensitivity: { is_sacred: false, note: null },
    provenance: {
      source: "osm",
      license: "ODbL",
      verified_by: "team",
      verified_at: "2026-01-01",
    },
    updated_in_version: 1,
    i18n: {
      en: {
        title: partial.title,
        summary: "Summary",
        story: "Story",
        tips: [],
      },
      hi: {
        title: partial.title,
        summary: "सारांश",
        story: "कहानी",
        tips: [],
      },
    },
    enrichment: {},
    deleted: partial.deleted ?? false,
  };
}

const SAMPLE_PLACES: Place[] = [
  makePlace({
    id: "upper-lake",
    title: "Upper Lake",
    is_anchor: true,
    geo: { lat: 23.2495, lng: 77.3834 },
  }),
  makePlace({
    id: "taj-ul-masajid",
    title: "Taj-ul-Masajid",
    is_anchor: true,
    geo: { lat: 23.2624, lng: 77.3924 },
  }),
  makePlace({
    id: "hidden-tea-stall",
    title: "Hidden Chai Corner",
    is_anchor: false,
    category: "hidden_gem",
    geo: { lat: 23.25, lng: 77.384 },
  }),
  makePlace({
    id: "invalid-anchor",
    title: "Broken Anchor",
    is_anchor: true,
    geo: { lat: Number.NaN, lng: Number.NaN },
  }),
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  mockNavigate.mockClear();
  window.localStorage.removeItem(LAST_TAGLINE_INDEX_KEY);
});

describe("taglines rotation", () => {
  it("provides all 20 travel taglines in English and Hindi", () => {
    expect(TRAVEL_TAGLINES_EN).toHaveLength(20);
    expect(TRAVEL_TAGLINES_HI).toHaveLength(20);
    expect(TRAVEL_TAGLINES_EN[0]).toBe("A city of stories waiting to be discovered.");
  });

  it("avoids repeating the immediate previous tagline across initializations", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };

    let prev = pickSessionTaglineIndex(TRAVEL_TAGLINES_EN.length, storage);
    for (let i = 0; i < 20; i += 1) {
      const next = pickSessionTaglineIndex(TRAVEL_TAGLINES_EN.length, storage);
      expect(next).not.toBe(prev);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(TRAVEL_TAGLINES_EN.length);
      prev = next;
    }
  });
});

describe("location resolution & nearest anchor", () => {
  it("resolves Scenario A (Bhopal match + nearest valid anchor via Haversine)", async () => {
    const ctx = await resolveHomepageContext({
      packReady: true,
      explicitCityId: undefined,
      cachedLocation: null,
      liveCoords: { lat: 23.2501, lng: 77.3842 },
      places: SAMPLE_PLACES,
      skipPermissionQuery: true,
    });

    expect(ctx.scenario).toBe("matched_city");
    expect(ctx.headingEn).toBe("BHOPAL");
    expect(ctx.nearestAnchor?.id).toBe("upper-lake");
    expect(ctx.nearestDistanceKm).not.toBeNull();
  });

  it("ignores non-anchors and anchors outside city bounds / without valid coords", () => {
    const result = findNearestAnchor(
      { lat: 13.1367, lng: 78.1291 },
      {
        id: "bhopal",
        name: { en: "Bhopal", hi: "भोपाल" },
        tagline: { en: "", hi: "" },
        country: "IN",
        center: [77.4006, 23.2583],
        bounds: { south: 23.1, west: 77.25, north: 23.35, east: 77.55 },
        defaultZoom: 13,
        minZoom: 11,
        maxZoom: 18,
        languages: ["en", "hi"],
      },
      SAMPLE_PLACES,
    );
    expect(result).toBeNull();
  });

  it("resolves Scenario B for Karnataka without falsely claiming Bhopal location", async () => {
    const ctx = await resolveHomepageContext({
      packReady: true,
      explicitCityId: "bhopal",
      cachedLocation: null,
      liveCoords: { lat: 13.1367, lng: 78.1291 },
      places: SAMPLE_PLACES,
      skipPermissionQuery: true,
    });

    expect(ctx.scenario).toBe("unavailable_map");
    expect(ctx.headingEn).toBe("KARNATAKA");
    expect(ctx.nearestAnchor).toBeNull();
    expect(ctx.availableInstalledCity?.id).toBe("bhopal");
  });

  it("does not claim Bhopal map is available when pack is not installed", async () => {
    const ctx = await resolveHomepageContext({
      packReady: false,
      explicitCityId: undefined,
      cachedLocation: null,
      liveCoords: { lat: 22.7196, lng: 75.8577 },
      places: [],
      skipPermissionQuery: true,
    });

    expect(ctx.scenario).toBe("unavailable_map");
    expect(ctx.headingEn).toBe("MADHYA PRADESH");
    expect(ctx.availableInstalledCity).toBeNull();
  });

  it("resolves Scenario D fallback to TRAVELLER when location and pack are absent", async () => {
    const ctx = await resolveHomepageContext({
      packReady: false,
      explicitCityId: undefined,
      cachedLocation: null,
      liveCoords: null,
      places: [],
      skipPermissionQuery: true,
    });

    expect(ctx.scenario).toBe("unknown");
    expect(ctx.headingEn).toBe("TRAVELLER");
    expect(ctx.nearestAnchor).toBeNull();
  });
});

describe("WelcomePage interactions", () => {
  it("renders matched city, single nearest-anchor button, glass stats, and click-origin reveal", async () => {
    const spyReveal = vi.spyOn(revealModule, "triggerCircularReveal").mockImplementation(
      (_x, _y, nav) => {
        void nav();
      },
    );

    const { rerender } = render(
      <WelcomePage
        locationDeps={{
          packReady: true,
          liveCoords: { lat: 23.2501, lng: 77.3842 },
          places: SAMPLE_PLACES,
          skipPermissionQuery: true,
        }}
      />,
    );

    expect(await screen.findByRole("heading", { name: "BHOPAL" })).toBeTruthy();

    const nearBtn = screen.getByRole("button", { name: "Near Upper Lake" });
    expect(nearBtn).toBeTruthy();
    expect(screen.queryByText("Near this location?")).toBeNull();

    const taglineBefore = document.querySelector(".welcome-tagline")?.textContent;
    expect(TRAVEL_TAGLINES_EN as readonly string[]).toContain(taglineBefore);

    rerender(
      <WelcomePage
        locationDeps={{
          packReady: true,
          liveCoords: { lat: 23.2501, lng: 77.3842 },
          places: SAMPLE_PLACES,
          skipPermissionQuery: true,
        }}
      />,
    );
    expect(document.querySelector(".welcome-tagline")?.textContent).toBe(taglineBefore);

    expect(screen.getByText("Not yet")).toBeTruthy();
    expect(screen.getByText("0 XP")).toBeTruthy();

    fireEvent.click(nearBtn, { clientX: 120, clientY: 45 });
    expect(spyReveal).toHaveBeenCalledWith(120, 45, expect.any(Function));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/discover",
      search: {
        place: "upper-lake",
        nearLat: 23.2495,
        nearLng: 77.3834,
      },
    });
  });

  it("triggers click-origin reveal from EXPERIENCE CTA", async () => {
    const spyReveal = vi.spyOn(revealModule, "triggerCircularReveal").mockImplementation(
      (_x, _y, nav) => {
        void nav();
      },
    );

    render(
      <>
        <WelcomePage
          locationDeps={{
            packReady: false,
            liveCoords: null,
            places: [],
            skipPermissionQuery: true,
          }}
        />
        <CircularReveal />
      </>,
    );

    expect(await screen.findByRole("heading", { name: "TRAVELLER" })).toBeTruthy();
    expect(
      screen.getByText("Choose a city to begin discovering its stories."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose your location" })).toBeTruthy();
    expect(screen.queryByText(/Currently available map/i)).toBeNull();

    const cta = screen.getByRole("link", { name: "EXPERIENCE" });
    fireEvent.click(cta, { clientX: 320, clientY: 610 });

    await waitFor(() => {
      expect(spyReveal).toHaveBeenCalledWith(320, 610, expect.any(Function));
    });
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/discover", search: {} });
  });

  it("renders Karnataka state heading and available map notice when Bhopal pack is installed", async () => {
    render(
      <WelcomePage
        locationDeps={{
          packReady: true,
          liveCoords: { lat: 13.1367, lng: 78.1291 },
          places: SAMPLE_PLACES,
          skipPermissionQuery: true,
        }}
      />,
    );

    expect(await screen.findByRole("heading", { name: "KARNATAKA" })).toBeTruthy();
    expect(
      screen.getByText("The map for your location isn't available to download yet."),
    ).toBeTruthy();
    expect(screen.getByText("Currently available map: Bhopal")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Near Karnataka" })).toBeTruthy();
  });
});
