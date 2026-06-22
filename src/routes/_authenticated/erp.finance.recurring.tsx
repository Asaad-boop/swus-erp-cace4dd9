import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/finance/recurring")({
  beforeLoad: () => {
    throw redirect({ to: "/erp/finance/journal", search: { tab: "recurring" } });
  },
});
