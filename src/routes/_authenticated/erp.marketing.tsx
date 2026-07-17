import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandSwitcher } from "@/components/erp/brand-switcher";
import { useBrand } from "@/contexts/brand-context";
import { LastSyncedBadge } from "@/components/erp/marketing/last-synced-badge";
import { MarketingLeftRail, MARKETING_SECTIONS } from "@/components/erp/marketing/_shell/left-rail";
import { MarketingActionInbox } from "@/components/erp/marketing/_shell/action-inbox";
import { Button } from "@/components/ui/button";

const marketingSearchSchema = z.object({
  brand: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_authenticated/erp/marketing")({
  head: () => ({ meta: [{ title: "Marketing — ERP" }] }),
  validateSearch: zodValidator(marketingSearchSchema),
  component: MarketingLayout,
});

function MarketingLayout() {
  const { pathname } = useLocation();
  const { brandIds, brands, activeBrand, isAllBrands, setActiveBrandId } = useBrand();
  const search = Route.useSearch();
  const navigate = useNavigate();

  // ── URL <-> BrandContext sync (?brand=all | <slug>) ──
  useEffect(() => {
    if (!brands.length) return;
    const urlBrand = search.brand;
    if (!urlBrand) {
      const next = isAllBrands ? "all" : (activeBrand?.slug ?? "all");
      navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, brand: next }), replace: true });
      return;
    }
    if (urlBrand === "all") {
      if (!isAllBrands) setActiveBrandId("all");
    } else {
      const match = brands.find((b) => b.slug === urlBrand);
      if (match && match.id !== activeBrand?.id) setActiveBrandId(match.id);
    }
     
  }, [search.brand, brands.length]);

  useEffect(() => {
    if (!brands.length) return;
    const desired = isAllBrands ? "all" : (activeBrand?.slug ?? "all");
    if (search.brand !== desired) {
      navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, brand: desired }), replace: true });
    }
     
  }, [isAllBrands, activeBrand?.slug]);

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const active = MARKETING_SECTIONS.find((s) => s.matches(pathname)) ?? MARKETING_SECTIONS[0];

  return (
    <div className="flex flex-col h-full bg-[#F8F9FA]">
      {/* ── Global marketing header ── */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-gray-100 bg-white px-3 md:px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setLeftOpen((v) => !v)}
            aria-label={leftOpen ? "Collapse sections" : "Expand sections"}
          >
            {leftOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </Button>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#1877F2]/10 text-[#1877F2]">
            <BarChart3 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Marketing
            </div>
            <div className="text-sm font-semibold text-gray-900 truncate leading-tight">
              {active.label}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <BrandSwitcher />
          {brandIds.length > 0 && <LastSyncedBadge brandIds={brandIds} />}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setRightOpen((v) => !v)}
            aria-label={rightOpen ? "Hide action inbox" : "Show action inbox"}
          >
            {rightOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {/* ── 3-pane body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside
          className={cn(
            "shrink-0 border-r border-gray-100 bg-white overflow-y-auto transition-all",
            leftOpen ? "w-52" : "w-0",
          )}
        >
          {leftOpen && <MarketingLeftRail />}
        </aside>

        <main className="flex-1 min-w-0 overflow-auto p-3 md:p-4">
          <Outlet />
        </main>

        <aside
          className={cn(
            "shrink-0 overflow-hidden transition-all",
            rightOpen ? "w-72" : "w-0",
          )}
        >
          {rightOpen && <MarketingActionInbox />}
        </aside>
      </div>
    </div>
  );
}