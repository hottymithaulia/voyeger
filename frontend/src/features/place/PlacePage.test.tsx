import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/data/db";
import "@/i18n";
import { PlacePage } from "@/features/place/PlacePage";
import { makeTestPlace } from "@/test/place-fixture";

vi.mock("@tanstack/react-router", () => ({
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

vi.mock("@/net/connectivity", () => ({
  probeConnectivity: vi.fn().mockResolvedValue("OFFLINE"),
}));

vi.mock("@/data/outbox", () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.meta.put({ key: "active_language", value: "en" });
});

afterEach(async () => {
  await db.delete();
  vi.restoreAllMocks();
});

describe("Page 3 Place detail experience", () => {
  it("records discovery once per place open, applies place.theme, and shows Beyond this landmark cards", async () => {
    const anchor = makeTestPlace({
      id: "upper-lake",
      slug: "upper-lake",
      is_anchor: true,
      category: "experience",
      theme: { primary: "#1b5e63", secondary: "#d8eceb" },
      geo: { lat: 23.252, lng: 77.386 },
      media: {
        images: [
          {
            id: "img-1",
            file: "/pack/v1/images/upper-lake.webp",
            thumb: "/pack/v1/images/upper-lake.webp",
            alt: { en: "Upper Lake view", hi: "ऊपरी झील" },
            credit: "Sample 1",
          },
          {
            id: "img-2",
            file: "/pack/v1/images/bharat-bhavan.webp",
            thumb: "/pack/v1/images/bharat-bhavan.webp",
            alt: { en: "Shoreline terrace", hi: "तट" },
            credit: "Sample 2",
          },
        ],
      },
      i18n: {
        en: { title: "Upper Lake", summary: "Bhojtal shore.", story: "Historic reservoir.", tips: ["Sunset walk"] },
        hi: { title: "ऊपरी झील", summary: "भोजताल किनारा।", story: "ऐतिहासिक जलाशय।", tips: ["सूर्यास्त सैर"] },
      },
    });
    const gem = makeTestPlace({
      id: "gauhar-mahal",
      slug: "gauhar-mahal",
      is_anchor: false,
      anchor_for: ["upper-lake"],
      category: "hidden_gem",
      geo: { lat: 23.254, lng: 77.391 },
      i18n: {
        en: { title: "Gauhar Mahal", summary: "Lakeside palace.", story: "", tips: [] },
        hi: { title: "गौहर महल", summary: "झील किनारे महल।", story: "", tips: [] },
      },
    });
    await db.places.bulkPut([anchor, gem]);

    const firstRender = render(<PlacePage slug="upper-lake" />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Upper Lake" })).toBeInTheDocument();
    });

    const shell = firstRender.container.querySelector<HTMLElement>(".place-detail-shell");
    expect(shell?.style.getPropertyValue("--place-primary")).toBe("#1b5e63");
    expect(shell?.style.getPropertyValue("--place-secondary")).toBe("#d8eceb");

    fireEvent.click(screen.getByRole("button", { name: "Show photo 2" }));
    expect(screen.getByAltText("Shoreline terrace")).toBeInTheDocument();

    await waitFor(async () => {
      const records = await db.discoveries.toArray();
      expect(records).toHaveLength(1);
      expect(records[0]?.placeId).toBe("upper-lake");
      expect(records[0]?.xp).toBe(10);
    });

    expect(screen.getByRole("link", { name: "Back to the map" })).toHaveAttribute("href", "/discover");
    expect(screen.getByText("Beyond this landmark")).toBeInTheDocument();
    expect(screen.getByText("Gauhar Mahal")).toBeInTheDocument();

    firstRender.unmount();

    render(<PlacePage slug="upper-lake" />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Upper Lake" })).toBeInTheDocument();
    });
    expect(await db.discoveries.toArray()).toHaveLength(1);
  });

  it("hides missing hours, cost, tips, story, and gallery sections without inventing content", async () => {
    const minimalPlace = makeTestPlace({
      id: "quiet-courtyard",
      slug: "quiet-courtyard",
      is_anchor: false,
      category: "hidden_gem",
      hours: "",
      best_time: "",
      cost_note: "",
      tags: [],
      enrichment: {},
      media: { images: [] },
      i18n: {
        en: { title: "Quiet Courtyard", summary: "Restored old-city courtyard.", story: "", tips: [] },
        hi: { title: "शांत आंगन", summary: "पुराने शहर का आंगन।", story: "", tips: [] },
      },
    });
    await db.places.put(minimalPlace);

    render(<PlacePage slug="quiet-courtyard" />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Quiet Courtyard" })).toBeInTheDocument();
    });

    expect(screen.queryByText("Hours")).not.toBeInTheDocument();
    expect(screen.queryByText("Best time")).not.toBeInTheDocument();
    expect(screen.queryByText("Cost")).not.toBeInTheDocument();
    expect(screen.queryByText("The story")).not.toBeInTheDocument();
    expect(screen.queryByText("Local tips")).not.toBeInTheDocument();
    expect(screen.queryByText("More from the web")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("handles v3 nullable fields, sacred badge without note, placeholder image credit, status suppression, and theme fallback", async () => {
    const v3SacredDraft = makeTestPlace({
      id: "taj-ul-masajid",
      slug: "taj-ul-masajid",
      status: "draft",
      is_anchor: true,
      category: "culture",
      geo: { lat: null, lng: null },
      hours: null,
      best_time: null,
      cost_note: null,
      sensitivity: { is_sacred: true, note: null },
      theme: { primary: "#123456", secondary: "#abcdef", on_primary: "#ffffff" },
      media: {
        placeholder: true,
        images: [
          {
            id: "ph-1",
            file: "/pack/v3/images/taj-ul-masajid.webp",
            thumb: "/pack/v3/images/taj-ul-masajid.webp",
            alt: { en: "Taj-ul-Masajid placeholder", hi: "ताज-उल-मसाजिद" },
            credit: "Should never appear for placeholder",
          },
        ],
      },
      i18n: {
        en: { title: "Taj-ul-Masajid", summary: "Mosque complex in Bhopal.", story: "Editorial summary.", tips: [] },
        hi: { title: "ताज-उल-मसाजिद", summary: "भोपाल की मस्जिद।", story: "", tips: [] },
      },
    });
    await db.places.put(v3SacredDraft);

    const rendered = render(<PlacePage slug="taj-ul-masajid" />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Taj-ul-Masajid" })).toBeInTheDocument();
    });

    // Null geo hides Directions action
    expect(screen.queryByRole("link", { name: "Directions" })).not.toBeInTheDocument();
    // Never render place.status to end users
    expect(screen.queryByText(/\bdraft\b/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bready\b/i)).not.toBeInTheDocument();
    // Sacred badge shown without empty note box or invented etiquette prose
    expect(screen.getByText("Sacred site")).toBeInTheDocument();
    expect(rendered.container.querySelector(".sacred-note")).toBeNull();
    expect(screen.queryByText(/follow local customs/i)).not.toBeInTheDocument();
    // Placeholder image displays without credit line and is not used for theme colours
    expect(screen.getByAltText("Taj-ul-Masajid placeholder")).toBeInTheDocument();
    expect(screen.queryByText("Should never appear for placeholder")).not.toBeInTheDocument();
    const shell = rendered.container.querySelector<HTMLElement>(".place-detail-shell");
    expect(shell?.style.getPropertyValue("--place-primary")).toBe("");
    // Null facts and empty tips omitted
    expect(screen.queryByText("Hours")).not.toBeInTheDocument();
    expect(screen.queryByText("Best time")).not.toBeInTheDocument();
    expect(screen.queryByText("Cost")).not.toBeInTheDocument();
    expect(screen.queryByText("Local tips")).not.toBeInTheDocument();
  });
});
