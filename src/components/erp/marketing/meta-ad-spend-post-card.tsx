import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import { postMetaAdSpendToFinance } from "@/lib/erp/marketing/meta-cost.functions";

type Props = { brandId: string | null | undefined };

export function MetaAdSpendPostCard({ brandId }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [result, setResult] = useState<{
    days_posted: number;
    days_updated: number;
    days_skipped_zero: number;
    total_bdt: number;
    note: string | null;
  } | null>(null);

  const postFn = useServerFn(postMetaAdSpendToFinance);
  const postMut = useMutation({
    mutationFn: () => postFn({ data: { brandId: brandId!, from, to } }),
    onSuccess: (r) => {
      setResult(r);
      const msg = r.total_bdt > 0
        ? `Posted ৳${Math.round(r.total_bdt).toLocaleString()} across ${r.days_posted + r.days_updated} day(s)`
        : `No spend to post (${r.days_skipped_zero} day(s) skipped — FX/FIFO baseline empty?)`;
      toast.success(msg);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            Meta Ad Spend → Finance
            <Badge variant="outline" className="text-[10px] font-normal">Phase 4a · idempotent</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Daily aggregate spend (FIFO + FX fallback) auto-post to erp_transactions
            under "Meta Ads Expense" category. Re-run kore duplicate hobe na.
          </p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </div>
        <Button
          onClick={() => postMut.mutate()}
          disabled={postMut.isPending || !brandId}
          size="sm"
          className="bg-[#1877F2] hover:bg-[#1664d4] gap-1.5"
        >
          {postMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Post to Finance
        </Button>
        {result && (
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground ml-auto items-center">
            <span>Posted: <b className="text-foreground">{result.days_posted}</b></span>
            <span>Updated: <b className="text-foreground">{result.days_updated}</b></span>
            <span>Skipped (zero): <b className="text-foreground">{result.days_skipped_zero}</b></span>
            <span>Total: <b className="text-foreground">৳{Math.round(result.total_bdt).toLocaleString()}</b></span>
            {result.note && <span className="text-amber-600 italic">{result.note}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}