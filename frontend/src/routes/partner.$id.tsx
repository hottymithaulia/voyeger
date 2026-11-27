import { createFileRoute } from "@tanstack/react-router";

import { PartnerPage } from "@/features/partners/PartnerPage";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/partner/$id")({
  head: () => pageHead("Local partner enquiry — Voyeger", "Contact a sample Bhopal partner or save an enquiry to send when online."),
  component: PartnerRoute,
});

function PartnerRoute() {
  const { id } = Route.useParams();
  return <PartnerPage id={id} />;
}