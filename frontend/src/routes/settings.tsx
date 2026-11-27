import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/features/settings/SettingsPage";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/settings")({
  head: () => pageHead("Voyeger settings — Bhopal offline guide", "Manage installed languages, your offline pack, and saved map storage."),
  component: SettingsPage,
});