import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Loader2, Phone, ShoppingCart, Trash2, CheckCircle2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { useAbandonedCartsQuery } from "@/hooks/erp/use-abandoned-carts-query";
import {
  convertAbandonedCartFn,
  deleteAbandonedCartFn,
  type AbandonedCartRow,
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
    <div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-[140px]">Updated</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Address</TableHead>
              <TableHead className="text-center">Items</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead>Step</TableHead>
              <TableHead className="text-right w-[220px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  <Loader2 className="inline h-4 w-4 animate-spin mr-2" /> Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && error && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-destructive">
                  <AlertCircle className="inline h-5 w-5 mr-2 opacity-80" />
                  {error.message}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  <ShoppingCart className="inline h-5 w-5 mr-2 opacity-60" />
                  Kono incomplete checkout nai
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
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
                <TableRow key={r.id} className="hover:bg-muted/30">
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {new Date(r.updated_at).toLocaleString(undefined, {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell className="font-medium">{r.customer_name ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">{r.customer_phone ?? "—"}</TableCell>
                  <TableCell
                    className="max-w-[280px] text-xs text-muted-foreground truncate"
                    title={addr}
                  >
                    {addr || "—"}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{items.length}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    ৳{Number(r.subtotal ?? 0).toFixed(0)}
                  </TableCell>
                  <TableCell>
                    {r.last_step ? (
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                        {r.last_step}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      {r.customer_phone && (
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Call"
                        >
                          <a href={`tel:${r.customer_phone}`}>
                            <Phone className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="h-8 gap-1"
                        disabled={busy || !(r.brand_id ?? brandId)}
                        onClick={() => convertMut.mutate(r)}
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
                        onClick={() => {
                          if (confirm("Ei incomplete cart delete korbe?")) delMut.mutate(r.id);
                        }}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

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
    </div>
  );
}
