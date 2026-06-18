import { useEffect, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard, Globe, PlusCircle, ListOrdered, Boxes, Wallet, Truck, Settings, Users, UserCog,
  TrendingDown, TrendingUp, ArrowLeftRight, PackagePlus, Receipt, Zap, Megaphone, Container, FileSpreadsheet, Heart, BriefcaseBusiness,
  ChevronsLeft, Sparkles, ClipboardList, ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrand } from "@/contexts/brand-context";
import { useAccounts, useCategories } from "@/hooks/erp/use-finance-query";
import { TransactionForm } from "@/components/erp/finance/transaction-form";
import { TransferDialog } from "@/components/erp/finance/transfer-dialog";
import type { TxnType } from "@/lib/erp/finance";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const groups: NavGroup[] = [
  {
    label: "Overview",
    items: [{ to: "/erp", label: "Dashboard", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "Sales",
    items: [
      { to: "/erp/orders/web", label: "Web Orders", icon: Globe },
      { to: "/erp/orders/new", label: "Create Order", icon: PlusCircle },
      { to: "/erp/orders/list", label: "Order List", icon: ListOrdered },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/erp/inventory", label: "Inventory", icon: Boxes },
      { to: "/erp/purchase-orders", label: "Purchase Orders", icon: ClipboardList },
      { to: "/erp/stocktake", label: "Stocktake", icon: ClipboardCheck },
      { to: "/erp/courier", label: "Courier", icon: Truck },
      { to: "/erp/reconciliation", label: "Reconciliation", icon: FileSpreadsheet },
      { to: "/erp/suppliers", label: "Suppliers", icon: Users },
      { to: "/erp/imports", label: "Imports", icon: Container },
    ],
  },
  {
    label: "Money",
    items: [{ to: "/erp/finance", label: "Finance", icon: Wallet }],
  },
  {
    label: "Growth",
    items: [
      { to: "/erp/marketing", label: "Marketing", icon: Megaphone },
      { to: "/erp/crm", label: "CRM", icon: Heart },
    ],
  },
  {
    label: "Workspace",
    items: [
      { to: "/erp/hr", label: "HR", icon: BriefcaseBusiness },
      { to: "/erp/users", label: "Users", icon: UserCog },
      { to: "/erp/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function ErpSidebar() {
  const location = useLocation();
  const { activeBrand, brands, brandIds, isAllBrands } = useBrand();
  const brandId = activeBrand?.id ?? null;
  const { data: accounts = [] } = useAccounts(brandIds);
  const { data: categories = [] } = useCategories(brandIds);

  const [txnOpen, setTxnOpen] = useState(false);
  const [txnType, setTxnType] = useState<TxnType>("expense");
  const [transferOpen, setTransferOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(false);

  useEffect(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem("erp.sidebar.collapsed") : null;
    if (v === "1") setCollapsed(true);
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("erp.sidebar.collapsed", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

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

  const isActive = (to: string, exact?: boolean) =>
    exact ? location.pathname === to : location.pathname === to || location.pathname.startsWith(to + "/");

  const NavLinkItem = ({ to, label, icon: Icon, exact }: NavItem) => {
    const active = isActive(to, exact);
    const content = (
      <Link
        to={to as never}
        className={cn(
          "group/link relative flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-200",
          collapsed ? "justify-center px-2 py-2.5 mx-auto w-10" : "px-3 py-2",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary transition-all duration-200",
            active ? "opacity-100 scale-y-100" : "opacity-0 scale-y-50",
          )}
        />
        <Icon className={cn("h-4 w-4 shrink-0 transition-transform duration-200 group-hover/link:scale-110", active && "text-primary")} />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    );
    if (!collapsed) return content;
    return (
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">{label}</TooltipContent>
      </Tooltip>
    );
  };

  const ActionItem = ({ label, icon: Icon, tone, onClick }: { label: string; icon: typeof LayoutDashboard; tone?: string; onClick: () => void }) => {
    const btn = (
      <button
        onClick={onClick}
        disabled={brandIds.length === 0}
        className={cn(
          "group/link w-full flex items-center gap-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed",
          collapsed ? "justify-center px-2 py-2.5 mx-auto w-10" : "px-3 py-2",
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0 transition-transform duration-200 group-hover/link:scale-110", tone)} />
        {!collapsed && <span className="truncate">{label}</span>}
      </button>
    );
    if (!collapsed) return btn;
    return (
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">{label}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider>
      <aside
        data-collapsed={collapsed}
        className={cn(
          "hidden md:flex flex-col border-r border-border bg-card/60 backdrop-blur-sm transition-[width] duration-300 ease-out",
          collapsed ? "w-[68px]" : "w-64",
        )}
      >
        {/* Brand header */}
        <div className={cn("flex items-center border-b border-border h-16 px-3", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-sm shrink-0">
                <Sparkles className="h-4.5 w-4.5 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold tracking-tight leading-tight truncate">ERP Suite</div>
                <div className="text-[10px] text-muted-foreground tracking-wide uppercase">Multi-brand</div>
              </div>
            </div>
          ) : (
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-sm">
              <Sparkles className="h-4.5 w-4.5 text-primary-foreground" />
            </div>
          )}
          {!collapsed && (
            <button
              onClick={toggleCollapsed}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title="Collapse sidebar"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Collapse toggle when collapsed */}
        {collapsed && (
          <button
            onClick={toggleCollapsed}
            className="mx-auto mt-2 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Expand sidebar"
          >
            <ChevronsLeft className="h-4 w-4 rotate-180" />
          </button>
        )}

        <nav className={cn("flex-1 py-3 overflow-y-auto overflow-x-hidden", collapsed ? "px-2" : "px-3")}>
          {groups.map((group, gi) => (
            <div key={group.label} className={cn(gi > 0 && (collapsed ? "mt-3 pt-3 border-t border-border/60" : "mt-4"))}>
              {!collapsed && (
                <div className="px-3 mb-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70 font-semibold">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => <NavLinkItem key={item.to} {...item} />)}
              </div>
            </div>
          ))}

          {/* Quick actions */}
          <div className={cn(collapsed ? "mt-3 pt-3 border-t border-border/60" : "mt-4")}>
            {!collapsed && (
              <div className="px-3 mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70 font-semibold">
                <Zap className="h-3 w-3" /> Quick Actions
              </div>
            )}
            <div className="space-y-0.5">
              {quickActions.map((a) => <ActionItem key={a.label} {...a} />)}
              {quickLinks.map((l) => <NavLinkItem key={l.to} {...l} />)}
            </div>
          </div>
        </nav>

        <div className={cn("border-t border-border text-[11px] text-muted-foreground", collapsed ? "py-2 text-center" : "px-4 py-2.5")}>
          {collapsed ? "v0.1" : "v0.1 · Phase 0"}
        </div>

      {brandIds.length > 0 && (
        <>
          <TransactionForm
            open={txnOpen}
            onClose={() => setTxnOpen(false)}
            brandId={isAllBrands ? null : brandId}
            brands={brands}
            accounts={accounts}
            categories={categories}
            defaultType={txnType}
          />
          <TransferDialog
            open={transferOpen}
            onClose={() => setTransferOpen(false)}
            brandId={isAllBrands ? null : brandId}
            brands={brands}
            accounts={accounts}
          />
        </>
      )}
      </aside>
    </TooltipProvider>
  );
}