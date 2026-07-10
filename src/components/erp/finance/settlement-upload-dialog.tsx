import { useMemo, useState } from "react";
import Papa from "papaparse";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, FileWarning } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtBdt } from "@/lib/erp/finance";

type Props = {
  open: boolean;
  onClose: () => void;
  brandId: string | null;
  brandIds: string[];
};

const COURIERS = ["pathao", "steadfast", "redx", "paperfly", "ecourier", "other"];

type RawRow = Record<string, string>;
type ParsedLine = {
  consignment_id: string | null;
  merchant_order_id: string | null;
  invoice_type: string | null;
  created_date: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  store_name: string | null;
  collected_amount: number;
  collectable_amount: number;
  cod_fee: number;
  delivery_fee: number;
  final_fee: number;
  discount: number;
  additional_charge: number;
  compensation_cost: number;
  promo_discount: number;
  payout: number;
  raw: RawRow;
};

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return isFinite(n) ? n : 0;
}
function txt(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}
function parseDate(v: unknown): string | null {
  const s = txt(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(+d) ? null : d.toISOString().slice(0, 10);
}

function parseCsv(text: string): ParsedLine[] {
  const res = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  return (res.data ?? []).map((r) => ({
    consignment_id: txt(r.Consignment_ID ?? r.consignment_id),
    merchant_order_id: txt(r.Merchant_Order_ID ?? r.merchant_order_id),
    invoice_type: txt(r["Invoice type"] ?? r.Invoice_type ?? r.invoice_type),
    created_date: parseDate(r.Created_Date ?? r.created_date),
    recipient_name: txt(r.Recipient_Name ?? r.recipient_name),
    recipient_phone: txt(r.Recipient_Phone ?? r.recipient_phone),
    store_name: txt(r.Store_name ?? r.store_name ?? r.Store_Name),
    collected_amount: num(r.Collected_Amount ?? r.collected_amount),
    collectable_amount: num(r.Collectable_Amount ?? r.collectable_amount),
    cod_fee: num(r.COD_fee ?? r.cod_fee),
    delivery_fee: num(r.Delivery_Fee ?? r.delivery_fee),
    final_fee: num(r.Final_Fee ?? r.final_fee),
    discount: num(r.Discount ?? r.discount),
    additional_charge: num(r.Additional_Charge ?? r.additional_charge),
    compensation_cost: num(r.Compensation_Cost ?? r.compensation_cost),
    promo_discount: num(r.Promo_Discount ?? r.promo_discount),
    payout: num(r.Payout ?? r.payout),
    raw: r,
  }));
}

export function SettlementUploadDialog({ open, onClose, brandId, brandIds }: Props) {
  const qc = useQueryClient();
  const [pickedBrand, setPickedBrand] = useState<string>(brandId ?? "");
  const [courier, setCourier] = useState("pathao");
  const [remitDate, setRemitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [refNo, setRefNo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [lines, setLines] = useState<ParsedLine[]>([]);
  const [busy, setBusy] = useState(false);

  const effectiveBrand = brandId ?? pickedBrand;

  const summary = useMemo(() => {
    const byOrder = new Map<string, { payout: number; count: number }>();
    let payoutTotal = 0;
    for (const l of lines) {
      payoutTotal += l.payout;
      const key = l.merchant_order_id ?? l.consignment_id ?? "?";
      const prev = byOrder.get(key) ?? { payout: 0, count: 0 };
      prev.payout += l.payout;
      prev.count += 1;
      byOrder.set(key, prev);
    }
    return { lineCount: lines.length, orderCount: byOrder.size, payoutTotal };
  }, [lines]);

  async function handleFile(f: File) {
    setFile(f);
    const text = await f.text();
    const parsed = parseCsv(text);
    setLines(parsed);
  }

  const uploadMut = useMutation({
    mutationFn: async () => {
      if (!effectiveBrand) throw new Error("Brand required");
      if (!lines.length) throw new Error("No rows parsed from CSV");
      setBusy(true);
      const { data: u } = await supabase.auth.getUser();
      // 1) create batch remittance header
      const { data: rem, error: remErr } = await supabase
        .from("erp_cod_remittances")
        .insert({
          brand_id: effectiveBrand,
          courier,
          remittance_date: remitDate,
          amount: summary.payoutTotal,
          expected_amount: null,
          reference_no: refNo || (file ? file.name : null),
          notes: `Settlement upload · ${summary.lineCount} lines · ${summary.orderCount} orders`,
          status: "pending",
          created_by: u.user?.id,
        })
        .select("id")
        .single();
      if (remErr) throw remErr;
      const remittanceId = rem!.id as string;

      // 2) insert lines in chunks
      const CHUNK = 200;
      const rows = lines.map((l) => ({
        remittance_id: remittanceId,
        brand_id: effectiveBrand,
        courier,
        consignment_id: l.consignment_id,
        merchant_order_id: l.merchant_order_id,
        invoice_type: l.invoice_type,
        created_date: l.created_date,
        recipient_name: l.recipient_name,
        recipient_phone: l.recipient_phone,
        store_name: l.store_name,
        collected_amount: l.collected_amount,
        collectable_amount: l.collectable_amount,
        cod_fee: l.cod_fee,
        delivery_fee: l.delivery_fee,
        final_fee: l.final_fee,
        discount: l.discount,
        additional_charge: l.additional_charge,
        compensation_cost: l.compensation_cost,
        promo_discount: l.promo_discount,
        payout: l.payout,
        raw: l.raw as unknown as never,
      }));
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error } = await supabase.from("erp_courier_settlement_lines").insert(chunk);
        if (error) throw error;
      }

      // 3) run reconciliation
      const { data: rec, error: recErr } = await supabase.rpc("reconcile_courier_settlement", {
        _remittance_id: remittanceId,
      });
      if (recErr) throw recErr;
      return { remittanceId, rec };
    },
    onSuccess: (res) => {
      const r = (res.rec ?? {}) as Record<string, number>;
      toast.success(
        `Uploaded · matched ${r.matched ?? 0} · shortfall ${r.shortfall ?? 0} · unmatched ${r.unmatched ?? 0}`,
      );
      qc.invalidateQueries({ queryKey: ["cod_remittances"] });
      qc.invalidateQueries({ queryKey: ["settlement_lines"] });
      setBusy(false);
      setFile(null);
      setLines([]);
      onClose();
    },
    onError: (e: Error) => {
      setBusy(false);
      toast.error(e.message);
    },
  });

  const showBrandPicker = !brandId && brandIds.length > 1;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" /> Upload Courier Settlement CSV
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {showBrandPicker && (
            <div>
              <Label>Brand</Label>
              <Select value={pickedBrand} onValueChange={setPickedBrand}>
                <SelectTrigger><SelectValue placeholder="Choose brand" /></SelectTrigger>
                <SelectContent>
                  {brandIds.map((b) => <SelectItem key={b} value={b}>{b.slice(0, 8)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Courier</Label>
              <Select value={courier} onValueChange={setCourier}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COURIERS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Batch date</Label>
              <Input type="date" value={remitDate} onChange={(e) => setRemitDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Reference / batch #</Label>
            <Input value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="Optional (defaults to filename)" />
          </div>
          <div>
            <Label>CSV file</Label>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Expected headers: Consignment_ID, Merchant_Order_ID, Invoice type, Collected_Amount, Collectable_Amount, COD_fee, Delivery_Fee, Final_Fee, Discount, Additional_Charge, Compensation_Cost, Promo_Discount, Payout, Store_name…
            </p>
          </div>

          {lines.length > 0 && (
            <div className="rounded border bg-muted/30 p-3 text-xs space-y-1">
              <div><span className="text-muted-foreground">Lines parsed:</span> <strong>{summary.lineCount}</strong></div>
              <div><span className="text-muted-foreground">Unique orders:</span> <strong>{summary.orderCount}</strong></div>
              <div><span className="text-muted-foreground">Total payout:</span> <strong>{fmtBdt(summary.payoutTotal)}</strong></div>
            </div>
          )}
          {lines.length === 0 && file && (
            <div className="flex items-center gap-2 text-xs text-amber-600">
              <FileWarning className="h-4 w-4" /> No rows parsed — check the header row.
            </div>
          )}
          <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
            Note: legacy manual “Courier Charges” expense entries are <strong>not</strong> auto-removed. Review overlap after reconciling and delete/deprecate old rows to avoid double-count.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => uploadMut.mutate()} disabled={busy || !lines.length || !effectiveBrand}>
            {busy ? "Uploading…" : "Upload & Reconcile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}