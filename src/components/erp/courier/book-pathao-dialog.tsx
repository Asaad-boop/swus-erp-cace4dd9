import { useState, useMemo, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Truck, Calculator, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePathaoCities, usePathaoZones, usePathaoAreas } from "@/hooks/erp/use-courier-query";
import { pathaoBookOrderFn, pathaoPriceFn, pathaoDetectForOrderFn } from "@/lib/erp/pathao.functions";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orderId: string;
  defaultAmount: number;
};

export function BookPathaoDialog({ open, onOpenChange, orderId, defaultAmount }: Props) {
  const qc = useQueryClient();
  const bookFn = useServerFn(pathaoBookOrderFn);
  const priceFn = useServerFn(pathaoPriceFn);
  const detectFn = useServerFn(pathaoDetectForOrderFn);

  const [cityId, setCityId] = useState<number | null>(null);
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [areaId, setAreaId] = useState<number | null>(null);
  const [autoFilled, setAutoFilled] = useState<null | { city: string; zone: string; area: string | null; source: string }>(null);
  const [detecting, setDetecting] = useState(false);
  const [weight, setWeight] = useState("0.5");
  const [qty, setQty] = useState("1");
  const [amount, setAmount] = useState(String(defaultAmount || 0));
  const [desc, setDesc] = useState("");
  const [instruction, setInstruction] = useState("");
  const [estimated, setEstimated] = useState<number | null>(null);

  const { data: cities = [], isLoading: cityLoading, error: cityError } = usePathaoCities();
  const { data: zones = [] } = usePathaoZones(cityId);
  const { data: areas = [] } = usePathaoAreas(zoneId);

  // Auto-detect City/Zone/Area from the customer's checkout-provided address
  // the moment the dialog opens. Pre-fills the selects so the user usually
  // doesn't have to pick anything manually.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDetecting(true);
    setAutoFilled(null);
    (async () => {
      try {
        const r = (await detectFn({ data: { orderId } })) as {
          city: { id: number; name: string } | null;
          zone: { id: number; name: string } | null;
          area: { id: number; name: string } | null;
          source: string;
        };
        if (cancelled) return;
        if (r.city) setCityId(r.city.id);
        if (r.zone) setZoneId(r.zone.id);
        if (r.area) setAreaId(r.area.id);
        if (r.city && r.zone) {
          setAutoFilled({
            city: r.city.name,
            zone: r.zone.name,
            area: r.area?.name ?? null,
            source: r.source,
          });
        }
      } catch {
        /* silent — user can still pick manually */
      } finally {
        if (!cancelled) setDetecting(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  const canSubmit = useMemo(
    () => !!cityId && !!zoneId && Number(weight) > 0 && Number(qty) > 0,
    [cityId, zoneId, weight, qty],
  );

  const calc = useMutation({
    mutationFn: async () => {
      const r: any = await priceFn({
        data: {
          item_weight: Number(weight),
          recipient_city: cityId!,
          recipient_zone: zoneId!,
        },
      });
      const p = r?.price;
      const fee = Number(p?.price ?? p?.data?.price ?? p?.final_price ?? 0);
      setEstimated(fee);
      return fee;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const book = useMutation({
    mutationFn: async () => {
      return bookFn({
        data: {
          orderId,
          recipient_city: cityId!,
          recipient_zone: zoneId!,
          recipient_area: areaId ?? undefined,
          item_weight: Number(weight),
          item_quantity: Number(qty),
          amount_to_collect: Number(amount),
          item_description: desc || undefined,
          special_instruction: instruction || undefined,
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`Booked. Consignment: ${r.consignment ?? "—"}`);
      qc.invalidateQueries({ queryKey: ["courier-shipments"] });
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Truck className="h-4 w-4" /> Book Pathao Consignment</DialogTitle>
          <DialogDescription>Pickup will be requested from your registered Pathao store.</DialogDescription>
        </DialogHeader>

        {cityError ? (
          <div className="text-sm text-destructive">
            Failed to load Pathao cities. Check PATHAO_* credentials. {(cityError as Error).message}
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">City</Label>
                <Select
                  value={cityId ? String(cityId) : ""}
                  onValueChange={(v) => { setCityId(Number(v)); setZoneId(null); setAreaId(null); }}
                  disabled={cityLoading}
                >
                  <SelectTrigger><SelectValue placeholder={cityLoading ? "Loading…" : "Select"} /></SelectTrigger>
                  <SelectContent>
                    {cities.map((c) => <SelectItem key={c.city_id} value={String(c.city_id)}>{c.city_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Zone</Label>
                <Select value={zoneId ? String(zoneId) : ""} onValueChange={(v) => { setZoneId(Number(v)); setAreaId(null); }} disabled={!cityId}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {zones.map((z) => <SelectItem key={z.zone_id} value={String(z.zone_id)}>{z.zone_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Area (optional)</Label>
                <Select value={areaId ? String(areaId) : ""} onValueChange={(v) => setAreaId(Number(v))} disabled={!zoneId}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {areas.map((a) => <SelectItem key={a.area_id} value={String(a.area_id)}>{a.area_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Weight (kg)</Label>
                <Input type="number" step="0.1" min="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Qty</Label>
                <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">COD (৳)</Label>
                <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>

            <div>
              <Label className="text-xs">Item description</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. 1× Lego set" />
            </div>
            <div>
              <Label className="text-xs">Special instruction</Label>
              <Textarea rows={2} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
            </div>

            <div className="flex items-center justify-between rounded-md border bg-muted/30 p-2 text-sm">
              <div>
                Estimated delivery fee:{" "}
                <span className="font-semibold">{estimated != null ? `৳ ${estimated.toLocaleString()}` : "—"}</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => calc.mutate()} disabled={!cityId || !zoneId || calc.isPending}>
                {calc.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Calculator className="h-3.5 w-3.5 mr-1" />}
                Calculate
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canSubmit || book.isPending} onClick={() => book.mutate()}>
            {book.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Book consignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}