import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Download, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtBdt } from "@/lib/erp/finance";
import { exportToXlsx } from "@/lib/erp/utils/excel";
import { getDrilldownTransactions, type DrilldownRow } from "@/lib/erp/finance-overview.functions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  brandIds: string[];
  from: string;
  to: string;
  type?: "revenue" | "expense" | "income" | "all";
  accountIds?: string[];
};

const PAGE_SIZE = 25;

export function FinanceDrilldownSheet({
  open, onOpenChange, title, subtitle, brandIds, from, to, type = "all", accountIds,
}: Props) {
  const [page, setPage] = useState(1);
  const fetcher = useServerFn(getDrilldownTransactions);

  const q = useQuery({
    queryKey: ["finance_drilldown", brandIds.join(","), from, to, type, (accountIds ?? []).join(","), page],
    enabled: open && brandIds.length > 0,
    queryFn: () => fetcher({ data: { brandIds, from, to, type, accountIds, page, pageSize: PAGE_SIZE } }),
  });

  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const sum = q.data?.sum ?? 0;

  const handleExport = () => {
    const exportRows = rows.map((r: DrilldownRow) => ({
      Date: r.date,
      Type: r.type,
      Description: r.description ?? "",
      Account: r.account ?? "",
      Category: r.category ?? "",
      Reference: r.reference ?? "",
      Amount: r.amount,
    }));
    const fname = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${from}_${to}.xlsx`;
    exportToXlsx(exportRows, "Transactions", fname);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="space-y-1">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {from} → {to}{subtitle ? ` · ${subtitle}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="text-sm">
            <span className="text-muted-foreground">Total ({total} txns):</span>{" "}
            <span className="font-mono font-semibold">{fmtBdt(sum)}</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleExport} disabled={!rows.length}>
              <Download className="h-3.5 w-3.5 mr-1" /> CSV/Excel
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/erp/finance/journal">
                View All <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-3 rounded-md border bg-card">
          {q.isLoading && (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
          )}
          {!q.isLoading && rows.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No transactions in range.</div>
          )}
          {!q.isLoading && rows.length > 0 && (
            <div className="divide-y divide-border/60">
              {rows.map((r) => (
                <div key={r.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                  <Badge
                    variant={r.type === "income" ? "default" : r.type === "expense" ? "destructive" : "secondary"}
                    className="text-[10px] capitalize shrink-0"
                  >
                    {r.type}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="truncate">
                      {r.description || <span className="text-muted-foreground italic">No description</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {r.date}
                      {r.account && ` · ${r.account}`}
                      {r.category && ` · ${r.category}`}
                      {r.reference && ` · ${r.reference}`}
                    </div>
                  </div>
                  <div
                    className={`tabular-nums font-medium shrink-0 ${
                      r.type === "income"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : r.type === "expense"
                          ? "text-rose-600 dark:text-rose-400"
                          : ""
                    }`}
                  >
                    {r.type === "expense" ? "-" : r.type === "income" ? "+" : ""}
                    {fmtBdt(r.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="h-7" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" className="h-7" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}