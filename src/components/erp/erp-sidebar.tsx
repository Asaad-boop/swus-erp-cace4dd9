import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard, Globe, PlusCircle, ListOrdered, Boxes, Wallet, Truck, Settings, Users,
  TrendingDown, TrendingUp, ArrowLeftRight, PackagePlus, Receipt, Zap, Megaphone, Container,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrand } from "@/contexts/brand-context";
import { useAccounts, useCategories } from "@/hooks/erp/use-finance-query";
import { TransactionForm } from "@/components/erp/finance/transaction-form";
import { TransferDialog } from "@/components/erp/finance/transfer-dialog";
import type { TxnType } from "@/lib/erp/finance";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const nav: NavItem[] = [
  { to: "/erp", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/erp/orders/web", label: "Web Orders", icon: Globe },
  { to: "/erp/orders/new", label: "Create New Order", icon: PlusCircle },
  { to: "/erp/orders/list", label: "Order List", icon: ListOrdered },
  { to: "/erp/inventory", label: "Inventory", icon: Boxes },
  { to: "/erp/finance", label: "Finance", icon: Wallet },
  { to: "/erp/courier", label: "Courier", icon: Truck },
  { to: "/erp/suppliers", label: "Suppliers", icon: Users },
  { to: "/erp/imports", label: "Imports", icon: Container },
  { to: "/erp/marketing", label: "Marketing", icon: Megaphone },
  { to: "/erp/settings", label: "Settings", icon: Settings },
];

export function ErpSidebar() {
  const location = useLocation();
  const { activeBrand } = useBrand();
  const brandId = activeBrand?.id ?? null;
  const { data: accounts = [] } = useAccounts(brandId);
  const { data: categories = [] } = useCategories(brandId);

  const [txnOpen, setTxnOpen] = useState(false);
  const [txnType, setTxnType] = useState<TxnType>("expense");
  const [transferOpen, setTransferOpen] = useState(false);

  const openTxn = (t: TxnType) => { setTxnType(t); setTxnOpen(true); };

  const quickActions = [
    { label: "Add Expense", icon: TrendingDown, tone: "text-red-600", onClick: () => openTxn("expense") },
    { label: "Add Income", icon: TrendingUp, tone: "text-emerald-600", onClick: () => openTxn("income") },
    { label: "Transfer Money", icon: ArrowLeftRight, tone: "text-blue-600", onClick: () => setTransferOpen(true) },
  ];

  const quickLinks = [
    { to: "/erp/orders/new", label: "New Order", icon: PackagePlus },
    { to: "/erp/finance/simple", label: "Quick Entry", icon: Receipt },
    { to: "/erp/finance/product-profitability", label: "Product P&L", icon: TrendingUp },
  ];

  return (
    <aside className="hidden md:flex flex-col w-60 border-r border-border bg-card">
      <div className="px-6 py-5 border-b border-border">
        <div className="text-lg font-bold tracking-tight">ERP Suite</div>
        <div className="text-xs text-muted-foreground mt-0.5">Multi-brand control</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map(({ to, label, icon: Icon, exact }) => {
          const active = exact ? location.pathname === to : location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to as never}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}

        <div className="pt-5">
          <div className="px-3 mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            <Zap className="h-3 w-3" /> Quick Actions
          </div>
          <div className="space-y-1">
            {quickActions.map(({ label, icon: Icon, tone, onClick }) => (
              <button
                key={label}
                onClick={onClick}
                disabled={!brandId}
                className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon className={cn("h-4 w-4", tone)} />
                {label}
              </button>
            ))}
            {quickLinks.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to as never}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
      <div className="px-6 py-3 text-xs text-muted-foreground border-t border-border">
        v0.1 · Phase 0
      </div>

      {brandId && (
        <>
          <TransactionForm
            open={txnOpen}
            onClose={() => setTxnOpen(false)}
            brandId={brandId}
            accounts={accounts}
            categories={categories}
            defaultType={txnType}
          />
          <TransferDialog
            open={transferOpen}
            onClose={() => setTransferOpen(false)}
            brandId={brandId}
            accounts={accounts}
          />
        </>
      )}
    </aside>
  );
}