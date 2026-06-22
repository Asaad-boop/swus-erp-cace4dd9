import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/finance/reconciliation")({
  beforeLoad: () => {
    throw redirect({ to: "/erp/finance/wallets", search: { tab: "reconciliation" } });
  },
});
