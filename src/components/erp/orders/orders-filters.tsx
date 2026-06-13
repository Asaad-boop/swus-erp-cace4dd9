import { Search, X, SlidersHorizontal, Calendar as CalendarIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { STATUS_GROUPS, STATUS_BADGE, type OrderStatus } from "@/lib/erp/orders";
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
  const hasFilters = !!(filter.search || filter.statuses.length || filter.source || filter.dateFrom || filter.dateTo);

  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, phone, tracking…"
            value={filter.search}
            onChange={(e) => update({ search: e.target.value })}
            className="pl-9 h-9"
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />Status
              {filter.statuses.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                  {filter.statuses.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3 max-h-[420px] overflow-y-auto">
            <div className="space-y-3">
              {STATUS_GROUPS.map((group) => (
                <div key={group.key}>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{group.label}</div>
                  <div className="space-y-1">
                    {group.statuses.map((s) => {
                      const active = filter.statuses.includes(s);
                      const meta = STATUS_BADGE[s];
                      return (
                        <label key={s} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted/60 cursor-pointer">
                          <Checkbox checked={active} onCheckedChange={() => toggleStatus(s)} />
                          <span className="text-sm flex-1">{meta?.label ?? s.replace(/_/g, " ")}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

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

        <div className="flex items-center gap-1.5 rounded-md border h-9 px-2 bg-background">
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="date"
            value={filter.dateFrom?.slice(0, 10) ?? ""}
            onChange={(e) => update({ dateFrom: e.target.value ? new Date(e.target.value).toISOString() : null })}
            className="border-0 h-7 px-1 w-[125px] text-xs focus-visible:ring-0"
          />
          <span className="text-muted-foreground text-xs">→</span>
          <Input
            type="date"
            value={filter.dateTo?.slice(0, 10) ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              update({ dateTo: v ? new Date(`${v}T23:59:59`).toISOString() : null });
            }}
            className="border-0 h-7 px-1 w-[125px] text-xs focus-visible:ring-0"
          />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={reset}><X className="h-3.5 w-3.5 mr-1" />Clear all</Button>
        )}
      </div>

      {filter.statuses.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">Active:</span>
          {filter.statuses.map((s) => {
            const meta = STATUS_BADGE[s];
            return (
              <Badge key={s} className={(meta?.className ?? "") + " gap-1 pr-1 cursor-pointer"} onClick={() => toggleStatus(s)}>
                {meta?.label ?? s.replace(/_/g, " ")}
                <X className="h-3 w-3 opacity-70" />
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}