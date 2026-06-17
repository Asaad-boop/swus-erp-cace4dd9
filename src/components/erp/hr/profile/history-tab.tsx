import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { listEmploymentHistory, addEmploymentHistory } from "@/lib/erp/hr/profile.functions";

const EVENT_TYPES = [
  "joined","promotion","department_change","designation_change","salary_revision","status_change","transfer","confirmation","exit","other",
];

export function HistoryTab({ employeeId, canEdit }: { employeeId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listEmploymentHistory);
  const addFn = useServerFn(addEmploymentHistory);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["hr-history", employeeId],
    queryFn: () => listFn({ data: { employeeId } }),
  });

  const [open, setOpen] = useState(false);
  const [type, setType] = useState("promotion");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [notes, setNotes] = useState("");

  const mut = useMutation({
    mutationFn: () => addFn({
      data: {
        employee_id: employeeId,
        event_type: type,
        event_date: date,
        from_value: from ? { note: from } : undefined,
        to_value: to ? { note: to } : undefined,
        notes: notes || null,
      },
    }),
    onSuccess: () => {
      toast.success("Entry added");
      qc.invalidateQueries({ queryKey: ["hr-history", employeeId] });
      setOpen(false); setFrom(""); setTo(""); setNotes("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm text-muted-foreground">{(rows as any[]).length} events</div>
          {canEdit && <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Entry</Button>}
        </div>
        {isLoading ? (
          <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : (rows as any[]).length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No history events yet.</div>
        ) : (
          <ol className="relative border-l border-border ml-3 space-y-4">
            {(rows as any[]).map((h) => (
              <li key={h.id} className="pl-4 -ml-px">
                <div className="absolute -ml-[7px] h-3 w-3 rounded-full bg-primary" />
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="capitalize">{h.event_type.replace(/_/g," ")}</Badge>
                  <span className="text-xs text-muted-foreground">{h.event_date}</span>
                </div>
                {(h.from_value || h.to_value) && (
                  <div className="text-xs mt-1 flex items-center gap-2 text-muted-foreground">
                    {h.from_value && <code className="bg-muted px-1.5 py-0.5 rounded">{JSON.stringify(h.from_value)}</code>}
                    {h.from_value && h.to_value && <ArrowRight className="h-3 w-3" />}
                    {h.to_value && <code className="bg-primary/10 px-1.5 py-0.5 rounded">{JSON.stringify(h.to_value)}</code>}
                  </div>
                )}
                {h.notes && <div className="text-sm mt-1">{h.notes}</div>}
              </li>
            ))}
          </ol>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add History Entry</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Event Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g," ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>From</Label><Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="prev value" /></div>
              <div><Label>To</Label><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="new value" /></div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => mut.mutate()} disabled={mut.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}