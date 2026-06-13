import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/erp/orders";
import { Badge } from "@/components/ui/badge";
import type { OrdersFilter } from "@/hooks/erp/use-orders-query";

export function OrdersFilters({
  filter, onChange,
}: {
  filter: OrdersFilter;
  onChange: (next: OrdersFilter) => void;
}) {
  const update = (patch: Partial<OrdersFilter>) => onChange({ ...filter, ...patch, page: 0 });
  const toggleStatus = (s: OrderStatus) => {
    const next = filter.statuses.includes(s)
      ? filter.statuses.filter((x) => x !== s)
      : [...filter.statuses, s];
    update({ statuses: next });
  };
  const reset = () => onChange({ ...filter, search: "", statuses: [], source: null, courier: null, dateFrom: null, dateTo: null, page: 0 });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, phone, tracking…"
            value={filter.search}
            onChange={(e) => update({ search: e.target.value })}
            className="pl-8"
          />
        </div>
        <Select value={filter.source ?? "all"} onValueChange={(v) => update({ source: v === "all" ? null : v })}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="website">Website</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="phone">Phone</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={filter.dateFrom?.slice(0, 10) ?? ""}
          onChange={(e) => update({ dateFrom: e.target.value ? new Date(e.target.value).toISOString() : null })}
          className="w-[150px]"
        />
        <Input
          type="date"
          value={filter.dateTo?.slice(0, 10) ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            update({ dateTo: v ? new Date(`${v}T23:59:59`).toISOString() : null });
          }}
          className="w-[150px]"
        />
        {(filter.search || filter.statuses.length || filter.source || filter.dateFrom || filter.dateTo) && (
          <Button variant="ghost" size="sm" onClick={reset}><X className="h-4 w-4 mr-1" />Clear</Button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ORDER_STATUSES.map((s) => {
          const active = filter.statuses.includes(s);
          return (
            <Badge
              key={s}
              variant={active ? "default" : "outline"}
              className="cursor-pointer capitalize hover:opacity-80"
              onClick={() => toggleStatus(s)}
            >
              {s.replace(/_/g, " ")}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}