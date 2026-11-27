import { createFileRoute } from "@tanstack/react-router";

import { SavedPage } from "@/features/saved/SavedPage";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/saved")({
  head: () => pageHead("Saved Bhopal places — Voyeger", "Return to places saved in your offline Bhopal guide."),
  component: SavedPage,
});