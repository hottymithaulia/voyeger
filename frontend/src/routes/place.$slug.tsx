import { createFileRoute } from "@tanstack/react-router";

import { PlacePage } from "@/features/place/PlacePage";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/place/$slug")({
  head: ({ params }) => {
    const title = params.slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
    return pageHead(`${title} — Voyeger Bhopal guide`, `Offline sample guide to ${title} in Bhopal, with local context, visit notes and nearby places.`);
  },
  component: PlaceRoute,
});

function PlaceRoute() {
  const { slug } = Route.useParams();
  return <PlacePage slug={slug} />;
}