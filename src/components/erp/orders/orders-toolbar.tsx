import { Search, X, Calendar as CalendarIcon, SlidersHorizontal, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OrdersFilter } from "@/hooks/erp/use-orders-query";

export function OrdersToolbar({
  filter, onChange, rightSlot,
}: {
  filter: OrdersFilter;
  onChange: (next: OrdersFilter) => void;
  rightSlot?: React.ReactNode;
}) {
  const update = (patch: Partial<OrdersFilter>) => onChange({ ...filter, ...patch, page: 0 });
  const reset = () => onChange({ ...filter, search: "", source: null, courier: null, dateFrom: null, dateTo: null, page: 0 });
  const hasFilters = !!(filter.search || filter.source || filter.dateFrom || filter.dateTo);

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b bg-card">
      <div className="relative flex-1 min-w-[220px] max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search orders…"
          value={filter.search}
          onChange={(e) => update({ search: e.target.value })}
          className="pl-9 h-9 bg-background"
        />
      </div>

      <Button variant="outline" size="sm" className="h-9 gap-1.5" disabled>
        <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
      </Button>

      <div className="inline-flex items-center gap-1.5 rounded-md border h-9 px-2 bg-background text-xs text-muted-foreground">
        <ArrowUpDown className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">Date Created</span>
        <span>(Newest)</span>
      </div>

      <Select value={filter.source ?? "all"} onValueChange={(v) => update({ source: v === "all" ? null : v })}>
        <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Source" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All sources</SelectItem>
          <SelectItem value="website">Website</SelectItem>
          <SelectItem value="manual">Manual</SelectItem>
          <SelectItem value="facebook">Facebook</SelectItem>
          <SelectItem value="phone">Phone</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1 rounded-md border h-9 px-2 bg-background">
        <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          type="date"
          value={filter.dateFrom?.slice(0, 10) ?? ""}
          onChange={(e) => update({ dateFrom: e.target.value ? new Date(e.target.value).toISOString() : null })}
          className="border-0 h-7 px-1 w-[120px] text-xs focus-visible:ring-0"
        />
        <span className="text-muted-foreground text-xs">→</span>
        <Input
          type="date"
          value={filter.dateTo?.slice(0, 10) ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            update({ dateTo: v ? new Date(`${v}T23:59:59`).toISOString() : null });
          }}
          className="border-0 h-7 px-1 w-[120px] text-xs focus-visible:ring-0"
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={reset}>
          <X className="h-3.5 w-3.5 mr-1" />Clear
        </Button>
      )}

      <div className="flex-1" />
      {rightSlot}
    </div>
  );
}