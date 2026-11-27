import { createFileRoute } from "@tanstack/react-router";

import { AboutPage } from "@/features/about/AboutPage";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/about")({
  head: () => pageHead("About — Voyeger", "Learn about Voyeger's mission, creators, and offline-first Bhopal guide."),
  component: AboutPage,
});
