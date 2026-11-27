import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SearchPage } from "@/features/search/SearchPage";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/search")({
  validateSearch: zodValidator(z.object({ q: z.string().optional() })),
  head: () => pageHead("Search Bhopal — Voyeger", "Search the installed English or Hindi Bhopal travel guide, even offline."),
  component: SearchRoute,
});

function SearchRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return <SearchPage query={search.q ?? ""} onQueryChange={(q) => void navigate({ search: (previous) => ({ ...previous, q }) })} />;
}