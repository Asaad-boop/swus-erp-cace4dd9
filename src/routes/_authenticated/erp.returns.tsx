import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/returns")({
  head: () => ({ meta: [{ title: "Returns & Exchanges — ERP" }] }),
  component: () => <Outlet />,
});