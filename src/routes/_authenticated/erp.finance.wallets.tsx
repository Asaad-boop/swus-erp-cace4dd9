import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/finance/wallets")({
  component: () => <Navigate to="/erp/finance/accounts" replace />,
});