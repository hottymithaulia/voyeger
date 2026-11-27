import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/data/db";
import "@/i18n";
import { DiscoverPage, type DiscoverFilter } from "@/features/discover/DiscoverPage";
import { makeTestPlace } from "@/test/place-fixture";
import type { Place } from "@/types";

vi.mock("@tanstack/react-router", () => ({
  ClientOnly: ({ children }: { children: ReactNode }) => <>{children}</>,
  Link: ({
    children,
    className,
    to,
    params,
  }: {
    children: ReactNode;
    className?: string;
    to: string;
    params?: Record<string, string>;
  }) => (
    <a href={params?.["slug"] ? to.replace("$slug", params["slug"]) : to} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/data/outbox", () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/features/discover/MapCanvas", () => ({
  MapCanvas: ({
    places,
    activeFilter,
    onSelect,
  }: {
    places: Place[];
    activeFilter: string;
    onSelect: (place: Place | null) => void;
  }) => (
    <div data-testid="mock-map-canvas" data-filter={activeFilter}>
      {places.map((place) => (
        <button key={place.id} type="button" onClick={() => onSelect(place)}>
          {place.i18n.en.title}
        </button>
      ))}
    </div>
  ),
}));

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.meta.put({ key: "pack_state", value: "ready" });
  await db.meta.put({ key: "active_language", value: "en" });
});

afterEach(async () => {
  await db.delete();
  vi.restoreAllMocks();
});

function testCopy(title: string, summary: string) {
  return {
    en: { title, summary, story: "", tips: [] },
    hi: { title, summary, story: "", tips: [] },
  };
}

describe("Page 2 Discover map", () => {
  it("toggles floating category filters and clears on second tap without remounting map stage", async () => {
    const anchor = makeTestPlace({
      id: "upper-lake",
      slug: "upper-lake",
      is_anchor: true,
      category: "experience",
      geo: { lat: 23.252, lng: 77.386 },
      i18n: testCopy("Upper Lake", "Bhojtal."),
    });
    const gem = makeTestPlace({
      id: "gauhar-mahal",
      slug: "gauhar-mahal",
      is_anchor: false,
      category: "hidden_gem",
      geo: { lat: 23.255, lng: 77.392 },
      i18n: testCopy("Gauhar Mahal", "Palace by the lake."),
    });
    await db.places.bulkPut([anchor, gem]);

    const onFilterChange = vi.fn<(next: DiscoverFilter) => void>();
    const { container, rerender } = render(
      <DiscoverPage filter="all" onFilterChange={onFilterChange} focusPlaceId="" />,
    );

    const mapCanvas = await screen.findByTestId("mock-map-canvas");
    const mapStageBefore = container.querySelector(".map-stage");
    expect(mapCanvas).toHaveAttribute("data-filter", "all");

    const hiddenBtn = screen.getByRole("button", { name: "Hidden Gems" });
    fireEvent.click(hiddenBtn);
    expect(onFilterChange).toHaveBeenCalledWith("hidden_gem");

    rerender(<DiscoverPage filter="hidden_gem" onFilterChange={onFilterChange} focusPlaceId="" />);
    expect(container.querySelector(".map-stage")).toBe(mapStageBefore);
    expect(screen.getByRole("button", { name: "Hidden Gems" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Hidden Gems" }));
    expect(onFilterChange).toHaveBeenCalledWith("all");
  });

  it("shows Beyond this landmark non-anchor places when an anchor is opened", async () => {
    const anchor = makeTestPlace({
      id: "taj-ul-masajid",
      slug: "taj-ul-masajid",
      is_anchor: true,
      category: "culture",
      geo: { lat: 23.262, lng: 77.392 },
      i18n: testCopy("Taj-ul-Masajid", "Landmark mosque."),
    });
    const otherAnchor = makeTestPlace({
      id: "bharat-bhavan",
      slug: "bharat-bhavan",
      is_anchor: true,
      category: "culture",
      geo: { lat: 23.253, lng: 77.395 },
      i18n: testCopy("Bharat Bhavan", "Arts complex."),
    });
    const nonAnchor = makeTestPlace({
      id: "old-market-tea",
      slug: "old-market-tea",
      is_anchor: false,
      category: "food",
      geo: { lat: 23.26, lng: 77.395 },
      i18n: testCopy("Old Market Tea", "Sulaimani chai."),
    });
    await db.places.bulkPut([anchor, otherAnchor, nonAnchor]);

    render(<DiscoverPage filter="all" onFilterChange={vi.fn()} focusPlaceId="" />);

    const anchorMarker = await screen.findByRole("button", { name: "Taj-ul-Masajid" });
    fireEvent.click(anchorMarker);

    expect(screen.getByText(/Beyond this landmark/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "See nearby spots" }));
    expect(screen.getByRole("link", { name: "Old Market Tea" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Bharat Bhavan" })).not.toBeInTheDocument();
  });

  it("renders empty state when pack is ready but no places exist, and opens Offline phrasebook", async () => {
    render(<DiscoverPage filter="all" onFilterChange={vi.fn()} focusPlaceId="" />);

    await waitFor(() => {
      expect(screen.getByText("No places in this view")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Offline phrasebook" }));
    expect(screen.getByRole("dialog", { name: "Offline phrasebook" })).toBeInTheDocument();
  });
});
