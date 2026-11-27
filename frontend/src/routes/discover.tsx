import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { getCityConfig } from "@/config/city";
import { DiscoverPage } from "@/features/discover/DiscoverPage";
import { pageHead } from "@/lib/seo";

const defaultCity = getCityConfig();

export const Route = createFileRoute("/discover")({
  validateSearch: zodValidator(
    z.object({
      filter: z.string().optional(),
      place: z.string().optional(),
      nearLat: z.number().optional(),
      nearLng: z.number().optional(),
    }),
  ),
  head: () =>
    pageHead(
      `Discover ${defaultCity.name.en} — Voyeger`,
      "An offline-first map guide to hidden places, local food and culture.",
    ),
  component: DiscoverRoute,
});

function DiscoverRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const nearCenter: [number, number] | undefined =
    search.nearLat !== undefined && search.nearLng !== undefined
      ? [search.nearLng, search.nearLat]
      : undefined;
  return (
    <DiscoverPage
      filter={search.filter ?? "all"}
      focusPlaceId={search.place ?? ""}
      nearCenter={nearCenter}
      onFilterChange={(filter) =>
        void navigate({ search: (previous) => ({ ...previous, filter }) })
      }
    />
  );
}
