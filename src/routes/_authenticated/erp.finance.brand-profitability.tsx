import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/finance/brand-profitability")({
  beforeLoad: () => {
    throw redirect({ to: "/erp/finance/product-profitability", search: { tab: "brand" } });
  },
});
