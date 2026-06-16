import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Props = {
  campaignId: string;
  brandId: string | null;
};

export function AdProductLinkPanel({ campaignId, brandId }: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const linksQ = useQuery({
    queryKey: ["ad-product-links", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_ad_product_links")
        .select("id, product_id, allocation_percent, platform, products(id, title, sku, image)")
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const productsQ = useQuery({
    queryKey: ["ad-link-products", brandId, search],
    enabled: !!brandId && showSearch,
    queryFn: async () => {
      let q = supabase.from("products").select("id,title,sku,image").eq("brand_id", brandId!).order("title").limit(30);
      if (search.trim()) q = q.or(`title.ilike.%${search}%,sku.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const addMut = useMutation({
    mutationFn: async (productId: string) => {
      if (!brandId) throw new Error("Brand not set");
      const { error } = await supabase.from("erp_ad_product_links").insert({
        brand_id: brandId, campaign_id: campaignId, product_id: productId,
        platform: "meta", allocation_percent: 100,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product linked");
      qc.invalidateQueries({ queryKey: ["ad-product-links", campaignId] });
      qc.invalidateQueries({ queryKey: ["pp-report"] });
      setShowSearch(false); setSearch("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, allocation_percent }: { id: string; allocation_percent: number }) => {
      const { error } = await supabase.from("erp_ad_product_links").update({ allocation_percent }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad-product-links", campaignId] });
      qc.invalidateQueries({ queryKey: ["pp-report"] });
    },
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_ad_product_links").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Link removed");
      qc.invalidateQueries({ queryKey: ["ad-product-links", campaignId] });
      qc.invalidateQueries({ queryKey: ["pp-report"] });
    },
  });

  const links = linksQ.data ?? [];
  const existingIds = new Set(links.map((l) => l.product_id));
  const totalPercent = links.reduce((s, l) => s + Number(l.allocation_percent || 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4" /> Ad → Product Spend Allocation
          <Badge variant="outline" className="ml-2">Σ {totalPercent.toFixed(0)}%</Badge>
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setShowSearch((v) => !v)}><Plus className="h-3 w-3 mr-1" />Link Product</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Allocation % decides how this campaign's Meta Ads spend is attributed across products in the Product Profitability report.
        </p>
        {showSearch && (
          <div className="border rounded-md p-2 space-y-2 bg-muted/30">
            <Input autoFocus placeholder="Search by name or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="max-h-60 overflow-auto">
              {(productsQ.data ?? []).filter((p) => !existingIds.has(p.id)).map((p) => (
                <button key={p.id} onClick={() => addMut.mutate(p.id)} className="w-full text-left px-2 py-1.5 hover:bg-background rounded flex items-center gap-2">
                  {p.image ? <img src={p.image} alt="" className="h-7 w-7 rounded object-cover" /> : <div className="h-7 w-7 rounded bg-muted" />}
                  <span className="text-sm">{p.title}</span>
                  {p.sku && <span className="text-xs text-muted-foreground">· {p.sku}</span>}
                </button>
              ))}
              {!(productsQ.data ?? []).length && <p className="text-xs text-muted-foreground p-2">No products.</p>}
            </div>
          </div>
        )}
        {links.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3 text-center">No products linked. Spend will not be attributed to any product.</p>
        ) : (
          <div className="space-y-2">
            {links.map((l) => (
              <div key={l.id} className="flex items-center gap-2 p-2 border rounded-md">
                {l.products?.image ? <img src={l.products.image} alt="" className="h-9 w-9 rounded object-cover" /> : <div className="h-9 w-9 rounded bg-muted" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{l.products?.title ?? "Unknown"}</div>
                  <div className="text-xs text-muted-foreground">{l.products?.sku ?? ""}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="number" min={0} max={100}
                    defaultValue={l.allocation_percent}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== Number(l.allocation_percent)) updateMut.mutate({ id: l.id, allocation_percent: v });
                    }}
                    className="w-20 h-8"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <Button size="icon" variant="ghost" onClick={() => removeMut.mutate(l.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}