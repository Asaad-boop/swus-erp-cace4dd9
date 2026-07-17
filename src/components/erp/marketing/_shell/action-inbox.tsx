import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Inbox,
  RefreshCw,
  Wallet,
  Link2,
  Tag,
  CheckCircle2,
} from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { getMarketingActionInbox } from "@/lib/erp/marketing/action-inbox.functions";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type Item = {
  key: string;
  tone: "red" | "amber" | "blue";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail?: string;
  to?: string;
};

const TONES: Record<Item["tone"], { dot: string; bar: string; text: string; ring: string }> = {
  red: {
    dot: "bg-rose-500",
    bar: "bg-rose-500/10",
    text: "text-rose-700",
    ring: "ring-rose-200",
  },
  amber: {
    dot: "bg-amber-500",
    bar: "bg-amber-500/10",
    text: "text-amber-700",
    ring: "ring-amber-200",
  },
  blue: {
    dot: "bg-sky-500",
    bar: "bg-sky-500/10",
    text: "text-sky-700",
    ring: "ring-sky-200",
  },
};

export function MarketingActionInbox() {
  const { brandIds } = useBrand();
  const fn = useServerFn(getMarketingActionInbox);
  const q = useQuery({
    queryKey: ["mkt", "action-inbox", brandIds.slice().sort().join(",")],
    queryFn: () => fn({ data: { brandIds } }),
    enabled: brandIds.length > 0,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const items: Item[] = [];
  const d = q.data;
  if (d) {
    if (d.syncHealth.status === "stale") {
      const mins = d.syncHealth.staleMinutes;
      items.push({
        key: "sync-stale",
        tone: "red",
        icon: RefreshCw,
        title: "Sync is stale",
        detail: mins != null ? `Last success ${formatMins(mins)} ago` : "No recent successful sync",
        to: "/erp/marketing/sync",
      });
    }
    for (const acc of d.syncHealth.erroredAccounts) {
      items.push({
        key: `err-${acc.id}`,
        tone: "red",
        icon: AlertTriangle,
        title: `${acc.name} — sync error`,
        detail: acc.error?.slice(0, 80) ?? "Check the ad account status",
        to: "/erp/marketing/accounts",
      });
    }
    if (d.unassignedCampaigns > 0) {
      items.push({
        key: "unassigned",
        tone: "amber",
        icon: Tag,
        title: `${d.unassignedCampaigns} campaigns without brand`,
        detail: "Assign to a brand so revenue & ROAS attribute correctly",
        to: "/erp/marketing/accounts",
      });
    }
    if (d.pendingAttribution > 0) {
      items.push({
        key: "attribution",
        tone: "amber",
        icon: Link2,
        title: `${d.pendingAttribution} attribution candidates pending`,
        detail: "Review suggested order → campaign matches",
        to: "/erp/marketing/attribution",
      });
    }
    for (const w of d.lowWalletAccounts) {
      items.push({
        key: `wallet-${w.id}`,
        tone: "blue",
        icon: Wallet,
        title: `${w.name} wallet low`,
        detail: `$${w.remaining_usd.toFixed(2)} remaining — top up`,
        to: "/erp/finance/dollar-purchase",
      });
    }
  }

  return (
    <aside className="flex h-full w-full flex-col bg-white border-l border-gray-100">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Inbox className="h-4 w-4 text-[#1877F2]" />
          <span className="text-sm font-semibold text-gray-900 truncate">Action Inbox</span>
        </div>
        {items.length > 0 && (
          <span className="text-[10px] font-bold text-white bg-[#1877F2] rounded-full px-2 py-0.5 shrink-0">
            {items.length}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-1.5">
        {q.isLoading && (
          <>
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </>
        )}
        {!q.isLoading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center px-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-50 text-emerald-600 mb-2">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-gray-700">All clear</p>
            <p className="text-xs text-muted-foreground mt-1">
              Nothing needs your attention right now.
            </p>
          </div>
        )}
        {items.map((it) => {
          const t = TONES[it.tone];
          const Icon = it.icon;
          const inner = (
            <div className={cn(
              "group relative rounded-lg border border-gray-100 bg-white p-2.5 hover:shadow-sm hover:ring-2 transition-all",
              t.ring,
            )}>
              <div className="flex items-start gap-2">
                <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md", t.bar, t.text)}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium leading-tight text-gray-900 truncate">
                    {it.title}
                  </p>
                  {it.detail && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                      {it.detail}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
          return it.to ? (
            <Link key={it.key} to={it.to as never} className="block">
              {inner}
            </Link>
          ) : (
            <div key={it.key}>{inner}</div>
          );
        })}
      </div>
    </aside>
  );
}

function formatMins(m: number) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}