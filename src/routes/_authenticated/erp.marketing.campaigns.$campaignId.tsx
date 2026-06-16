import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, subDays } from "date-fns";
import { ArrowLeft, Loader2, Plus, Trash2, Package, Search } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  getCampaignDetail,
  listCampaignProducts,
  linkCampaignProduct,
  unlinkCampaignProduct,
  updateCampaignProduct,
  searchBrandProducts,
} from "@/lib/erp/marketing/campaigns.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/campaigns/$campaignId")({
  component: CampaignDetailPage,
});

const RANGES: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

function fmtMoney(n: number) {
  return `BDT ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function fmtNum(n: number) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function CampaignDetailPage() {
  const { campaignId } = Route.useParams();
  const [rangeKey, setRangeKey] = useState("30d");
  const { from, to } = useMemo(() => {
    const days = RANGES[rangeKey] ?? 30;
    const today = new Date();
    return { from: format(subDays(today, days - 1), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
  }, [rangeKey]);

  const fn = useServerFn(getCampaignDetail);
  const q = useQuery({
    queryKey: ["mkt", "campaign-detail", campaignId, from, to],
    queryFn: () => fn({ data: { campaignId, from, to } }),
  });

  if (q.isLoading) {
    return <div className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="h-5 w-5 inline animate-spin mr-2" /> Loading…</div>;
  }
  if (q.isError || !q.data) {
    return <div className="py-10 text-center text-sm text-red-600">{(q.error as any)?.message ?? "Campaign load failed"}</div>;
  }
  const d = q.data;
  const c: any = d.campaign;
  const t: any = d.totals;
  const maxSpend = Math.max(...d.series.map((s) => s.spend), 1);
  const brandId: string | null = c.brand_id ?? null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/erp/marketing/campaigns"><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Campaigns</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
          <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{c.mkt_ad_accounts?.name}</Badge>
            <Badge variant="outline">{c.objective ?? "—"}</Badge>
            <Badge>{c.effective_status ?? c.status ?? "—"}</Badge>
            <span className="font-mono text-xs">{c.external_id}</span>
          </div>
        </div>
        <Select value={rangeKey} onValueChange={setRangeKey}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Spend" value={fmtMoney(t.spend)} />
        <Kpi label="Meta Purchases" value={fmtNum(t.meta_purchases)} hint={`Rev ${fmtMoney(t.meta_purchase_value)}`} />
        <Kpi label="Confirmed Orders" value={fmtNum(t.confirmed_orders)} hint={`Rev ${fmtMoney(t.confirmed_revenue)}`} />
        <Kpi label="Delivered Orders" value={fmtNum(t.delivered_orders)} hint={`Rev ${fmtMoney(t.delivered_revenue)} · Ret ${t.return_orders}`} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Daily Spend</CardTitle></CardHeader>
        <CardContent>
          {d.series.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No insight data in this range.</div>
          ) : (
            <div className="flex items-end gap-1 h-32">
              {d.series.map((s) => (
                <div key={s.date} className="flex-1 flex flex-col items-center gap-1" title={`${s.date} · ${fmtMoney(s.spend)}`}>
                  <div className="w-full bg-primary/80 rounded-t" style={{ height: `${Math.max(2, (s.spend / maxSpend) * 100)}%` }} />
                </div>
              ))}
            </div>
          )}
          <div className="text-xs text-muted-foreground mt-2 flex justify-between">
            <span>{d.from}</span><span>{d.to}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Adsets ({d.adsets.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {d.adsets.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No adsets synced.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Adset</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Impr.</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Meta Pur.</TableHead>
                  <TableHead className="text-right">Meta Rev.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.adsets.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell><Badge variant="outline">{a.effective_status ?? a.status ?? "—"}</Badge></TableCell>
                    <TableCell className="text-right">{fmtMoney(a.spend)}</TableCell>
                    <TableCell className="text-right">{fmtNum(a.impressions)}</TableCell>
                    <TableCell className="text-right">{fmtNum(a.clicks)}</TableCell>
                    <TableCell className="text-right">{fmtNum(a.meta_purchases)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(a.meta_purchase_value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <LinkedProductsCard campaignId={campaignId} brandId={brandId} />
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-xl font-semibold mt-1">{value}</div>
        {hint ? <div className="text-xs text-muted-foreground mt-1">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function LinkedProductsCard({ campaignId, brandId }: { campaignId: string; brandId: string | null }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listCampaignProducts);
  const linkFn = useServerFn(linkCampaignProduct);
  const unlinkFn = useServerFn(unlinkCampaignProduct);
  const updateFn = useServerFn(updateCampaignProduct);

  const q = useQuery({
    queryKey: ["mkt", "campaign-products", campaignId],
    queryFn: () => listFn({ data: { campaignId } }),
  });

  const [pickerOpen, setPickerOpen] = useState(false);

  const unlinkMut = useMutation({
    mutationFn: (linkId: string) => unlinkFn({ data: { linkId } }),
    onSuccess: () => {
      toast.success("Unlinked");
      qc.invalidateQueries({ queryKey: ["mkt", "campaign-products", campaignId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const weightMut = useMutation({
    mutationFn: (v: { linkId: string; weight: number }) =>
      updateFn({ data: { linkId: v.linkId, weight: v.weight } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mkt", "campaign-products", campaignId] }),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const rows = (q.data ?? []) as any[];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="h-4 w-4" /> Linked Products ({rows.length})
        </CardTitle>
        <Button size="sm" onClick={() => setPickerOpen(true)} className="gap-1.5" disabled={!brandId}>
          <Plus className="h-3.5 w-3.5" /> Add Product
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Kono product link kora nei. Attribution fallback + product profit allocation er jonno products link korun.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Meta Expense</TableHead>
                <TableHead className="w-32">Weight</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {r.products?.image ? (
                        <img src={r.products.image} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="font-medium">{r.products?.title ?? "—"}</div>
                      {r.products && !r.products.is_active ? (
                        <Badge variant="outline" className="text-xs">Inactive</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{r.products?.sku ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.products?.price ? `BDT ${Number(r.products.price).toLocaleString()}` : "—"}</TableCell>
                  <TableCell className="text-right font-medium">
                    {Number(r.allocated_meta_spend ?? 0) > 0 ? fmtMoney(Number(r.allocated_meta_spend)) : "—"}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      max={100}
                      defaultValue={r.weight}
                      className="h-8 w-20"
                      onBlur={(e) => {
                        const w = Number(e.target.value);
                        if (w !== Number(r.weight)) weightMut.mutate({ linkId: r.id, weight: w });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { if (confirm("Unlink this product?")) unlinkMut.mutate(r.id); }}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {brandId ? (
        <ProductPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          brandId={brandId}
          excludeIds={rows.map((r) => r.product_id)}
          onPick={async (productId) => {
            try {
              await linkFn({ data: { campaignId, productId } });
              toast.success("Product linked");
              qc.invalidateQueries({ queryKey: ["mkt", "campaign-products", campaignId] });
              setPickerOpen(false);
            } catch (e: any) {
              toast.error(e?.message ?? "Failed");
            }
          }}
        />
      ) : null}
    </Card>
  );
}

function ProductPicker({
  open, onOpenChange, brandId, excludeIds, onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  brandId: string;
  excludeIds: string[];
  onPick: (productId: string) => void;
}) {
  const searchFn = useServerFn(searchBrandProducts);
  const [query, setQuery] = useState("");

  const q = useQuery({
    queryKey: ["mkt", "brand-products", brandId, query],
    queryFn: () => searchFn({ data: { brandId, query, limit: 30 } }),
    enabled: open,
  });

  const taken = new Set(excludeIds);
  const rows = ((q.data ?? []) as any[]).filter((p) => !taken.has(p.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link a Product</DialogTitle>
          <DialogDescription>
            Brand er product gulo theke select korun. Linked products attribution fallback ar product profit allocation e use hobe.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or SKU…"
            className="pl-9"
          />
        </div>
        <div className="max-h-[55vh] overflow-y-auto rounded-md border">
          {q.isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No products found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {p.image ? (
                          <img src={p.image} alt="" className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="font-medium">{p.title}</div>
                        {!p.is_active ? <Badge variant="outline" className="text-xs">Inactive</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{p.sku ?? "—"}</TableCell>
                    <TableCell className="text-right">{p.price ? `BDT ${Number(p.price).toLocaleString()}` : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => onPick(p.id)}>Link</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
