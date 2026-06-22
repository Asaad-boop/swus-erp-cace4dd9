import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/finance/simple")({
  beforeLoad: () => {
    throw redirect({ to: "/erp/finance/journal", search: { tab: "quick" } });
  },
});
