import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/data/db";
import "@/i18n";
import { changeAppLanguage } from "@/i18n";
import { installLanguage, syncNow } from "@/data/sync";
import { SettingsPage } from "@/features/settings/SettingsPage";
import type { Manifest } from "@/types";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className, to }: { children: ReactNode; className?: string; to: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/net/connectivity", () => ({
  probeConnectivity: vi.fn().mockResolvedValue("ONLINE_IDLE"),
}));

vi.mock("@/data/sync", () => ({
  installLanguage: vi.fn().mockResolvedValue(undefined),
  syncNow: vi.fn().mockResolvedValue({ version: 2, updated: true }),
}));

beforeEach(async () => {
  await db.delete();
  await db.open();
  await changeAppLanguage("en");
  const manifest: Manifest = {
    version: 1,
    built_at: "2026-11-27T08:00:00Z",
    min_app_version: "1.0.0",
    files: [],
    languages: ["en", "hi"],
    total_bytes: 184 * 1024,
  };
  await db.meta.bulkPut([
    { key: "content_version", value: 1 },
    { key: "pack_manifest", value: manifest },
    { key: "languages_installed", value: ["en"] },
    { key: "active_language", value: "en" },
  ]);
});

afterEach(async () => {
  await db.delete();
  vi.restoreAllMocks();
});

describe("SettingsPage redesign", () => {
  it("displays real pack metadata, language states, attribution link, and runs sync refresh", async () => {
    render(<SettingsPage />);

    expect(await screen.findByText("v1")).toBeInTheDocument();
    expect(screen.getByText("184 KB")).toBeInTheDocument();
    expect(screen.getByText("Installed")).toBeInTheDocument();
    expect(screen.getByText("Not downloaded")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Attribution" })).toHaveAttribute("href", "/attribution");

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(syncNow).toHaveBeenCalledTimes(1);
      expect(screen.getByText("v2")).toBeInTheDocument();
    });
  });

  it("installs Hindi via installLanguage and clears cache only after confirmation", async () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Clear map and photo cache" }));
    expect(screen.getByText("Clear cached maps and photos?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm clear" }));
    expect(await screen.findByText("Map and photo cache cleared.")).toBeInTheDocument();

    const installBtn = await screen.findByRole("button", { name: "Install language" });
    fireEvent.click(installBtn);

    await waitFor(() => {
      expect(installLanguage).toHaveBeenCalledWith("hi");
      expect(screen.getByText("भाषा और क्षेत्र")).toBeInTheDocument();
    });
  });
});
