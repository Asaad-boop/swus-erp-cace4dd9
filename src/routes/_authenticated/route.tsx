import { createFileRoute, Outlet } from "@tanstack/react-router";

// TEMP: auth disabled while building. Re-enable before launch.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: () => <Outlet />,
});