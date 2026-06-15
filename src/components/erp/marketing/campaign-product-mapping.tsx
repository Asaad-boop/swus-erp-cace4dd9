import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, X, Save } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveCampaignProducts, searchProductsForMapping } from "@/lib/erp/marketing/marketing.functions";

type Mapping = {
  product_id: string;
  weight: number;
  product?: { id: string; title: string; sku?: string | null; image?: string | null };
};

export function CampaignProductMapping({
  campaignId, brandId, initial,
}: {
  campaignId: string;
  brandId: string | null;
  initial: Array<{ product_id: string; weight: number; products?: any }>;
}) {
  const qc = useQueryClient();
  const [items, setItems] = useState<Mapping[]>(() =>
    initial.map((m) => ({
      product_id: m.product_id,
      weight: Number(m.weight),
      product: m.products ? { id: m.products.id, title: m.products.title, sku: m.products.sku, image: m.products.image } : undefined,
    })),
  );
  const [q, setQ] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    setItems(initial.map((m) => ({
      product_id: m.product_id,
      weight: Number(m.weight),
      product: m.products ? { id: m.products.id, title: m.products.title, sku: m.products.sku, image: m.products.image } : undefined,
    })));
  }, [initial]);

  const searchFn = useServerFn(searchProductsForMapping);
  const saveFn = useServerFn(saveCampaignProducts);

  const search = useQuery({
    queryKey: ["marketing-product-search", brandId, q],
    queryFn: () => searchFn({ data: { brandId: brandId!, q } }),
    enabled: !!brandId && showSearch,
    staleTime: 30_000,
  });

  const saveMut = useMutation({
    mutationFn: () => saveFn({
      data: {
        campaignId,
        products: items.map((i) => ({ productId: i.product_id, weight: i.weight })),
      },
    }),
    onSuccess: () => {
      toast.success("Product mapping saved");
      qc.invalidateQueries({ queryKey: ["marketing-campaign", campaignId] });
      qc.invalidateQueries({ queryKey: ["marketing-campaigns"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const totalWeight = useMemo(() => items.reduce((s, i) => s + (i.weight || 0), 0), [items]);

  const addProduct = (p: any) => {
    if (items.some((i) => i.product_id === p.id)) return;
    setItems([...items, { product_id: p.id, weight: 1, product: p }]);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Product Mapping (Actual ROAS attribution)</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSearch((v) => !v)}>
            <Plus className="h-4 w-4 mr-1" /> Add Product
          </Button>
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            <Save className="h-4 w-4 mr-1" /> Save
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showSearch && (
          <div className="border rounded-md p-2 space-y-2 bg-muted/30">
            <Input
              placeholder="Search products by name or SKU…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="max-h-48 overflow-auto divide-y">
              {(search.data?.products ?? []).map((p: any) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-left p-2 hover:bg-accent rounded flex items-center gap-2"
                  onClick={() => addProduct(p)}
                  disabled={items.some((i) => i.product_id === p.id)}
                >
                  {p.image && <img src={p.image} alt="" className="h-8 w-8 rounded object-cover" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{p.title}</div>
                    <div className="text-xs text-muted-foreground">{p.sku ?? "—"} · ৳{p.price}</div>
                  </div>
                  {items.some((i) => i.product_id === p.id) && <span className="text-xs text-muted-foreground">Added</span>}
                </button>
              ))}
              {search.data && search.data.products.length === 0 && (
                <div className="text-sm text-muted-foreground p-2">No products found.</div>
              )}
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-3 text-center">
            Koto product map korbe — "Add Product" diye add koro.
          </div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground">
              Total weight: <span className="font-semibold">{totalWeight.toFixed(2)}</span> · Each share = weight ÷ total
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => {
                const share = totalWeight > 0 ? (it.weight / totalWeight) * 100 : 0;
                return (
                  <div key={it.product_id} className="flex items-center gap-2 border rounded-md p-2">
                    {it.product?.image && <img src={it.product.image} alt="" className="h-10 w-10 rounded object-cover" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{it.product?.title || it.product_id}</div>
                      <div className="text-xs text-muted-foreground">{it.product?.sku ?? "—"} · {share.toFixed(1)}% share</div>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      step={0.1}
                      value={it.weight}
                      onChange={(e) => {
                        const w = parseFloat(e.target.value) || 0;
                        setItems((prev) => prev.map((p, i) => i === idx ? { ...p, weight: w } : p));
                      }}
                      className="w-20"
                    />
                    <Button variant="ghost" size="icon" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}