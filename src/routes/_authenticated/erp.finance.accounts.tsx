import { createFileRoute } from "@tanstack/react-router";
import { WalletsPage } from "@/components/erp/finance/pages/wallets";

export const Route = createFileRoute("/_authenticated/erp/finance/accounts")({
  head: () => ({ meta: [{ title: "Accounts — Finance" }] }),
  component: WalletsPage,
});