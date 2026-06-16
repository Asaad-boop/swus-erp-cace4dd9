import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronDown, Search, Package, Plus, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { listProductsForPicker, quickCreateProduct } from "@/lib/erp/imports/imports.functions";
import { cn } from "@/lib/utils";

export type PickedProduct = {
  id: string | null; // null = ad-hoc (not in inventory)
  title: string;
  sku?: string | null;
  image?: string | null;
};

type Props = {
  brandId: string;
  value: PickedProduct;
  onChange: (p: PickedProduct) => void;
};

export function ProductPicker({ brandId, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSku, setNewSku] = useState("");
  const [creating, setCreating] = useState(false);

  const listFn = useServerFn(listProductsForPicker);
  const createFn = useServerFn(quickCreateProduct);

  const { data: products = [], isFetching, refetch } = useQuery({
    queryKey: ["po-product-picker", brandId, search],
    enabled: !!brandId && open,
    queryFn: () => listFn({ data: { brandId, search } }),
  });

  useEffect(() => {
    if (!createOpen) {
      setNewName("");
      setNewSku("");
    }
  }, [createOpen]);

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error("Product name required"); return; }
    setCreating(true);
    try {
      const res = await createFn({ data: { brandId, title: newName.trim(), sku: newSku.trim() || undefined } });
      onChange({ id: res.id, title: res.title, sku: newSku.trim() || null, image: null });
      toast.success(`Created "${res.title}"`);
      setCreateOpen(false);
      setOpen(false);
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal h-9"
          >
            <span className="flex items-center gap-2 truncate min-w-0">
              {value.image ? (
                <img src={value.image} alt="" className="h-5 w-5 rounded object-cover flex-shrink-0" />
              ) : (
                <Package className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              )}
              <span className={cn("truncate", !value.title && "text-muted-foreground")}>
                {value.title || "Select or type product…"}
              </span>
              {value.id && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex-shrink-0">Linked</span>}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px] p-0" align="start">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search inventory by name, SKU…"
                className="h-9 pl-7"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            {isFetching && (
              <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Loading…
              </div>
            )}
            {!isFetching && products.length === 0 && (
              <div className="p-4 text-xs text-center text-muted-foreground">
                {search ? "No matches" : "No products in inventory yet"}
              </div>
            )}
            {(products as any[]).map((p) => (
              <button
                key={p.id}
                type="button"
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/60 border-b border-border/40",
                  value.id === p.id && "bg-primary/5",
                )}
                onClick={() => {
                  onChange({ id: p.id, title: p.title, sku: p.sku, image: p.image });
                  setOpen(false);
                }}
              >
                {p.image ? (
                  <img src={p.image} alt="" className="h-8 w-8 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="h-8 w-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{p.title}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {p.sku ? `${p.sku} · ` : ""}Stock: {p.stock ?? 0}
                    {Number(p.cost_price) > 0 && ` · Cost: ${Number(p.cost_price).toFixed(2)}৳`}
                  </div>
                </div>
                {value.id === p.id && <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
              </button>
            ))}
          </div>
          <div className="p-2 border-t border-border bg-muted/30">
            <Button
              type="button"
              size="sm"
              variant="default"
              className="w-full h-8"
              onClick={() => {
                setNewName(search);
                setCreateOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Create new product{search ? `: "${search}"` : ""}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Quick create product</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Product name *</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
            </div>
            <div>
              <Label className="text-xs">SKU (optional)</Label>
              <Input value={newSku} onChange={(e) => setNewSku(e.target.value)} placeholder="Auto if empty" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Inventory-te add hobe (stock 0, cost 0). Later edit korte parba inventory page theke. Carton release hole real cost auto set hobe.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Creating…</> : "Create & select"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}