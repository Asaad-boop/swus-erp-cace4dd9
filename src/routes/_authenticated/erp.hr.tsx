import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/hr")({
  head: () => ({ meta: [{ title: "HR — Human Resources" }] }),
  component: () => <Outlet />,
});