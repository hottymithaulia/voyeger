import { createFileRoute } from "@tanstack/react-router";

import { PlannerPage } from "@/features/planner/PlannerPage";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/planner")({
  head: () => pageHead("Bhopal day planner — Voyeger", "Build a short offline day itinerary from Bhopal landmarks to nearby local places."),
  component: PlannerPage,
});