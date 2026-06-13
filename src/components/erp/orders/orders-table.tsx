import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { customerName, customerPhone, STATUS_GROUPS, STATUS_BADGE, shortId, statusBadge, type OrderRow, type OrderStatus } from "@/lib/erp/orders";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  rows: OrderRow[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onRowClick: (id: string) => void;
  onStatusChange: (id: string, status: OrderStatus) => void;
  pendingStatusId?: string | null;
};

export function OrdersTable({ rows, loading, selectedIds, onToggleSelect, onToggleAll, onRowClick, onStatusChange, pendingStatusId }: Props) {
  const columns: ColumnDef<OrderRow>[] = [
    {
      id: "select",
      header: () => (
        <Checkbox
          checked={rows.length > 0 && rows.every((r) => selectedIds.has(r.id))}
          onCheckedChange={(v) => onToggleAll(!!v)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedIds.has(row.original.id)}
          onCheckedChange={() => onToggleSelect(row.original.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select row"
        />
      ),
      size: 36,
    },
    {
      header: "Order",
      cell: ({ row }) => (
        <div className="font-mono text-xs font-semibold">#{shortId(row.original.id)}</div>
      ),
    },
    {
      header: "Date",
      cell: ({ row }) => (
        <div className="text-xs">
          <div>{format(new Date(row.original.created_at), "dd MMM yy")}</div>
          <div className="text-muted-foreground">{format(new Date(row.original.created_at), "hh:mm a")}</div>
        </div>
      ),
    },
    {
      header: "Customer",
      cell: ({ row }) => (
        <div className="text-sm min-w-[140px]">
          <div className="font-medium truncate">{customerName(row.original)}</div>
          <div className="text-xs text-muted-foreground">{customerPhone(row.original)}</div>
        </div>
      ),
    },
    {
      header: "Location",
      cell: ({ row }) => (
        <div className="text-xs text-muted-foreground max-w-[160px] truncate">
          {[row.original.shipping_city, row.original.shipping_district].filter(Boolean).join(", ") || "—"}
        </div>
      ),
    },
    {
      header: "Total",
      cell: ({ row }) => <div className="font-semibold text-sm">৳ {Number(row.original.total).toLocaleString()}</div>,
    },
    {
      header: "Status",
      cell: ({ row }) => {
        const o = row.original;
        const b = statusBadge(o.status);
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <Select
              value={o.status}
              disabled={pendingStatusId === o.id}
              onValueChange={(v) => onStatusChange(o.id, v as OrderStatus)}
            >
              <SelectTrigger className={cn("h-8 text-xs font-medium border-0 min-w-[120px]", b.className)}>
                <SelectValue>{b.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUS_GROUPS.map((g) => (
                  <div key={g.key}>
                    <div className="px-2 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {g.label}
                    </div>
                    {g.statuses.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">
                        {STATUS_BADGE[s]?.label ?? s.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      },
    },
    {
      header: "Courier",
      cell: ({ row }) => (
        <div className="text-xs">
          <div className="font-medium">{row.original.courier_name ?? "—"}</div>
          {row.original.tracking_number && (
            <div className="text-muted-foreground font-mono">{row.original.tracking_number}</div>
          )}
        </div>
      ),
    },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => (
        <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); onRowClick(row.original.id); }}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
      size: 40,
    },
  ];

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="rounded-xl border bg-card overflow-x-auto shadow-sm">
      <Table>
        <TableHeader className="bg-muted/40">
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="hover:bg-transparent border-b">
              {hg.headers.map((h) => (
                <TableHead key={h.id} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground h-10">
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>
                {columns.map((_c, j) => (
                  <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                No orders found
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors border-b last:border-0"
                onClick={() => onRowClick(row.original.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}