import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { useCurrentRole } from "@/hooks/use-current-role";
import { clearTestData } from "@/lib/erp/settings/danger.functions";

export function DangerZoneSection({ brandId }: { brandId: string }) {
  const { isAdmin } = useCurrentRole();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const clearFn = useServerFn(clearTestData);

  const clearMut = useMutation({
    mutationFn: () => clearFn({ data: { brandId, confirm: "DELETE" } }),
    onSuccess: (r) => { toast.success(`Deleted ${r.deleted} test order(s)`); setOpen(false); setConfirm(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Admin only.</div>;
  }

  const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID;

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-destructive flex items-center gap-2"><AlertTriangle className="h-5 w-5" />Danger Zone</h2>
        <p className="text-xs text-muted-foreground">Destructive actions. Double-check before proceeding.</p>
      </div>

      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>These actions are irreversible. Always run a backup first.</AlertDescription>
      </Alert>

      <section className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-5 space-y-3">
        <div>
          <h3 className="font-semibold">Clear test data</h3>
          <p className="text-xs text-muted-foreground">
            Deletes orders where <code>notes</code> contains "TEST" (current brand only). Also removes related order items, notes, status history.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirm(""); }}>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm"><Trash2 className="h-4 w-4" /> Clear test data…</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-destructive">Confirm test data deletion</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              Type <code className="font-mono font-bold text-foreground">DELETE</code> to confirm.
            </p>
            <Label className="sr-only">Confirm</Label>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="destructive" disabled={confirm !== "DELETE" || clearMut.isPending} onClick={() => clearMut.mutate()}>
                {clearMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete forever
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>

      <section className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-5 space-y-2">
        <h3 className="font-semibold">Full DB backup</h3>
        <p className="text-xs text-muted-foreground">
          Supabase manages daily backups automatically. Trigger a manual backup or download from the dashboard.
        </p>
        {projectRef && (
          <a
            href={`https://supabase.com/dashboard/project/${projectRef}/database/backups`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            Open Supabase backups <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </section>
    </div>
  );
}
