import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, FileText, Printer, ImageDown, Pencil, Send, X as XIcon, ListPlus, StickyNote, Phone, MapPin, Copy, ImageIcon } from "lucide-react";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { customerName, customerPhone, invoiceDisplay, statusAccent, statusBadge, type OrderRow, type OrderStatus } from "@/lib/erp/orders";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

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
  const copyText = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success(`${label} copied`));
  };

  const columns: ColumnDef<OrderRow>[] = [
    {
      id: "select",
      header: () => (
        <div className="pl-1">
          <Checkbox
            checked={rows.length > 0 && rows.every((r) => selectedIds.has(r.id))}
            onCheckedChange={(v) => onToggleAll(!!v)}
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="relative pl-1">
          <span
            aria-hidden
            className="absolute left-[-12px] top-1/2 -translate-y-1/2 h-8 w-[3px] rounded-r-full"
            style={{ backgroundColor: statusAccent(row.original.status) }}
          />
          <Checkbox
            checked={selectedIds.has(row.original.id)}
            onCheckedChange={() => onToggleSelect(row.original.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Select row"
          />
        </div>
      ),
      size: 40,
    },
    {
      header: "Date",
      cell: ({ row }) => (
        <div className="text-xs leading-tight whitespace-nowrap">
          <div className="font-medium">{format(new Date(row.original.created_at), "dd/MM/yyyy,")}</div>
          <div>{format(new Date(row.original.created_at), "h:mm a")}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{relTime(row.original.created_at)}</div>
        </div>
      ),
    },
    {
      header: "Invoice",
      cell: ({ row }) => {
        const inv = invoiceDisplay(row.original);
        return (
          <div className="flex items-center gap-1 whitespace-nowrap">
            <span className="font-mono text-xs font-semibold">{inv}</span>
            <button
              onClick={(e) => { e.stopPropagation(); copyText(inv, "Invoice"); }}
              className="p-0.5 rounded hover:bg-muted text-muted-foreground"
              title="Copy invoice number"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        );
      },
    },
    {
      header: "Products",
      cell: ({ row }) => <ProductsCell items={row.original.items ?? []} />,
    },
    {
      header: "Customer",
      cell: ({ row }) => {
        const o = row.original;
        const phone = customerPhone(o);
        const addr = [o.shipping_address, o.shipping_city, o.shipping_district].filter(Boolean).join(", ");
        const name = customerName(o);
        return (
          <div className="min-w-[220px] max-w-[280px]">
            <div className="text-xs space-y-0.5 min-w-0">
              <div className="font-semibold text-sm truncate text-foreground">{name}</div>
              {phone && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Phone className="h-3 w-3 shrink-0" />
                  <span className="font-mono">{phone}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); copyText(phone, "Phone"); }}
                    className="p-0.5 rounded hover:bg-muted opacity-0 group-hover/row:opacity-100 transition-opacity"
                    title="Copy phone"
                  >
                    <Copy className="h-2.5 w-2.5" />
                  </button>
                </div>
              )}
              {addr && (
                <div className="flex items-start gap-1.5 text-muted-foreground/80">
                  <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                  <span className="line-clamp-2 leading-snug">{addr}</span>
                </div>
              )}
            </div>
          </div>
        );
      },
    },
    {
      header: "Note",
      cell: ({ row }) => (
        <div className="text-xs text-muted-foreground max-w-[180px] line-clamp-2 leading-snug">
          {row.original.customer_note || row.original.admin_notes || <span className="text-muted-foreground/50">—</span>}
        </div>
      ),
    },
    {
      header: "Status",
      cell: ({ row }) => {
        const b = statusBadge(row.original.status);
        const accent = statusAccent(row.original.status);
        return (
          <span className={cn("inline-flex items-center gap-1.5 pl-1.5 pr-2.5 h-6 rounded-full text-[11px] font-semibold whitespace-nowrap", b.className)}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
            {b.label}
          </span>
        );
      },
    },
    {
      header: "Total",
      cell: ({ row }) => (
        <div className="text-right whitespace-nowrap">
          <div className="font-bold text-sm tabular-nums">৳{Number(row.original.total).toLocaleString()}</div>
          {row.original.payment_method && (
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{row.original.payment_method}</div>
          )}
        </div>
      ),
    },
    {
      header: "Courier",
      cell: ({ row }) => (
        <div className="text-xs whitespace-nowrap">
          <div className="font-medium">{row.original.courier_name ?? <span className="text-muted-foreground/50">—</span>}</div>
          {row.original.tracking_number && (
            <div className="text-muted-foreground font-mono text-[10px]">{row.original.tracking_number}</div>
          )}
        </div>
      ),
    },
    {
      header: "Source",
      cell: ({ row }) => (
        <div className="text-xs capitalize whitespace-nowrap">{row.original.source ?? "—"}</div>
      ),
    },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => {
        const o = row.original;
        const busy = pendingStatusId === o.id;
        return (
          <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => onRowClick(o.id)}>
                  <FileText className="h-4 w-4" /> Order Details
                </DropdownMenuItem>
                <DropdownMenuItem disabled><Printer className="h-4 w-4" /> Print</DropdownMenuItem>
                <DropdownMenuItem disabled><ImageDown className="h-4 w-4" /> JPG Export</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onRowClick(o.id)}>
                  <Pencil className="h-4 w-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onStatusChange(o.id, "ready_to_ship")} disabled={o.status === "ready_to_ship"}>
                  <Send className="h-4 w-4" /> Send to RTS
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onStatusChange(o.id, "cancelled")}
                  disabled={o.status === "cancelled"}
                  className="text-destructive focus:text-destructive"
                >
                  <XIcon className="h-4 w-4" /> Cancel
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled><ListPlus className="h-4 w-4" /> Create Task</DropdownMenuItem>
                <DropdownMenuItem disabled><StickyNote className="h-4 w-4" /> Add Note</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
      size: 48,
    },
  ];

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="bg-card overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/40 sticky top-0 z-10 backdrop-blur">
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="hover:bg-transparent border-b">
              {hg.headers.map((h) => (
                <TableHead key={h.id} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground h-10 px-3">
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
                className="cursor-pointer transition-colors border-b last:border-0 hover:bg-muted/50 group/row"
                onClick={() => onRowClick(row.original.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="py-3 px-3 align-middle">
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

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  if (d <= 0) {
    const h = Math.floor(diff / 3_600_000);
    return h <= 0 ? "just now" : `${h}h ago`;
  }
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const m = Math.floor(d / 30);
  return `${m} mo ago`;
}

function ProductsCell({ items }: { items: NonNullable<OrderRow["items"]> }) {
  if (!items || items.length === 0) {
    return <span className="text-muted-foreground/50 text-xs">—</span>;
  }
  const totalQty = items.reduce((s, i) => s + (i.quantity ?? 0), 0);
  const visible = items.slice(0, 3);
  const extra = items.length - visible.length;
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-2 group"
        >
          <div className="flex -space-x-2">
            {visible.map((it) => (
              <Thumb key={it.id} src={it.image} name={it.name} />
            ))}
            {extra > 0 && (
              <div className="h-9 w-9 rounded-lg border-2 border-card bg-muted text-[10px] font-bold flex items-center justify-center text-muted-foreground shadow-sm">
                +{extra}
              </div>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground leading-tight">
            <div className="font-semibold text-foreground tabular-nums">{items.length} item{items.length === 1 ? "" : "s"}</div>
            <div className="tabular-nums">Qty {totalQty}</div>
          </div>
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80 p-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold px-1 pb-1.5">Items</div>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-2.5 p-1.5 rounded-md hover:bg-muted/60">
              <Thumb src={it.image} name={it.name} size={40} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{it.name ?? "Unnamed"}</div>
                {it.variant_label && (
                  <div className="text-[10px] text-muted-foreground truncate">{it.variant_label}</div>
                )}
              </div>
              <div className="text-right text-[11px] shrink-0">
                <div className="font-semibold tabular-nums">×{it.quantity}</div>
                {it.line_total != null && (
                  <div className="text-muted-foreground tabular-nums">৳{Number(it.line_total).toLocaleString()}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function Thumb({ src, name, size = 36 }: { src: string | null; name: string | null; size?: number }) {
  const style = { width: size, height: size };
  if (!src) {
    return (
      <div
        style={style}
        className="rounded-lg border-2 border-card bg-gradient-to-br from-muted to-muted/60 flex items-center justify-center shadow-sm shrink-0"
        title={name ?? ""}
      >
        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground/60" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name ?? ""}
      loading="lazy"
      style={style}
      className="rounded-lg border-2 border-card object-cover shadow-sm shrink-0 bg-muted"
      onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
    />
  );
}