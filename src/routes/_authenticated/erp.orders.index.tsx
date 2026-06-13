import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/orders/")({
  beforeLoad: () => {
    throw redirect({ to: "/erp/orders/web" });
  },
});