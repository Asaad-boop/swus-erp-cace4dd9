import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useBrand } from "@/contexts/brand-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Banknote, PlayCircle } from "lucide-react";
import {
  getCostRules,
  updateCostRules,
  postMetaSpendNow,
  listSpendPostings,
  listExpenseCategories,
  listPaymentAccounts,
} from "@/lib/erp/marketing/accounting.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/accounting")({
  head: () => ({ meta: [{ title: "Marketing Accounting — ERP" }] }),
  component: MarketingAccountingPage,
});

function fmtMoney(v: any, ccy = "BDT") {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return "—";
  return `${ccy === "BDT" ? "৳" : ccy + " "}${n.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
}

function MarketingAccountingPage() {
  const { activeBrand } = useBrand();
  const qc = useQueryClient();
  const fnRules = useServerFn(getCostRules);
  const fnSave = useServerFn(updateCostRules);
  const fnPost = useServerFn(postMetaSpendNow);
  const fnList = useServerFn(listSpendPostings);
  const fnCats = useServerFn(listExpenseCategories);
  const fnAccts = useServerFn(listPaymentAccounts);

  const rulesQ = useQuery({
    queryKey: ["mkt-rules", activeBrand?.id],
    queryFn: () => fnRules({ data: { brand_id: activeBrand!.id } }),
    enabled: !!activeBrand,
  });
  const catsQ = useQuery({
    queryKey: ["mkt-cats", activeBrand?.id],
    queryFn: () => fnCats({ data: { brand_id: activeBrand!.id } }),
    enabled: !!activeBrand,
  });
  const acctsQ = useQuery({
    queryKey: ["mkt-accts", activeBrand?.id],
    queryFn: () => fnAccts({ data: { brand_id: activeBrand!.id } }),
    enabled: !!activeBrand,
  });
  const postsQ = useQuery({
    queryKey: ["mkt-spend-postings", activeBrand?.id],
    queryFn: () => fnList({ data: { brand_id: activeBrand!.id, limit: 30 } }),
    enabled: !!activeBrand,
  });

  const [autoPost, setAutoPost] = useState(false);
  const [catId, setCatId] = useState<string>("");
  const [acctId, setAcctId] = useState<string>("");

  useEffect(() => {
    const r: any = rulesQ.data;
    if (r) {
      setAutoPost(!!r.auto_post_meta_spend);
      setCatId(r.meta_expense_account_id ?? "");
      setAcctId(r.meta_payment_account_id ?? "");
    }
  }, [rulesQ.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      fnSave({
        data: {
          brand_id: activeBrand!.id,
          auto_post_meta_spend: autoPost,
          meta_expense_account_id: catId || null,
          meta_payment_account_id: acctId || null,
        },
      }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["mkt-rules"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const postMut = useMutation({
    mutationFn: () => fnPost({ data: { brand_id: activeBrand!.id, days: 7, force: true } }),
    onSuccess: (r: any) => {
      toast.success(`Posted: ${r?.posted ?? 0} new, updated: ${r?.updated ?? 0}`);
      qc.invalidateQueries({ queryKey: ["mkt-spend-postings"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!activeBrand) return <div className="p-6 text-sm text-muted-foreground">Brand select koro.</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Banknote className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Marketing Accounting</h1>
          <p className="text-sm text-muted-foreground">
            Meta ad spend ke automatic vabe Finance e expense hisebe post korbe.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Auto-post settings ({activeBrand.name})</CardTitle>
          <CardDescription>
            Auto-post on thakle prottek ad account-er prottek diner spend ekta expense entry hisebe Finance e jabe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch checked={autoPost} onCheckedChange={setAutoPost} id="autoPost" />
            <Label htmlFor="autoPost">Auto-post Meta spend to Finance (hourly cron)</Label>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Expense category</Label>
              <select
                className="w-full mt-1 border rounded h-9 px-2 bg-background"
                value={catId}
                onChange={(e) => setCatId(e.target.value)}
              >
                <option value="">— Auto (Meta Ads by name) —</option>
                {(catsQ.data ?? []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Payment account (paid-from)</Label>
              <select
                className="w-full mt-1 border rounded h-9 px-2 bg-background"
                value={acctId}
                onChange={(e) => setAcctId(e.target.value)}
              >
                <option value="">— Auto (first active account) —</option>
                {(acctsQ.data ?? []).map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.account_type})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? "Saving…" : "Save settings"}
            </Button>
            <Button variant="outline" onClick={() => postMut.mutate()} disabled={postMut.isPending}>
              <PlayCircle className={`h-4 w-4 mr-1 ${postMut.isPending ? "animate-spin" : ""}`} />
              Post last 7 days now
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent postings</CardTitle>
          <CardDescription>Day, ad account, amount, linked Finance txn.</CardDescription>
        </CardHeader>
        <CardContent>
          {postsQ.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {postsQ.data && postsQ.data.length === 0 && (
            <div className="text-sm text-muted-foreground">
              Akhono kichui post hoyni. Settings save kore "Post last 7 days now" click koro.
            </div>
          )}
          {postsQ.data && postsQ.data.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground border-b text-xs">
                <tr className="text-left">
                  <th className="py-1.5 pr-2">Day</th>
                  <th className="pr-2">Ad Account</th>
                  <th className="pr-2 text-right">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {postsQ.data.map((p: any) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-2">{p.posting_date}</td>
                    <td className="pr-2">{p.marketing_ad_accounts?.account_name ?? "—"}</td>
                    <td className="pr-2 text-right">{fmtMoney(p.amount, p.currency)}</td>
                    <td>
                      <Badge variant={p.status === "posted" ? "default" : "secondary"}>{p.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}