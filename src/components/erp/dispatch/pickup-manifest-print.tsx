import { format } from "date-fns";

type Item = { name: string; quantity: number };
type Order = {
  invoice_no: string | null;
  shipping_name?: string | null;
  guest_name?: string | null;
  shipping_phone?: string | null;
  guest_phone?: string | null;
  shipping_thana?: string | null;
  shipping_city?: string | null;
  total?: number | null;
  payment_method?: string | null;
  courier_name?: string | null;
  tracking_number?: string | null;
  items?: Item[];
};

function isCod(o: Order) {
  return (o.payment_method ?? "").toLowerCase().includes("cod");
}

/**
 * Pickup / Handover Manifest — clean list a rider can carry.
 * Intentionally no pickup-man name, no authority signature, no stamp area.
 */
export function PickupManifestPrint({ orders }: { orders: Order[] }) {
  const totalParcels = orders.length;
  const totalUnits = orders.reduce(
    (s, o) => s + (o.items ?? []).reduce((a, b) => a + (b.quantity ?? 0), 0),
    0,
  );
  const codOrders = orders.filter(isCod);
  const codAmount = codOrders.reduce((s, o) => s + (o.total ?? 0), 0);

  return (
    <div className="bg-white text-black p-8 font-sans">
      <div className="flex items-start justify-between border-b-2 border-black pb-3 mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-600">Dispatch</div>
          <h1 className="text-2xl font-bold tracking-tight">Pickup Manifest</h1>
        </div>
        <div className="text-right text-xs">
          <div className="font-mono">{format(new Date(), "yyyy-MM-dd HH:mm")}</div>
          <div className="text-neutral-600">Manifest #{format(new Date(), "yyyyMMddHHmm")}</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4 text-xs">
        <Stat label="Parcels" value={String(totalParcels)} />
        <Stat label="Units" value={String(totalUnits)} />
        <Stat label="COD parcels" value={String(codOrders.length)} />
        <Stat label="COD amount" value={`৳${codAmount.toLocaleString("en-BD")}`} />
      </div>

      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-black">
            <th className="text-left py-1.5 pr-2 w-6">#</th>
            <th className="text-left py-1.5 pr-2">Invoice / Tracking</th>
            <th className="text-left py-1.5 pr-2">Customer</th>
            <th className="text-left py-1.5 pr-2">Phone</th>
            <th className="text-left py-1.5 pr-2">Area</th>
            <th className="text-right py-1.5 pr-2">Qty</th>
            <th className="text-right py-1.5">COD ৳</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o, i) => {
            const qty = (o.items ?? []).reduce((s, it) => s + (it.quantity ?? 0), 0);
            const cod = isCod(o) ? (o.total ?? 0) : 0;
            return (
              <tr key={i} className="border-b border-neutral-300 align-top">
                <td className="py-1.5 pr-2 tabular-nums">{i + 1}</td>
                <td className="py-1.5 pr-2 font-mono">
                  <div className="font-semibold">{o.invoice_no ?? "—"}</div>
                  {o.tracking_number && (
                    <div className="text-[10px] text-neutral-600">{o.tracking_number}</div>
                  )}
                </td>
                <td className="py-1.5 pr-2">{o.shipping_name ?? o.guest_name ?? "—"}</td>
                <td className="py-1.5 pr-2 font-mono">{o.shipping_phone ?? o.guest_phone ?? "—"}</td>
                <td className="py-1.5 pr-2">
                  {[o.shipping_thana, o.shipping_city].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{qty}</td>
                <td className="py-1.5 text-right tabular-nums font-semibold">
                  {cod ? cod.toLocaleString("en-BD") : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black font-bold">
            <td colSpan={5} className="py-2">Total</td>
            <td className="py-2 text-right tabular-nums">{totalUnits}</td>
            <td className="py-2 text-right tabular-nums">৳{codAmount.toLocaleString("en-BD")}</td>
          </tr>
        </tfoot>
      </table>

      <div className="mt-4 text-[10px] text-neutral-600">
        Auto-generated handover list. No signature required.
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-neutral-300 rounded p-2">
      <div className="text-[9px] uppercase tracking-[0.14em] text-neutral-600">{label}</div>
      <div className="text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}