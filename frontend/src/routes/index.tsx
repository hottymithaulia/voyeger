import { createFileRoute } from "@tanstack/react-router";

import { getCityConfig } from "@/config/city";
import { WelcomePage } from "@/features/welcome/WelcomePage";
import { pageHead } from "@/lib/seo";

const defaultCity = getCityConfig();

export const Route = createFileRoute("/")({
  head: () =>
    pageHead(
      `Voyeger — ${defaultCity.name.en}`,
      defaultCity.tagline.en,
    ),
  component: IndexRoute,
});

function IndexRoute() {
  return <WelcomePage />;
}
