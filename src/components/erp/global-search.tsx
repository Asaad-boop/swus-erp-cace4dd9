import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import {
  Package, ShoppingCart, Users, LayoutDashboard, Wallet, Boxes, ClipboardList, Globe, Heart,
  BarChart3, Loader2, Clock, ChevronRight, ChevronDown, ExternalLink, User as UserIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type Ctx = { open: boolean; setOpen: (v: boolean) => void; openSearch: () => void };
const SearchCtx = createContext<Ctx | null>(null);
export function useGlobalSearch() {
  const c = useContext(SearchCtx);
  if (!c) throw new Error("useGlobalSearch must be used within GlobalSearchProvider");
  return c;
}

const PAGES: { name: string; path: string; section: string; icon: typeof LayoutDashboard }[] = [
  { name: "Dashboard", path: "/erp", section: "Overview", icon: LayoutDashboard },
  { name: "Web Orders", path: "/erp/orders/web", section: "Sales", icon: Globe },
  { name: "Order List", path: "/erp/orders/list", section: "Sales", icon: ClipboardList },
  { name: "Create Order", path: "/erp/orders/new", section: "Sales", icon: ShoppingCart },
  { name: "Inventory", path: "/erp/inventory", section: "Operations", icon: Boxes },
  { name: "Reorder Queue", path: "/erp/reorder-queue", section: "Operations", icon: Package },
  { name: "Purchase Orders", path: "/erp/purchase-orders", section: "Operations", icon: ClipboardList },
  { name: "Stocktake", path: "/erp/stocktake", section: "Operations", icon: ClipboardList },
  { name: "Courier", path: "/erp/courier", section: "Operations", icon: Package },
  { name: "Returns & Exchanges", path: "/erp/returns", section: "Operations", icon: Package },
  { name: "COD Reconciliation", path: "/erp/reconciliation", section: "Operations", icon: ClipboardList },
  { name: "Suppliers", path: "/erp/suppliers", section: "Operations", icon: Users },
  { name: "Imports", path: "/erp/imports", section: "Operations", icon: Package },
  { name: "Finance Overview", path: "/erp/finance", section: "Money", icon: Wallet },
  { name: "Finance Transactions", path: "/erp/finance/simple", section: "Money", icon: Wallet },
  { name: "Finance Journal", path: "/erp/finance/journal", section: "Money", icon: Wallet },
  { name: "Finance Accounts", path: "/erp/finance/accounts", section: "Money", icon: Wallet },
  { name: "Finance Wallets", path: "/erp/finance/wallets", section: "Money", icon: Wallet },
  { name: "Finance Receivables", path: "/erp/finance/receivables", section: "Money", icon: Wallet },
  { name: "Finance Payables", path: "/erp/finance/payables", section: "Money", icon: Wallet },
  { name: "Finance COD Remittance", path: "/erp/finance/cod-remittance", section: "Money", icon: Wallet },
  { name: "Finance Bank Reconciliation", path: "/erp/finance/reconciliation", section: "Money", icon: Wallet },
  { name: "Finance Reports", path: "/erp/finance/reports", section: "Money", icon: Wallet },
  { name: "Finance Product P&L", path: "/erp/finance/product-profitability", section: "Money", icon: Wallet },
  { name: "Marketing Overview", path: "/erp/marketing", section: "Growth", icon: BarChart3 },
  { name: "Marketing Campaigns", path: "/erp/marketing/campaigns", section: "Growth", icon: BarChart3 },
  { name: "Marketing SKU P&L", path: "/erp/marketing/sku-pnl", section: "Growth", icon: BarChart3 },
  { name: "Marketing Expenses", path: "/erp/marketing/expenses", section: "Growth", icon: BarChart3 },
  { name: "Marketing Attribution", path: "/erp/marketing/attribution", section: "Growth", icon: BarChart3 },
  { name: "CRM Customers", path: "/erp/crm", section: "Growth", icon: Heart },
  { name: "Analytics", path: "/erp/analytics", section: "Growth", icon: BarChart3 },
  { name: "Live Analytics", path: "/erp/analytics/live", section: "Growth", icon: BarChart3 },
  { name: "HR", path: "/erp/hr", section: "Workspace", icon: Users },
  { name: "Users", path: "/erp/users", section: "Workspace", icon: Users },
  { name: "Settings", path: "/erp/settings", section: "Workspace", icon: Wallet },
  { name: "Diagnostics", path: "/erp/diagnostics", section: "Workspace", icon: BarChart3 },
];

const RECENT_KEY = "erp.search.recent";
function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
function saveRecent(q: string) {
  if (!q || typeof window === "undefined") return;
  const cur = loadRecent().filter((x) => x !== q);
  cur.unshift(q);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, 5))); } catch { /* ignore */ }
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function escapeIlike(s: string) {
  return s.replace(/[%,()]/g, " ").trim();
}

