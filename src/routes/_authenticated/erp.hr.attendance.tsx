import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/hr/attendance")({
  head: () => ({ meta: [{ title: "Attendance — HR" }] }),
  component: () => <Outlet />,
});