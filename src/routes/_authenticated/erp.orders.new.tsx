import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, Search, ArrowLeft, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBrand } from "@/contexts/brand-context";

export const Route = createFileRoute("/_authenticated/erp/orders/new")({
  head: () => ({ meta: [{ title: "New Order — ERP" }] }),
  component: NewOrderPage,
});

type LineItem = {
  product_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  image: string | null;
};

function NewOrderPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { activeBrand } = useBrand();

  const [customer, setCustomer] = useState({ name: "", phone: "", alt_phone: "", address: "", city: "", district: "", thana: "" });
  const [items, setItems] = useState<LineItem[]>([]);
  const [shipping, setShipping] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [advance, setAdvance] = useState(0);
  const [advanceSource, setAdvanceSource] = useState("");
  const [advanceNumber, setAdvanceNumber] = useState("");
  const [advanceTxnId, setAdvanceTxnId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [notes, setNotes] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [shippingNote, setShippingNote] = useState("");

  const [productSearch, setProductSearch] = useState("");
  const { data: products = [], isFetching: searching } = useQuery({
    queryKey: ["product-search", activeBrand?.id, productSearch],
    enabled: !!activeBrand && productSearch.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,title,price,image,stock")
        .eq("brand_id", activeBrand!.id)
        .ilike("title", `%${productSearch}%`)
        .limit(15);
      if (error) throw error;
      return data ?? [];
    },
  });

  const addItem = (p: { id: string; title: string; price: number; image: string | null }) => {
    const existing = items.findIndex((i) => i.product_id === p.id);
    if (existing >= 0) {
      const next = [...items];
      next[existing] = { ...next[existing], quantity: next[existing].quantity + 1 };
      setItems(next);
    } else {
      setItems([...items, { product_id: p.id, name: p.title, unit_price: Number(p.price), quantity: 1, image: p.image }]);
    }
    setProductSearch("");
  };

  const updateItem = (idx: number, patch: Partial<LineItem>) => {
    const next = [...items];
    next[idx] = { ...next[idx], ...patch };
    setItems(next);
  };
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const total = Math.max(0, subtotal + Number(shipping) - Number(discount) - Number(advance));

  const create = useMutation({
    mutationFn: async () => {
      if (!activeBrand) throw new Error("Select a brand");
      if (!customer.name || !customer.phone) throw new Error("Customer name and phone required");
      if (!customer.address) throw new Error("Address required");
      if (items.length === 0) throw new Error("Add at least one item");

      if (Number(advance) > 0) {
        if (!advanceSource) throw new Error("Select advance payment source");
        if (!advanceNumber || advanceNumber.length < 4) throw new Error("Enter advance payment number (min 4 digits)");
      }

      const { data: orderData, error: orderErr } = await supabase
        .from("orders")
        .insert({
          brand_id: activeBrand.id,
          status: "confirmed",
          confirmation_status: "confirmed",
          source: "manual",
          is_guest_order: true,
          guest_name: customer.name,
          guest_phone: customer.phone,
          shipping_name: customer.name,
          shipping_phone: customer.phone,
          alternate_phone: customer.alt_phone || null,
          shipping_address: customer.address,
          shipping_city: customer.city || null,
          shipping_district: customer.district || null,
          shipping_thana: customer.thana || null,
          payment_method: paymentMethod,
          subtotal,
          shipping_fee: Number(shipping),
          discount_amount: Number(discount),
          advance_amount: Number(advance),
          advance_source: Number(advance) > 0 ? advanceSource : null,
          advance_payment_number: Number(advance) > 0 ? advanceNumber : null,
          advance_txn_id: Number(advance) > 0 && advanceTxnId ? advanceTxnId : null,
          total,
          customer_note: notes || null,
          admin_notes: adminNotes || null,
          shipping_note: shippingNote || null,
        })
        .select("id")
        .single();
      if (orderErr) throw orderErr;

      const orderId = orderData.id;
      const itemRows = items.map((i) => ({
        order_id: orderId,
        product_id: i.product_id,
        name: i.name,
        image: i.image,
        price: i.unit_price,
        unit_price: i.unit_price,
        quantity: i.quantity,
        line_total: i.unit_price * i.quantity,
      }));
      const { error: itemsErr } = await supabase.from("order_items").insert(itemRows);
      if (itemsErr) throw itemsErr;
      return orderId;
    },
    onSuccess: (id) => {
      toast.success("Order created");
      qc.invalidateQueries({ queryKey: ["orders"] });
      navigate({ to: "/erp/orders", search: { open: id } as never });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/erp/orders" })}><ArrowLeft className="h-4 w-4" /></Button>
          <h1 className="text-2xl font-bold tracking-tight">New Manual Order</h1>
        </div>
        <div className="text-sm text-muted-foreground">{activeBrand?.name}</div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Customer</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-3">
              <div><Label>Name *</Label><Input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></div>
              <div><Label>Phone *</Label><Input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} /></div>
              <div><Label>Alt Phone</Label><Input value={customer.alt_phone} onChange={(e) => setCustomer({ ...customer, alt_phone: e.target.value })} /></div>
              <div><Label>City</Label><Input value={customer.city} onChange={(e) => setCustomer({ ...customer, city: e.target.value })} /></div>
              <div><Label>District</Label><Input value={customer.district} onChange={(e) => setCustomer({ ...customer, district: e.target.value })} /></div>
              <div><Label>Thana</Label><Input value={customer.thana} onChange={(e) => setCustomer({ ...customer, thana: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Address *</Label><Textarea rows={2} value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Items</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Popover open={productSearch.trim().length >= 2 && products.length > 0}>
                <PopoverTrigger asChild>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search products by name (min 2 chars)…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="pl-8" />
                  </div>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[min(560px,90vw)] p-0">
                  <div className="max-h-72 overflow-y-auto">
                    {searching && <div className="p-2 text-sm text-muted-foreground">Searching…</div>}
                    {products.map((p) => (
                      <button key={p.id} onClick={() => addItem(p)} className="flex w-full items-center gap-2 p-2 hover:bg-accent text-left">
                        {p.image && <img src={p.image} alt="" className="h-10 w-10 rounded object-cover" />}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{p.title}</div>
                          <div className="text-xs text-muted-foreground">Stock: {p.stock} · ৳ {Number(p.price).toLocaleString()}</div>
                        </div>
                        <Plus className="h-4 w-4" />
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No items added yet</p>
              ) : (
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={idx} className="flex items-center gap-2 border rounded-md p-2">
                      {it.image && <img src={it.image} alt="" className="h-10 w-10 rounded object-cover" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{it.name}</div>
                      </div>
                      <Input type="number" min={1} value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Math.max(1, Number(e.target.value)) })} className="w-20" />
                      <Input type="number" min={0} value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })} className="w-28" />
                      <div className="w-24 text-right font-semibold text-sm">৳ {(it.unit_price * it.quantity).toLocaleString()}</div>
                      <Button size="icon" variant="ghost" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Shipping note <span className="text-[10px] text-muted-foreground">(courier instruction, max 150)</span></Label>
                <Textarea rows={2} maxLength={150} value={shippingNote} onChange={(e) => setShippingNote(e.target.value)} />
              </div>
              <div><Label>Customer note</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
              <div><Label>Internal note</Label><Textarea rows={2} value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} /></div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Payment</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COD">Cash on Delivery</SelectItem>
                    <SelectItem value="bKash">bKash</SelectItem>
                    <SelectItem value="Nagad">Nagad</SelectItem>
                    <SelectItem value="Bank">Bank Transfer</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Shipping fee</Label><Input type="number" min={0} value={shipping} onChange={(e) => setShipping(Number(e.target.value))} /></div>
              <div><Label>Discount</Label><Input type="number" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></div>
              <div><Label>Advance paid</Label><Input type="number" min={0} value={advance} onChange={(e) => setAdvance(Number(e.target.value))} /></div>
              {Number(advance) > 0 && (
                <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/50 p-3">
                  <div>
                    <Label>Advance Source <span className="text-rose-600">*</span></Label>
                    <Select value={advanceSource} onValueChange={setAdvanceSource}>
                      <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bKash">bKash</SelectItem>
                        <SelectItem value="Nagad">Nagad</SelectItem>
                        <SelectItem value="Rocket">Rocket</SelectItem>
                        <SelectItem value="Upay">Upay</SelectItem>
                        <SelectItem value="Bank">Bank Transfer</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Payment Number / Last 4 Digits <span className="text-rose-600">*</span></Label>
                    <Input
                      inputMode="numeric"
                      maxLength={20}
                      value={advanceNumber}
                      onChange={(e) => setAdvanceNumber(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="e.g. 01712345678 or 5678"
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">Full number ba last 4 digit — jeta accept koreche.</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Transaction ID <span className="text-muted-foreground/70">(optional)</span></Label>
                    <Input
                      maxLength={50}
                      value={advanceTxnId}
                      onChange={(e) => setAdvanceTxnId(e.target.value)}
                      placeholder="e.g. 9F7A2BX1Q"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>৳ {subtotal.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span>৳ {Number(shipping).toLocaleString()}</span></div>
              {Number(discount) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>− ৳ {Number(discount).toLocaleString()}</span></div>}
              {Number(advance) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Advance</span><span>− ৳ {Number(advance).toLocaleString()}</span></div>}
              <div className="flex justify-between font-bold text-lg pt-2 border-t"><span>Total</span><span>৳ {total.toLocaleString()}</span></div>
            </CardContent>
          </Card>

          <Button className="w-full" size="lg" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : "Create Order"}
          </Button>
        </div>
      </div>
    </div>
  );
}