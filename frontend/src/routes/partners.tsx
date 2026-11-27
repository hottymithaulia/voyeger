import { createFileRoute } from "@tanstack/react-router";

import { PartnersPage } from "@/features/partners/PartnersPage";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/partners")({
  head: () => pageHead("Bhopal local partners — Voyeger", "Explore sample local stays, food and craft partners in the Bhopal guide."),
  component: PartnersPage,
});