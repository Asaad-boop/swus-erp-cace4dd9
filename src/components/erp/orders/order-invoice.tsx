import { format } from "date-fns";
import { customerName, customerPhone, shortId } from "@/lib/erp/orders";
import { useBrand } from "@/contexts/brand-context";

type Item = { name: string; quantity: number; unit_price: number | null; price: number; variant_label: string | null; line_total: number | null };

export function PrintableInvoice({ order, items }: { order: Record<string, any>; items: Item[] }) {
  const { activeBrand } = useBrand();
  return (
    <div id="print-invoice" className="hidden print:block p-6 text-sm text-black bg-white">
      <div className="flex justify-between items-start border-b border-black pb-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">{activeBrand?.name ?? "Invoice"}</h1>
          <p className="text-xs">Order Invoice</p>
        </div>
        <div className="text-right text-xs">
          <div><strong>Invoice #:</strong> {shortId(order.id)}</div>
          <div><strong>Date:</strong> {format(new Date(order.created_at), "dd MMM yyyy")}</div>
          <div><strong>Status:</strong> {order.status}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <h2 className="font-semibold mb-1">Bill To</h2>
          <p>{customerName(order as any)}</p>
          <p>{customerPhone(order as any)}</p>
          <p>{order.shipping_address}</p>
          <p>{[order.shipping_thana, order.shipping_city, order.shipping_district].filter(Boolean).join(", ")}</p>
        </div>
        <div className="text-right text-xs">
          {order.courier_name && <div><strong>Courier:</strong> {order.courier_name}</div>}
          {order.tracking_number && <div><strong>Tracking:</strong> {order.tracking_number}</div>}
          {order.payment_method && <div><strong>Payment:</strong> {order.payment_method}</div>}
        </div>
      </div>
      <table className="w-full border-collapse mb-4">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="text-left py-2">Item</th>
            <th className="text-center">Qty</th>
            <th className="text-right">Price</th>
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b border-gray-300">
              <td className="py-2">
                {it.name}
                {it.variant_label && <div className="text-xs text-gray-600">{it.variant_label}</div>}
              </td>
              <td className="text-center">{it.quantity}</td>
              <td className="text-right">৳ {Number(it.unit_price ?? it.price).toLocaleString()}</td>
              <td className="text-right">৳ {Number(it.line_total ?? it.price * it.quantity).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end">
        <table className="min-w-[260px]">
          <tbody>
            <tr><td className="py-1">Subtotal:</td><td className="text-right">৳ {Number(order.subtotal).toLocaleString()}</td></tr>
            <tr><td className="py-1">Shipping:</td><td className="text-right">৳ {Number(order.shipping_fee).toLocaleString()}</td></tr>
            {Number(order.discount_amount) > 0 && (
              <tr><td className="py-1">Discount:</td><td className="text-right">− ৳ {Number(order.discount_amount).toLocaleString()}</td></tr>
            )}
            <tr className="border-t-2 border-black font-bold text-base">
              <td className="py-2">Total:</td><td className="text-right">৳ {Number(order.total).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-8 text-xs text-center text-gray-600">Thank you for your purchase.</div>
    </div>
  );
}