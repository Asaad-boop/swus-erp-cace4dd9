import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";

export type PrintType = "invoice" | "picking" | "both";
export type PrintScope = "pending" | "packed" | "ready";

export function BatchPrintDialog({
  open, onOpenChange, counts, onPrint,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  counts: { pending: number; packed: number; ready: number };
  onPrint: (scopes: PrintScope[], type: PrintType) => void;
}) {
  const [scopes, setScopes] = useState<PrintScope[]>(["pending"]);
  const [type, setType] = useState<PrintType>("invoice");

  const toggle = (s: PrintScope) =>
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Print Batch</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Select orders to print:</Label>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={scopes.includes("pending")} onCheckedChange={() => toggle("pending")} />
                All Pending ({counts.pending} orders)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={scopes.includes("packed")} onCheckedChange={() => toggle("packed")} />
                All Packed ({counts.packed} orders)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={scopes.includes("ready")} onCheckedChange={() => toggle("ready")} />
                All Ready ({counts.ready} orders)
              </label>
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium">Print Type:</Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as PrintType)} className="mt-2 space-y-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="invoice" /> Invoice
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="picking" /> Picking List
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="both" /> Both (Invoice + Picking List)
              </label>
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={scopes.length === 0} onClick={() => onPrint(scopes, type)}>Print Selected</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}