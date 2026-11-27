import { createFileRoute } from "@tanstack/react-router";

import { AttributionPage } from "@/features/settings/AttributionPage";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/attribution")({
  head: () => pageHead("Bhopal guide sources and credits — Voyeger", "Review OpenStreetMap, Wikivoyage and sample illustration attributions for Voyeger."),
  component: AttributionPage,
});