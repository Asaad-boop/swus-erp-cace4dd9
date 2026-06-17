import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/hr/payroll")({
  component: () => <Outlet />,
});