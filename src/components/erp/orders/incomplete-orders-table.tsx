import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import {
  AlertCircle,
  Loader2,
  Phone,
  ShoppingCart,
  Trash2,
  CheckCircle2,
  MapPin,
  Copy,
  ImageIcon,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CopyIconBtn, PhoneActions } from "@/components/erp/orders/contact-actions";
import { CourierRateBadge } from "@/components/erp/orders/orders-table";
import { cn } from "@/lib/utils";
import { useAbandonedCartsQuery } from "@/hooks/erp/use-abandoned-carts-query";
import {
  convertAbandonedCartFn,
  deleteAbandonedCartFn,
  type AbandonedCartRow,
  type AbandonedCartItem,
} from "@/lib/erp/abandoned-carts.functions";

type Props = {
  brandId: string | null;
  search: string;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onOpenOrder: (orderId: string) => void;
};

export function IncompleteOrdersTable({
  brandId,
  search,
  page,
  pageSize,
  onPageChange,
  onOpenOrder,
}: Props) {
  const qc = useQueryClient();
  const convertAbandonedCart = useServerFn(convertAbandonedCartFn);
  const deleteAbandonedCart = useServerFn(deleteAbandonedCartFn);
  const { data, isLoading, isFetching, error } = useAbandonedCartsQuery({
    brandId,
    search,
    page,
    pageSize,
    enabled: true,
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmCart, setConfirmCart] = useState<AbandonedCartRow | null>(null);
  const [deleteCart, setDeleteCart] = useState<AbandonedCartRow | null>(null);

  const convertMut = useMutation({
    mutationFn: async (cart: AbandonedCartRow) => {
      setPendingId(cart.id);
      const targetBrandId = cart.brand_id ?? brandId;
      if (!targetBrandId) throw new Error("Brand select koro");
      return convertAbandonedCart({
        data: { id: cart.id, brandId: targetBrandId },
      });
    },
    onSuccess: (res) => {
      toast.success(`Order created${res.invoiceNo ? " · " + res.invoiceNo : ""}`);
      qc.invalidateQueries({ queryKey: ["abandoned-carts"] });
      qc.invalidateQueries({ queryKey: ["abandoned-carts-count"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      onOpenOrder(res.orderId);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setPendingId(null),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      setPendingId(id);
      return deleteAbandonedCart({ data: { id } });
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["abandoned-carts"] });
      qc.invalidateQueries({ queryKey: ["abandoned-carts-count"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setPendingId(null),
  });

  return (
    <div className="bg-card overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/40 sticky top-0 z-10 backdrop-blur">
          <TableRow className="hover:bg-transparent border-b">
            {[
              "Date",
              "Products",
              "Customer",
              "Status",
              "Total",
              "Step",
              "",
            ].map((h, i) => (
              <TableHead
                key={i}
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wider text-muted-foreground h-10 px-3",
                  h === "" && "w-[60px]",
                )}
              >
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 7 }).map((_c, j) => (
                  <TableCell key={j} className="py-3 px-3">
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : error ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-12 text-destructive">
                <AlertCircle className="inline h-5 w-5 mr-2 opacity-80" />
                {error.message}
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                <ShoppingCart className="inline h-5 w-5 mr-2 opacity-60" />
                Kono incomplete checkout nai
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => {
              const items = Array.isArray(r.cart_items) ? r.cart_items : [];
              const addr = [
                r.shipping_address,
                r.shipping_thana,
                r.shipping_city,
                r.shipping_district,
              ]
                .filter(Boolean)
                .join(", ");
              const busy = pendingId === r.id;
              return (
                <TableRow
                  key={r.id}
                  className="border-b last:border-0 hover:bg-muted/50 transition-colors group/row"
                >
                  <TableCell className="py-3 px-3 align-middle relative">
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-[3px] rounded-r-full bg-amber-500"
                    />
                    <div className="text-xs leading-tight whitespace-nowrap pl-1">
                      <div className="font-medium">
                        {format(new Date(r.updated_at), "dd/MM/yyyy,")}
                      </div>
                      <div>{format(new Date(r.updated_at), "h:mm a")}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {relTime(r.updated_at)}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="py-3 px-3 align-middle">
                    <CartProductsCell items={items} />
                  </TableCell>

                  <TableCell className="py-3 px-3 align-middle">
                    <div className="min-w-[220px] max-w-[280px]">
                      <div className="text-xs space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="font-semibold text-sm truncate text-foreground">
                            {r.customer_name ?? "—"}
                          </span>
                          {r.customer_name && (
                            <CopyIconBtn value={r.customer_name} label="Name" className="shrink-0" />
                          )}
                        </div>
                        {r.customer_phone && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Phone className="h-3 w-3 shrink-0" />
                            <span className="tabular-nums truncate">{r.customer_phone}</span>
                            <CourierRateBadge phone={r.customer_phone} brandId={r.brand_id ?? brandId} />
                            <PhoneActions phone={r.customer_phone} className="ml-auto" />
                          </div>
                        )}
                        {addr && (
                          <div className="flex items-start gap-1.5 text-muted-foreground/80">
                            <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                            <span className="line-clamp-2 leading-snug flex-1">{addr}</span>
                            <CopyIconBtn value={addr} label="Address" className="shrink-0 mt-0.5" />
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="py-3 px-3 align-middle">
                    <span className="inline-flex items-center gap-1.5 pl-2 pr-3 h-7 rounded-full text-[12px] font-extrabold uppercase tracking-wider whitespace-nowrap bg-amber-100 text-amber-800 border border-amber-300 shadow-sm ring-2 ring-amber-200/60 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 dark:ring-amber-900/40">
                      <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.5} />
                      Incomplete
                    </span>
                  </TableCell>

                  <TableCell className="py-3 px-3 align-middle">
                    <div className="text-right whitespace-nowrap">
                      <div className="font-bold text-sm tabular-nums">
                        ৳{Number(r.subtotal ?? 0).toLocaleString()}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        {items.length} item{items.length === 1 ? "" : "s"}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="py-3 px-3 align-middle">
                    {r.last_step ? (
                      <span className="inline-flex items-center px-2 h-5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-muted text-muted-foreground border">
                        {r.last_step}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50 text-xs">—</span>
                    )}
                  </TableCell>

                  <TableCell className="py-3 px-3 align-middle text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        size="sm"
                        className="h-8 gap-1"
                        disabled={busy || !(r.brand_id ?? brandId)}
                        onClick={() => setConfirmCart(r)}
                        title="Confirm as order"
                      >
                        {busy && convertMut.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        Confirm
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => setDeleteCart(r)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between text-xs px-4 py-2.5 border-t bg-muted/20">
        <span className="text-muted-foreground">
          {total.toLocaleString()} incomplete · Page {page + 1} of {totalPages}
          {isFetching && " · syncing"}
        </span>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <AlertDialog open={!!confirmCart} onOpenChange={(o) => !o && setConfirmCart(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Confirm as order?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  Ei incomplete checkout ke confirmed order banano hobe.
                </div>
                {confirmCart && (
                  <div className="rounded-md border bg-muted/40 p-2.5 text-xs space-y-1">
                    <div>
                      <span className="text-muted-foreground">Customer:</span>{" "}
                      <span className="font-semibold">{confirmCart.customer_name ?? "—"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Phone:</span>{" "}
                      <span className="font-mono">{confirmCart.customer_phone ?? "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>
                        <span className="text-muted-foreground">Items:</span>{" "}
                        {(confirmCart.cart_items ?? []).length}
                      </span>
                      <span className="font-bold tabular-nums">
                        ৳{Number(confirmCart.subtotal ?? 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={convertMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={convertMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirmCart) {
                  const cart = confirmCart;
                  setConfirmCart(null);
                  convertMut.mutate(cart);
                }
              }}
            >
              {convertMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
              )}
              Confirm Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteCart} onOpenChange={(o) => !o && setDeleteCart(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete incomplete cart?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ei incomplete checkout permanently delete hobe. Eta undo kora jabe na.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={delMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={delMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (deleteCart) {
                  const id = deleteCart.id;
                  setDeleteCart(null);
                  delMut.mutate(id);
                }
              }}
            >
              {delMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1.5" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function CartProductsCell({ items }: { items: AbandonedCartItem[] }) {
  if (!items || items.length === 0) {
    return <span className="text-muted-foreground/50 text-xs">—</span>;
  }
  const totalQty = items.reduce((s, i) => s + Number(i.quantity ?? i.qty ?? 0), 0);
  const visible = items.slice(0, 3);
  const extra = items.length - visible.length;
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-2 group"
        >
          <div className="flex -space-x-2">
            {visible.map((it, i) => (
              <CartThumb key={(it.id ?? it.product_id ?? i) + "-" + i} src={it.image ?? null} name={it.name ?? null} />
            ))}
            {extra > 0 && (
              <div className="h-9 w-9 rounded-lg border-2 border-card bg-muted text-[10px] font-bold flex items-center justify-center text-muted-foreground shadow-sm">
                +{extra}
              </div>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground leading-tight">
            <div className="font-semibold text-foreground tabular-nums">
              {items.length} item{items.length === 1 ? "" : "s"}
            </div>
            <div className="tabular-nums">Qty {totalQty}</div>
          </div>
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80 p-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold px-1 pb-1.5">
          Cart Items
        </div>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {items.map((it, i) => {
            const qty = Number(it.quantity ?? it.qty ?? 0);
            const price = Number(it.unit_price ?? it.price ?? 0);
            return (
              <div key={i} className="flex items-center gap-2.5 p-1.5 rounded-md hover:bg-muted/60">
                <CartThumb src={it.image ?? null} name={it.name ?? null} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{it.name ?? "Unnamed"}</div>
                  {it.variant_label && (
                    <div className="text-[10px] text-muted-foreground truncate">{it.variant_label}</div>
                  )}
                </div>
                <div className="text-right text-[11px] shrink-0">
                  <div className="font-semibold tabular-nums">×{qty}</div>
                  {price > 0 && (
                    <div className="text-muted-foreground tabular-nums">
                      ৳{(price * qty).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function CartThumb({
  src,
  name,
  size = 36,
}: {
  src: string | null;
  name: string | null;
  size?: number;
}) {
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
      onError={(e) => {
        (e.target as HTMLImageElement).style.visibility = "hidden";
      }}
    />
  );
}
