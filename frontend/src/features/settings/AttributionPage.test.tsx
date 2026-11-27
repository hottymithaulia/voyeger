import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/data/db";
import "@/i18n";
import { AttributionPage } from "@/features/settings/AttributionPage";
import { makeTestPlace } from "@/test/place-fixture";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className, to }: { children: ReactNode; className?: string; to: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  await db.delete();
  vi.restoreAllMocks();
});

describe("AttributionPage provenance sources", () => {
  it("renders deduplicated provenance.sources[] from installed places when present", async () => {
    const first = makeTestPlace({
      id: "p1",
      slug: "p1",
      provenance: {
        source: "Draft import",
        license: "CC BY-SA 4.0",
        verified_by: "Editorial",
        verified_at: "2026-11-27",
        sources: [
          { name: "Wikipedia - Bhopal", url: "https://en.wikipedia.org/wiki/Bhopal", type: "encyclopedia" },
          { name: "MP Tourism", url: "https://www.mptourism.com/", type: "official" },
        ],
      },
    });
    const second = makeTestPlace({
      id: "p2",
      slug: "p2",
      provenance: {
        source: "Draft import",
        license: "CC BY-SA 4.0",
        verified_by: "Editorial",
        verified_at: "2026-11-27",
        sources: [
          { name: "Wikipedia - Bhopal", url: "https://en.wikipedia.org/wiki/Bhopal", type: "encyclopedia" },
        ],
      },
    });
    await db.places.bulkPut([first, second]);

    render(<AttributionPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Content & research sources" })).toBeInTheDocument();
    });

    expect(screen.getAllByText("Wikipedia - Bhopal")).toHaveLength(1);
    expect(screen.getByText("MP Tourism")).toBeInTheDocument();
  });

  it("omits the provenance sources block when no sources exist", async () => {
    await db.places.put(makeTestPlace({ id: "plain", slug: "plain" }));

    render(<AttributionPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Sources and credits" })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Content & research sources" })).not.toBeInTheDocument();
    });
  });
});
