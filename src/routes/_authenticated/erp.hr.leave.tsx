import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/hr/leave")({
  head: () => ({ meta: [{ title: "Leave — HR" }] }),
  component: () => <Outlet />,
});