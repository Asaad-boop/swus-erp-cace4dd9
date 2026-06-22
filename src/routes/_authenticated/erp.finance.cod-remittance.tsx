import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/finance/cod-remittance")({
  beforeLoad: () => {
    throw redirect({ to: "/erp/finance/receivables", search: { tab: "cod" } });
  },
});
