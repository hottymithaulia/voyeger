import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/data/db";
import "@/i18n";
import { queuePartnerApplication } from "@/data/outbox";
import { PartnersPage } from "@/features/partners/PartnersPage";
import type { Partner } from "@/types";

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
    <a href={params?.["id"] ? to.replace("$id", params["id"]) : to} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/data/outbox", () => ({
  queuePartnerApplication: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  await db.delete();
  vi.restoreAllMocks();
});

describe("Page 4 Hidden India partners", () => {
  it("renders Hidden India campaign framing, dynamic city copy, approved partners, and pending-review submission", async () => {
    const partner: Partner = {
      id: "chowk-chai",
      type: "food",
      name: "Chowk Chai House",
      offer: "Complimentary tasting cup with offline guide.",
      onboarded_via: "community",
      place_ids: [],
      i18n: {
        en: {
          name: "Chowk Chai House",
          description: "Evening saffron and cardamom chai stall.",
          offer: "Complimentary tasting cup with offline guide.",
        },
        hi: {
          name: "चौक चाय हाउस",
          description: "शाम की चाय।",
          offer: "गाइड दिखाने पर विशेष चाय।",
        },
      },
      contact: { phone: "+91 755 0000000" },
    };
    await db.partners.put(partner);

    render(<PartnersPage />);

    await waitFor(() => {
      expect(screen.getByText("Chowk Chai House")).toBeInTheDocument();
    });

    expect(screen.getByText("HIDDEN INDIA — A COMMUNITY-DRIVEN DISCOVERY CAMPAIGN")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "YOUR PLACE HAS A STORY. HELP TRAVELLERS DISCOVER IT." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Bhopal/)).toBeInTheDocument();
    expect(screen.getByText("Photographs (planned future integration)")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Business or artist name"), {
      target: { value: "Zardozi Loom Collective" },
    });
    fireEvent.change(screen.getByLabelText("Phone or email"), {
      target: { value: "loom@example.test" },
    });
    fireEvent.change(screen.getByLabelText("What do you offer visitors?"), {
      target: { value: "Live embroidery workshop." },
    });

    fireEvent.submit(screen.getByRole("button", { name: "Become a partner" }).closest("form")!);

    await waitFor(() => {
      expect(queuePartnerApplication).toHaveBeenCalledWith({
        name: "Zardozi Loom Collective",
        type: "artisan",
        contact: "loom@example.test",
        offer: "Live embroidery workshop.",
        place_ids: [],
      });
    });

    expect(await screen.findByText(/Status: Pending review/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Zardozi Loom Collective" })).not.toBeInTheDocument();
  });

  it("handles an empty partners list cleanly without crashing", async () => {
    render(<PartnersPage />);

    expect(await screen.findByText("No partners in this guide yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Become a partner" })).toBeInTheDocument();
  });
});
