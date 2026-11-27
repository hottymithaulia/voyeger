import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import "@/i18n";
import { PHRASEBOOK_LANGUAGES, TRAVEL_PHRASES } from "@/features/translate/phrasebook";
import { PhrasebookSheet } from "@/features/translate/PhrasebookSheet";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Offline phrasebook", () => {
  it("labels itself as an offline static phrasebook with 5 languages and draft flags", () => {
    expect(PHRASEBOOK_LANGUAGES.map((lang) => lang.code)).toEqual(["en", "hi", "ta", "bn", "mr"]);
    expect(TRAVEL_PHRASES).toHaveLength(6);
    for (const phrase of TRAVEL_PHRASES) {
      expect(phrase.translations.en.needs_review).toBe(false);
      expect(phrase.translations.hi.needs_review).toBe(true);
      expect(phrase.translations.ta.needs_review).toBe(true);
      expect(phrase.translations.bn.needs_review).toBe(true);
      expect(phrase.translations.mr.needs_review).toBe(true);
    }

    render(<PhrasebookSheet open onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Offline phrasebook" })).toBeInTheDocument();
    expect(screen.getByText(/Available offline/i)).toBeInTheDocument();
    expect(screen.getAllByText("Needs review")).toHaveLength(6);
    expect(screen.getByText("Where is this place?")).toBeInTheDocument();
    expect(screen.getByText("यह जगह कहाँ है?")).toBeInTheDocument();
  });

  it("switches target language and copies phrase text to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<PhrasebookSheet open onClose={vi.fn()} />);

    const toSelect = screen.getByLabelText("Local language");
    fireEvent.change(toSelect, { target: { value: "ta" } });
    expect(screen.getByText("இந்த இடம் எங்கே உள்ளது?")).toBeInTheDocument();

    const copyButtons = screen.getAllByRole("button", { name: /^Copy:/ });
    fireEvent.click(copyButtons[0]!);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("இந்த இடம் எங்கே உள்ளது?");
    });
  });
});
