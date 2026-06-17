import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/crm")({
  head: () => ({ meta: [{ title: "CRM — Customers" }] }),
  component: () => <Outlet />,
});