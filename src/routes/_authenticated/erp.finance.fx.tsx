import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/finance/fx")({
  beforeLoad: () => {
    throw redirect({ to: "/erp/finance/settings", search: { tab: "fx" } });
  },
});