function SearchDialog({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const navigate = useNavigate();
  const { brandIds } = useBrand();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 300);
  const term = escapeIlike(debounced);
  const enabled = term.length >= 2 && brandIds.length > 0;
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => { if (open) setRecent(loadRecent()); }, [open]);
  useEffect(() => { if (!open) setQuery(""); }, [open]);

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", term, brandIds],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const like = `%${term}%`;
      const isUuid = /^[0-9a-f-]{6,}$/i.test(term);
      const [ordersRes, productsRes, customersRes] = await Promise.all([
        applyBrandScope(
          supabase.from("orders").select("id, invoice_no, shipping_name, shipping_phone, guest_name, guest_phone, shipping_city, total, status, created_at"),
          brandIds,
        )
          .or(
            [
              `shipping_name.ilike.${like}`,
              `shipping_phone.ilike.${like}`,
              `guest_name.ilike.${like}`,
              `guest_phone.ilike.${like}`,
              `shipping_city.ilike.${like}`,
              `invoice_no.ilike.${like}`,
              ...(isUuid ? [`id.eq.${term}`] : []),
            ].join(","),
          )
          .order("created_at", { ascending: false })
          .limit(50),
        applyBrandScope(
          supabase.from("products").select("id, title, sku, stock, image"),
          brandIds,
        ).or(`title.ilike.${like},sku.ilike.${like}`).limit(5),
        supabase.from("crm_customers_v")
          .select("customer_key, name, orders_count, lifetime_value, brand_ids")
          .or(`name.ilike.${like},customer_key.ilike.${like}`)
          .overlaps("brand_ids", brandIds)
          .limit(5),
      ]);
      return {
        orders: (ordersRes.data ?? []) as Array<{ id: string; invoice_no: string | null; shipping_name: string | null; shipping_phone: string | null; guest_name: string | null; guest_phone: string | null; shipping_city: string | null; total: number | null; status: string | null; created_at: string | null }>,
        products: (productsRes.data ?? []) as Array<{ id: string; title: string; sku: string | null; stock: number | null; image: string | null }>,
        customers: (customersRes.data ?? []) as Array<{ customer_key: string; name: string | null; orders_count: number | null; lifetime_value: number | null }>,
      };
    },
  });

  const matchedPages = useMemo(() => {
    if (term.length < 2) return [];
    const q = term.toLowerCase();
    return PAGES.filter((p) => p.name.toLowerCase().includes(q) || p.section.toLowerCase().includes(q)).slice(0, 6);
  }, [term]);

  const go = useCallback((path: string) => {
    saveRecent(query.trim());
    setOpen(false);
    navigate({ to: path as never });
  }, [navigate, query, setOpen]);

  const showResults = term.length >= 2;
  const quickLinks = PAGES.slice(0, 6);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search orders, products, customers, pages..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[480px]">
        {!showResults && (
          <>
            {recent.length > 0 && (
              <CommandGroup heading="Recent searches">
                {recent.map((r) => (
                  <CommandItem key={r} value={`recent-${r}`} onSelect={() => setQuery(r)}>
                    <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                    {r}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading="Quick links">
              {quickLinks.map((p) => (
                <CommandItem key={p.path} value={`quick-${p.path}`} onSelect={() => go(p.path)}>
                  <p.icon className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span>{p.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{p.section}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {showResults && (
          <>
            {isFetching && (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Searching...
              </div>
            )}
            {!isFetching && !data?.orders.length && !data?.products.length && !data?.customers.length && matchedPages.length === 0 && (
              <CommandEmpty>No results for "{query}"</CommandEmpty>
            )}
            {data && data.orders.length > 0 && (
              <CommandGroup heading={`Orders (${data.orders.length})`}>
                {data.orders.map((o) => (
                  <CommandItem key={o.id} value={`o-${o.id}`} onSelect={() => go(`/erp/orders/${o.id}`)}>
                    <ShoppingCart className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
                    <span className="font-mono text-xs shrink-0">#{o.invoice_no || o.id.slice(0, 8).toUpperCase()}</span>
                    <span className="mx-2 truncate">
                      · {o.shipping_name || o.guest_name || "—"}
                      {(o.shipping_phone || o.guest_phone) && (
                        <span className="text-muted-foreground"> · {o.shipping_phone || o.guest_phone}</span>
                      )}
                      {o.shipping_city && <span className="text-muted-foreground"> · {o.shipping_city}</span>}
                    </span>
                    <span className="ml-auto flex items-center gap-2 shrink-0">
                      <span className="text-xs">৳{Number(o.total ?? 0).toLocaleString()}</span>
                      {o.status && <Badge variant="outline" className="text-[10px]">{o.status}</Badge>}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {data && data.products.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={`Products (${data.products.length})`}>
                  {data.products.map((p) => (
                    <CommandItem key={p.id} value={`p-${p.id}`} onSelect={() => go(`/erp/inventory?q=${encodeURIComponent(p.sku || p.title)}`)}>
                      {p.image ? (
                        <img src={p.image} alt="" className="h-6 w-6 rounded object-cover mr-2" />
                      ) : (
                        <Package className="h-4 w-4 mr-2 text-muted-foreground" />
                      )}
                      <span className="truncate">{p.title}</span>
                      {p.sku && <span className="ml-2 text-xs text-muted-foreground">{p.sku}</span>}
                      <Badge variant="outline" className="ml-auto text-[10px]">Stock: {p.stock ?? 0}</Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {data && data.customers.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={`Customers (${data.customers.length})`}>
                  {data.customers.map((c) => (
                    <CommandItem key={c.customer_key} value={`c-${c.customer_key}`} onSelect={() => go(`/erp/crm?q=${encodeURIComponent(c.customer_key)}`)}>
                      <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                      <span className="truncate">{c.name || c.customer_key}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{c.customer_key}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {c.orders_count ?? 0} orders · ৳{Number(c.lifetime_value ?? 0).toLocaleString()}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {matchedPages.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={`Pages (${matchedPages.length})`}>
                  {matchedPages.map((p) => (
                    <CommandItem key={p.path} value={`pg-${p.path}`} onSelect={() => go(p.path)}>
                      <p.icon className="h-4 w-4 mr-2 text-muted-foreground" />
                      <span>{p.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{p.section}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openSearch = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const value = useMemo(() => ({ open, setOpen, openSearch }), [open, openSearch]);

  return (
    <SearchCtx.Provider value={value}>
      {children}
      <SearchDialog open={open} setOpen={setOpen} />
    </SearchCtx.Provider>
  );
}