import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Search, Tag as TagIcon, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { CrmKpiCards } from "@/components/erp/crm/kpi-cards";
import { CrmImportDialog } from "@/components/erp/crm/import-dialog";
import { SEGMENT_LABELS, SEGMENT_TONES } from "@/lib/erp/crm/segments";
import { listCrmCustomers, exportCrmCustomersCsv, listCrmTags, bulkAddCrmTag } from "@/lib/erp/crm/crm.functions";
import type { CrmFilters, CrmSort, CrmSegment } from "@/lib/erp/crm/types";

export const Route = createFileRoute("/_authenticated/erp/crm/")({
  head: () => ({ meta: [{ title: "Customers — CRM" }] }),
  component: CrmListPage,
});

const PAGE_SIZE = 50;

function fmtBdt(n: number) {
  return `৳${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(n)}`;
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function CrmListPage() {
  const { brandIds, isAllBrands, brands } = useBrand();
  const qc = useQueryClient();
  const listFn = useServerFn(listCrmCustomers);
  const exportFn = useServerFn(exportCrmCustomersCsv);
  const tagsFn = useServerFn(listCrmTags);
  const bulkTagFn = useServerFn(bulkAddCrmTag);

  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | "registered" | "guest">("all");
  const [segment, setSegment] = useState<CrmSegment | "all">("all");
  const [tag, setTag] = useState<string>("all");
  const [sort, setSort] = useState<CrmSort>("ltv_desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkTagValue, setBulkTagValue] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const brandNameById = useMemo(() => new Map(brands.map((b) => [b.id, b.name] as const)), [brands]);

  const filters: CrmFilters = {
    search: search.trim() || undefined,
    brandIds: isAllBrands ? undefined : brandIds,
    type,
    segment,
    tag: tag === "all" ? undefined : tag,
  };

  const queryKey = ["crm-list", filters, sort, page] as const;
  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: () => listFn({ data: { filters, sort, page, pageSize: PAGE_SIZE } }),
    staleTime: 30_000,
  });

  const { data: allTags = [] } = useQuery({
    queryKey: ["crm-tags"],
    queryFn: () => tagsFn(),
    staleTime: 60_000,
  });

  const exportMut = useMutation({
    mutationFn: () => exportFn({ data: { filters, sort } }),
    onSuccess: (res) => {
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `crm-customers-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${res.count} customers`);
    },
    onError: (e: any) => toast.error(e.message ?? "Export failed"),
  });

  const bulkTagMut = useMutation({
    mutationFn: () => bulkTagFn({ data: { customerKeys: Array.from(selected), tag: bulkTagValue.trim() } }),
    onSuccess: () => {
      toast.success(`Tag added to ${selected.size} customers`);
      setBulkTagOpen(false);
      setBulkTagValue("");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["crm-list"] });
      qc.invalidateQueries({ queryKey: ["crm-tags"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.customer_key));
  const toggleAllOnPage = () => {
    const next = new Set(selected);
    if (allOnPageSelected) rows.forEach((r) => next.delete(r.customer_key));
    else rows.forEach((r) => next.add(r.customer_key));
    setSelected(next);
  };
  const toggleRow = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Customers
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAllBrands ? "All brands" : brands.find((b) => brandIds[0] === b.id)?.name ?? "—"} · {total.toLocaleString()} customers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1.5" />
            Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportMut.mutate()} disabled={exportMut.isPending}>
            <Download className="h-4 w-4 mr-1.5" />
            {exportMut.isPending ? "Exporting…" : "Export CSV"}
          </Button>
        </div>
      </div>

      <CrmKpiCards kpis={data?.kpis} loading={isLoading} />

      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, phone, email…"
              className="pl-8"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={type} onValueChange={(v: any) => { setType(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="registered">Registered</SelectItem>
              <SelectItem value="guest">Guest</SelectItem>
            </SelectContent>
          </Select>
          <Select value={segment} onValueChange={(v: any) => { setSegment(v); setPage(1); }}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All segments</SelectItem>
              {(Object.keys(SEGMENT_LABELS) as CrmSegment[]).map((s) => (
                <SelectItem key={s} value={s}>{SEGMENT_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tag} onValueChange={(v) => { setTag(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Tag" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v: any) => setSort(v)}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ltv_desc">Top LTV</SelectItem>
              <SelectItem value="ltv_asc">Lowest LTV</SelectItem>
              <SelectItem value="orders_desc">Most orders</SelectItem>
              <SelectItem value="orders_asc">Fewest orders</SelectItem>
              <SelectItem value="last_order_desc">Recent order</SelectItem>
              <SelectItem value="last_order_asc">Oldest order</SelectItem>
              <SelectItem value="first_order_desc">Newest customer</SelectItem>
            </SelectContent>
          </Select>
          {selected.size > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setBulkTagOpen(true)}>
              <TagIcon className="h-4 w-4 mr-1.5" /> Tag {selected.size}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allOnPageSelected} onCheckedChange={toggleAllOnPage} />
                </TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Segment</TableHead>
                <TableHead>Brands</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">LTV</TableHead>
                <TableHead className="text-right">AOV</TableHead>
                <TableHead>Last order</TableHead>
                <TableHead>Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">Loading customers…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">No customers found</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.customer_key} className="hover:bg-accent/30">
                  <TableCell>
                    <Checkbox checked={selected.has(r.customer_key)} onCheckedChange={() => toggleRow(r.customer_key)} />
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/erp/crm/$customerId"
                      params={{ customerId: r.customer_key }}
                      className="block group"
                    >
                      <div className="font-medium group-hover:text-primary">{r.name || "Unnamed"}</div>
                      <div className="text-xs text-muted-foreground">{r.customer_key}{r.email ? ` · ${r.email}` : ""}</div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.is_registered ? "default" : "secondary"} className="text-[10px]">
                      {r.is_registered ? "Registered" : "Guest"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium ${SEGMENT_TONES[r.segment]}`}>
                      {SEGMENT_LABELS[r.segment]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[160px]">
                      {(r.brand_ids ?? []).slice(0, 3).map((bid) => (
                        <Badge key={bid} variant="outline" className="text-[10px]">
                          {brandNameById.get(bid) ?? "—"}
                        </Badge>
                      ))}
                      {(r.brand_ids?.length ?? 0) > 3 && (
                        <Badge variant="outline" className="text-[10px]">+{(r.brand_ids?.length ?? 0) - 3}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.orders_count}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{fmtBdt(r.lifetime_value)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{fmtBdt(r.avg_order_value)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{fmtDate(r.last_order_at)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[140px]">
                      {r.tags.slice(0, 2).map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                      ))}
                      {r.tags.length > 2 && <Badge variant="secondary" className="text-[10px]">+{r.tags.length - 2}</Badge>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="text-xs text-muted-foreground">
              Page {page} of {totalPages} · {total.toLocaleString()} customers
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1 || isFetching} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages || isFetching} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Bulk tag dialog */}
      <Dialog open={bulkTagOpen} onOpenChange={setBulkTagOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tag {selected.size} customers</DialogTitle></DialogHeader>
          <Input
            placeholder="Tag name (e.g. vip, wholesale)"
            value={bulkTagValue}
            onChange={(e) => setBulkTagValue(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkTagOpen(false)}>Cancel</Button>
            <Button
              disabled={!bulkTagValue.trim() || bulkTagMut.isPending}
              onClick={() => bulkTagMut.mutate()}
            >
              {bulkTagMut.isPending ? "Tagging…" : "Apply tag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CrmImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}