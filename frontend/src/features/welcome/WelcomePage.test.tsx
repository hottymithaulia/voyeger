import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/data/db";
import { recordDiscovery } from "@/data/repo";
import "@/i18n";
import { WelcomePage } from "@/features/welcome/WelcomePage";
import { makeTestPlace } from "@/test/place-fixture";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className, to }: { children: React.ReactNode; className?: string; to: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  await db.delete();
  vi.restoreAllMocks();
});

describe("Page 1 City Welcome", () => {
  it("renders city from getActiveCity and zero/Not yet stats when no history exists", async () => {
    render(<WelcomePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Bhopal" })).toBeInTheDocument();
      expect(screen.getByText("Not yet")).toBeInTheDocument();
    });

    expect(screen.getByText("WELCOME")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("0 XP")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "EXPERIENCE" });
    expect(cta).toHaveAttribute("href", "/discover");
  });

  it("displays live discovery stats from IndexedDB", async () => {
    const gem = makeTestPlace({ id: "gauhar-mahal", slug: "gauhar-mahal", category: "hidden_gem", is_anchor: false });
    const anchor = makeTestPlace({ id: "upper-lake", slug: "upper-lake", category: "experience", is_anchor: true });
    await recordDiscovery(gem);
    await recordDiscovery(anchor);

    render(<WelcomePage />);

    await waitFor(() => {
      expect(screen.getByText("40 XP")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("Just now")).toBeInTheDocument();
    });
  });

  it("shows a real nearby anchor pill only when located anchors exist in IndexedDB", async () => {
    const upperLake = makeTestPlace({
      id: "upper-lake",
      slug: "upper-lake",
      is_anchor: true,
      category: "experience",
      geo: { lat: 23.252, lng: 77.386 },
      i18n: {
        en: { title: "Upper Lake", summary: "Bhojtal.", story: "", tips: [] },
        hi: { title: "ऊपरी झील", summary: "भोजताल।", story: "", tips: [] },
      },
    });
    await db.places.put(upperLake);

    render(<WelcomePage />);

    expect(await screen.findByText("Near Upper Lake")).toBeInTheDocument();
  });
});
