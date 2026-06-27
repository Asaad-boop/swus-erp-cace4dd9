import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { Loader2, Wallet, ArrowUpRight, ArrowDownRight, DollarSign, X } from "lucide-react";

import { useBrand } from "@/contexts/brand-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  listAdAccountWallets, getAdAccountWalletDetail,
} from "@/lib/erp/marketing/dollar-purchase.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/marketing/ad-account-funding")({
  head: () => ({ meta: [{ title: "Ad Account Funding — Marketing" }] }),
  component: AdAccountFundingPage,
});

const fmtBDT = (n: number) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(n || 0);
const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n || 0);

function AdAccountFundingPage() {
  const { brandIds } = useBrand();
  const listFn = useServerFn(listAdAccountWallets);
  const [openId, setOpenId] = useState<string | null>(null);

  const wallets = useQuery({
    queryKey: ["mdp-wallet", brandIds.join(",")],
    queryFn: () => listFn({ data: { brandIds } }) as Promise<any[]>,
  });

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Ad Account Funding</h2>
          <p className="text-sm text-muted-foreground">USD wallet & FIFO spend ledger per Meta ad account.</p>
        </div>
      </header>

      {wallets.isLoading ? (
        <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
      ) : (wallets.data?.length ?? 0) === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <Wallet className="h-8 w-8 mx-auto mb-2 opacity-40" />
          No ad accounts found.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {wallets.data?.map((w) => {
            const remaining = Number(w.remaining_usd || 0);
            const purchased = Number(w.total_usd_purchased || 0);
            const spent = Number(w.total_usd_spent || 0);
            const pct = purchased > 0 ? Math.min(100, (spent / purchased) * 100) : 0;
            return (
              <Card key={w.ad_account_id} className="p-4 cursor-pointer hover:shadow-md transition" onClick={() => setOpenId(w.ad_account_id)}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-semibold">{w.ad_account_name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Avg rate {w.avg_effective_rate ? Number(w.avg_effective_rate).toFixed(4) : "—"}</div>
                  </div>
                  <Badge variant="outline" className={cn(remaining > 0 ? "text-emerald-700 border-emerald-200" : "text-rose-700 border-rose-200")}>
                    {fmtUSD(remaining)} left
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Stat icon={ArrowUpRight} label="Purchased" value={fmtUSD(purchased)} subValue={fmtBDT(Number(w.total_bdt_paid))} tint="emerald" />
                  <Stat icon={ArrowDownRight} label="Spent" value={fmtUSD(spent)} subValue={fmtBDT(Number(w.total_bdt_spent))} tint="rose" />
                </div>
                <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-rose-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 flex justify-between">
                  <span>{pct.toFixed(0)}% spent</span>
                  <span>Latest rate {w.latest_purchase_rate ? Number(w.latest_purchase_rate).toFixed(4) : "—"}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <WalletDetailSheet adAccountId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function Stat({ icon: Icon, label, value, subValue, tint }: { icon: any; label: string; value: string; subValue?: string; tint: "emerald" | "rose" }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2.5 py-1.5">
      <div className="flex items-center gap-1 text-xs text-muted-foreground"><Icon className={cn("h-3 w-3", tint === "emerald" ? "text-emerald-600" : "text-rose-600")} /> {label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
      {subValue && <div className="text-[11px] text-muted-foreground tabular-nums">{subValue}</div>}
    </div>
  );
}

function WalletDetailSheet({ adAccountId, onClose }: { adAccountId: string | null; onClose: () => void }) {
  const detailFn = useServerFn(getAdAccountWalletDetail);
  const detail = useQuery({
    queryKey: ["mdp-wallet-detail", adAccountId],
    queryFn: () => detailFn({ data: { adAccountId: adAccountId! } }),
    enabled: !!adAccountId,
  });
  return (
    <Sheet open={!!adAccountId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[min(720px,100vw)] sm:max-w-[720px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span>{detail.data?.summary?.ad_account_name ?? "Ad account"}</span>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
          </SheetTitle>
        </SheetHeader>

        {detail.isLoading ? (
          <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : detail.data ? (
          <div className="space-y-5 mt-3">
            <div className="grid grid-cols-3 gap-2">
              <SmallKpi label="Purchased" value={fmtUSD(Number(detail.data.summary?.total_usd_purchased || 0))} />
              <SmallKpi label="Spent" value={fmtUSD(Number(detail.data.summary?.total_usd_spent || 0))} />
              <SmallKpi label="Remaining" value={fmtUSD(Number(detail.data.summary?.remaining_usd || 0))} highlight />
              <SmallKpi label="BDT Paid" value={fmtBDT(Number(detail.data.summary?.total_bdt_paid || 0))} />
              <SmallKpi label="BDT Spent" value={fmtBDT(Number(detail.data.summary?.total_bdt_spent || 0))} />
              <SmallKpi label="Avg Eff. Rate" value={detail.data.summary?.avg_effective_rate ? Number(detail.data.summary.avg_effective_rate).toFixed(4) : "—"} />
            </div>

            <Section title="FIFO Lots">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total USD</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.data.lots.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No lots yet.</TableCell></TableRow>
                  )}
                  {detail.data.lots.map((l: any) => (
                    <TableRow key={l.id}>
                      <TableCell className="tabular-nums">{format(new Date(l.lot_date), "dd MMM yyyy")}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtUSD(Number(l.usd_total))}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{fmtUSD(Number(l.usd_remaining))}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(l.effective_rate).toFixed(4)}</TableCell>
                      <TableCell>
                        {!l.is_active ? <Badge variant="secondary">Inactive</Badge>
                          : Number(l.usd_remaining) === 0 ? <Badge variant="outline">Consumed</Badge>
                          : <Badge className="bg-emerald-100 text-emerald-700 border-0">Active</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>

            <Section title="Wallet Ledger">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">USD</TableHead>
                    <TableHead className="text-right">BDT</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.data.ledger.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No entries.</TableCell></TableRow>
                  )}
                  {detail.data.ledger.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="tabular-nums text-xs">{format(new Date(e.entry_date), "dd MMM")}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          e.entry_type === "purchase" && "text-emerald-700 border-emerald-200",
                          e.entry_type === "spend" && "text-rose-700 border-rose-200",
                          e.entry_type === "adjustment" && "text-amber-700 border-amber-200",
                        )}>{e.entry_type}</Badge>
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", Number(e.usd_delta) < 0 ? "text-rose-700" : "text-emerald-700")}>
                        {Number(e.usd_delta) > 0 ? "+" : ""}{fmtUSD(Number(e.usd_delta))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBDT(Math.abs(Number(e.bdt_value)))}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.conversion_source}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SmallKpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-md border p-2.5", highlight ? "bg-emerald-50 border-emerald-200" : "bg-muted/30")}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums text-sm mt-0.5">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-3">
      <div className="font-medium text-sm mb-2 flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5 text-muted-foreground" /> {title}</div>
      {children}
    </Card>
  );
}