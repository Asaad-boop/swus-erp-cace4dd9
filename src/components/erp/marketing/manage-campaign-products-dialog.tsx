import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Search, Trash2, Package, Link as LinkIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  listCampaignProducts,
  searchBrandProducts,
  linkCampaignProduct,
  unlinkCampaignProduct,
} from "@/lib/erp/marketing/campaigns.functions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
  brandId: string;
  status?: string | null;
};

function fmtBDT(n: number | null | undefined) {
  if (n == null) return "—";
  return `৳${Math.round(n).toLocaleString()}`;
}

export function ManageCampaignProductsDialog({
  open,
  onOpenChange,
  campaignId,
  campaignName,
  brandId,
  status,
}: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = React.useState<"connected" | "assign">("connected");
  const [search, setSearch] = React.useState("");
  const [linkingId, setLinkingId] = React.useState<string | null>(null);
  const [unlinkingId, setUnlinkingId] = React.useState<string | null>(null);

  const listFn = useServerFn(listCampaignProducts);
  const searchFn = useServerFn(searchBrandProducts);
  const linkFn = useServerFn(linkCampaignProduct);
  const unlinkFn = useServerFn(unlinkCampaignProduct);

  const linksQ = useQuery({
    queryKey: ["campaign-products", campaignId],
    queryFn: () => listFn({ data: { campaignId } }),
    enabled: open,
  });

  const searchQ = useQuery({
    queryKey: ["brand-products-search", brandId, search],
    queryFn: () => searchFn({ data: { brandId, query: search || undefined, limit: 25 } }),
    enabled: open && tab === "assign",
    staleTime: 30_000,
  });

  const linkedIds = new Set((linksQ.data ?? []).map((r: any) => r.product_id));

  async function handleLink(productId: string) {
    setLinkingId(productId);
    try {
      await linkFn({ data: { campaignId, productId } });
      toast.success("Product linked");
      await qc.invalidateQueries({ queryKey: ["campaign-products", campaignId] });
      setTab("connected");
    } catch (e: any) {
      toast.error(e?.message ?? "Link failed");
    } finally {
      setLinkingId(null);
    }
  }

  async function handleUnlink(linkId: string) {
    setUnlinkingId(linkId);
    try {
      await unlinkFn({ data: { linkId } });
      toast.success("Product unlinked");
      await qc.invalidateQueries({ queryKey: ["campaign-products", campaignId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Unlink failed");
    } finally {
      setUnlinkingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Manage Products for Campaign
          </DialogTitle>
          <DialogDescription className="space-y-0.5">
            <div className="text-sm text-foreground font-medium">{campaignName}</div>
            {status && (
              <div className="text-xs">
                Status:{" "}
                <Badge variant="outline" className="text-[10px]">
                  {status.toUpperCase()}
                </Badge>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 p-3 text-xs flex items-start gap-2">
          <LinkIcon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
          <div>
            <div className="font-medium text-foreground">Product Assignment</div>
            <div className="text-muted-foreground">
              Connect a product to track profit metrics, breakeven analysis, and fulfillment rates for this campaign.
            </div>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="connected" className="gap-1.5">
              <Package className="h-3.5 w-3.5" />
              Connected ({linksQ.data?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="assign" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Assign New Product
            </TabsTrigger>
          </TabsList>

          <TabsContent value="connected" className="mt-3">
            {linksQ.isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                Loading…
              </div>
            ) : (linksQ.data ?? []).length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No products linked yet. Switch to "Assign New Product" to add one.
              </div>
            ) : (
              <div className="space-y-2 max-h-[360px] overflow-y-auto">
                {(linksQ.data ?? []).map((r: any) => {
                  const p = r.products;
                  return (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 rounded-md border p-2.5 hover:bg-accent/30 transition-colors"
                    >
                      {p?.image ? (
                        <img
                          src={p.image}
                          alt=""
                          className="h-10 w-10 rounded-md object-cover border"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {p?.title ?? "Unknown product"}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          {p?.sku && <span>SKU: {p.sku}</span>}
                          {p?.price != null && <span>Price: {fmtBDT(p.price)}</span>}
                          {r.allocated_meta_spend != null && (
                            <span>Allocated: {fmtBDT(r.allocated_meta_spend)}</span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUnlink(r.id)}
                        disabled={unlinkingId === r.id}
                        className="text-muted-foreground hover:text-rose-500"
                      >
                        {unlinkingId === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="assign" className="mt-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products by name or SKU…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
                autoFocus
              />
            </div>
            <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
              {searchQ.isLoading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  Loading…
                </div>
              ) : (searchQ.data ?? []).length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No products match.
                </div>
              ) : (
                (searchQ.data ?? []).map((p: any) => {
                  const already = linkedIds.has(p.id);
                  return (
                    <div
                      key={p.id}
                      className={cn(
                        "flex items-center gap-3 rounded-md border p-2.5",
                        already && "opacity-60",
                      )}
                    >
                      {p.image ? (
                        <img src={p.image} alt="" className="h-9 w-9 rounded-md object-cover border" />
                      ) : (
                        <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{p.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.sku ? `SKU: ${p.sku}` : "—"}
                          {p.price != null ? ` · ${fmtBDT(p.price)}` : ""}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={already ? "ghost" : "default"}
                        disabled={already || linkingId === p.id}
                        onClick={() => handleLink(p.id)}
                      >
                        {linkingId === p.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : already ? (
                          "Connected"
                        ) : (
                          <>
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Connect
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}