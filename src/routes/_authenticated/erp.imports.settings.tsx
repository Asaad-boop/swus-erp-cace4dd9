import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/contexts/brand-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listImportSuppliers, upsertImportSupplier,
  listCargoAgents, upsertCargoAgent,
  deleteCargoAgent,
} from "@/lib/erp/imports/imports.functions";
import { fmtBdt } from "@/lib/erp/imports/types";

export const Route = createFileRoute("/_authenticated/erp/imports/settings")({
  head: () => ({ meta: [{ title: "Imports Settings — ERP" }] }),
  component: ImportsSettings,
});

function ImportsSettings() {
  const { brandIds } = useBrand();
  return (
    <div className="p-4 md:p-6 space-y-4">
      <SuppliersTab brandIds={brandIds} />
      <CargoAgentsSection brandIds={brandIds} />
    </div>
  );
}

/* ----------------------- Import Suppliers (continued) ----------------------- */

function SuppliersTab({ brandIds }: { brandIds: string[] }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listImportSuppliers);
  const upsertFn = useServerFn(upsertImportSupplier);
  const brandKey = brandIds.join(",");
  const { data: suppliers = [] } = useQuery({
    queryKey: ["imp-suppliers", brandKey],
    enabled: brandIds.length > 0,
    queryFn: () => listFn({ data: { brandIds } }),
  });
  const [editing, setEditing] = useState<any | null>(null);

  return (
    <>
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Import Suppliers</h3>
        <Button onClick={() => setEditing({})}><Plus className="h-4 w-4 mr-1" />Add Supplier</Button>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {(suppliers as any[]).length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground col-span-full">No import suppliers yet.</Card>}
        {(suppliers as any[]).map((s) => (
          <Card key={s.id} className="p-4 hover:border-primary/40 transition">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <div className="font-semibold truncate">{s.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  {s.brand?.name && <Badge variant="outline" className="text-[10px]">{s.brand.name}</Badge>}
                  <span>{s.country ?? "CN"} · {s.currency ?? "CNY"}</span>
                </div>
              </div>
              <Badge variant="outline">{s.supplier_type}</Badge>
            </div>
            <div className="mt-3 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Current Due</span><span className={`font-medium tabular-nums ${Number(s.current_due) > 0 ? "text-orange-600" : ""}`}>{fmtBdt(s.current_due)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Credit Limit</span><span className="font-medium tabular-nums">{fmtBdt(s.credit_limit_bdt)}</span></div>
              {s.source_link && <div className="truncate"><a href={s.source_link} target="_blank" rel="noreferrer" className="text-primary hover:underline">Source link →</a></div>}
            </div>
            <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => setEditing(s)}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
          </Card>
        ))}
      </div>
      {editing && (
        <SupplierDialog
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            const targetBrand = editing?.brand_id ?? editing?.brand?.id ?? brandIds[0];
            if (!targetBrand) { toast.error("No brand available"); return; }
            await upsertFn({ data: { ...payload, brandId: targetBrand } });
            qc.invalidateQueries({ queryKey: ["imp-suppliers", brandKey] });
            toast.success("Supplier saved");
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function SupplierDialog({ initial, onClose, onSave }: { initial: any; onClose: () => void; onSave: (p: any) => Promise<void> }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [sourceLink, setSourceLink] = useState(initial?.source_link ?? "");
  const [country, setCountry] = useState(initial?.country ?? "CN");
  const [currency, setCurrency] = useState(initial?.currency ?? "CNY");
  const [terms, setTerms] = useState<number>(Number(initial?.payment_terms_days ?? 0));
  const [credit, setCredit] = useState<number>(Number(initial?.credit_limit_bdt ?? 0));
  const [type, setType] = useState<"import" | "local" | "both">(initial?.supplier_type ?? "import");
  const [active, setActive] = useState<boolean>(initial?.is_active ?? true);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial?.id ? "Edit" : "New"} Import Supplier</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone / WeChat</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="import">Import only</SelectItem>
                  <SelectItem value="local">Local only</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Source Link</Label><Input value={sourceLink} onChange={(e) => setSourceLink(e.target.value)} placeholder="1688 / Alibaba URL" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Country</Label><Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={8} /></div>
            <div><Label>Currency</Label><Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={8} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Payment Terms (days)</Label><Input type="number" min={0} value={terms} onChange={(e) => setTerms(Number(e.target.value))} /></div>
            <div><Label>Credit Limit (BDT)</Label><Input type="number" step="0.01" value={credit} onChange={(e) => setCredit(Number(e.target.value))} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="rounded" />Active</label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!name || busy} onClick={async () => {
            setBusy(true);
            try {
              await onSave({
                id: initial?.id,
                name, phone, source_link: sourceLink, country, currency,
                payment_terms_days: terms, credit_limit_bdt: credit,
                supplier_type: type, is_active: active,
              });
            } catch (e: any) { toast.error(e?.message ?? "Failed"); }
            finally { setBusy(false); }
          }}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
/* ----------------------- Cargo Agents (additive) ----------------------- */

function CargoAgentsSection({ brandIds }: { brandIds: string[] }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listCargoAgents);
  const upsertFn = useServerFn(upsertCargoAgent);
  const deleteFn = useServerFn(deleteCargoAgent);
  const brandKey = brandIds.join(",");
  const { data: agents = [] } = useQuery({
    queryKey: ["imp-cargo-agents", brandKey],
    queryFn: () => listFn({ data: { brandIds } }),
    enabled: brandIds.length > 0,
  });
  const [editing, setEditing] = useState<any | null>(null);

  return (
    <div className="space-y-3 pt-6 border-t border-border">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Cargo Agents</h3>
        <Button onClick={() => setEditing({})}><Plus className="h-4 w-4 mr-1" />Add Cargo Agent</Button>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {(agents as any[]).length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground col-span-full">
            No cargo agents yet.
          </Card>
        )}
        {(agents as any[]).map((a) => (
          <Card key={a.id} className="p-4 hover:border-primary/40 transition">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold truncate">{a.name}</div>
                {a.brand?.name && <Badge variant="outline" className="text-[10px] mt-0.5">{a.brand.name}</Badge>}
                {a.contact_person && <div className="text-xs text-muted-foreground truncate">{a.contact_person}</div>}
                {a.phone && <div className="text-xs text-muted-foreground">{a.phone}</div>}
              </div>
              <Badge variant={a.is_active ? "outline" : "secondary"}>{a.is_active ? "Active" : "Inactive"}</Badge>
            </div>
            {a.address && <div className="mt-2 text-xs text-muted-foreground line-clamp-2">{a.address}</div>}
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditing(a)}>
                <Pencil className="h-3.5 w-3.5 mr-1" />Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await upsertFn({ data: { id: a.id, brandId: (a.brand_id ?? a.brand?.id) ?? null, name: a.name, contact_person: a.contact_person ?? undefined, phone: a.phone ?? undefined, address: a.address ?? undefined, notes: a.notes ?? undefined, is_active: !a.is_active } });
                  qc.invalidateQueries({ queryKey: ["imp-cargo-agents", brandKey] });
                  toast.success(a.is_active ? "Deactivated" : "Activated");
                }}
              >
                {a.is_active ? "Deactivate" : "Activate"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={async () => {
                  if (!confirm(`Delete cargo agent "${a.name}"?`)) return;
                  try {
                    await deleteFn({ data: { id: a.id } });
                    qc.invalidateQueries({ queryKey: ["imp-cargo-agents", brandKey] });
                    toast.success("Deleted");
                  } catch (e: any) {
                    const msg = e?.message ?? "Failed";
                    if (msg.includes("Cannot delete") && confirm(`${msg}\n\nForce delete (detach from POs)?`)) {
                      try {
                        await deleteFn({ data: { id: a.id, force: true } });
                        qc.invalidateQueries({ queryKey: ["imp-cargo-agents", brandKey] });
                        toast.success("Force deleted");
                      } catch (e2: any) { toast.error(e2?.message ?? "Failed"); }
                    } else toast.error(msg);
                  }
                }}
              >
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {editing && (
        <CargoAgentDialog
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (p) => {
            await upsertFn({ data: { ...p } });
            qc.invalidateQueries({ queryKey: ["imp-cargo-agents", brandKey] });
            toast.success("Cargo agent saved");
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CargoAgentDialog({ initial, onClose, onSave }: { initial: any; onClose: () => void; onSave: (p: any) => Promise<void> }) {
  const { brands } = useBrand();
  const [name, setName] = useState(initial?.name ?? "");
  const [brandId, setBrandId] = useState<string>(
    initial?.brand_id === null ? "__all__" : (initial?.brand_id ?? initial?.brand?.id ?? "__all__"),
  );
  const [contact, setContact] = useState(initial?.contact_person ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [active, setActive] = useState<boolean>(initial?.is_active ?? true);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial?.id ? "Edit" : "New"} Cargo Agent</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <Label>Brand</Label>
            <Select value={brandId} onValueChange={setBrandId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">🌐 All brands (shared)</SelectItem>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Contact person</Label><Input value={contact} onChange={(e) => setContact(e.target.value)} /></div>
            <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
          <div><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          <div><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="rounded" />Active
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!name || busy} onClick={async () => {
            setBusy(true);
            try {
              await onSave({
                id: initial?.id,
                brandId: brandId === "__all__" ? null : brandId,
                name,
                contact_person: contact || undefined,
                phone: phone || undefined,
                address: address || undefined,
                notes: notes || undefined,
                is_active: active,
              });
            } catch (e: any) { toast.error(e?.message ?? "Failed"); }
            finally { setBusy(false); }
          }}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
