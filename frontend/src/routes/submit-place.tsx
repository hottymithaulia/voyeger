import { createFileRoute } from "@tanstack/react-router";

import { SubmitPlacePage } from "@/features/submit/SubmitPlacePage";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/submit-place")({
  head: () => pageHead("Add a Place — Voyeger", "Suggest a hidden gem, local food spot, or heritage place in Bhopal."),
  component: SubmitPlacePage,
});
