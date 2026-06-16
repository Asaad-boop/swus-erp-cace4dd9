import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listTrackerSites,
  createTrackerSite,
  updateTrackerSite,
  rotateTrackerSiteKey,
  deleteTrackerSite,
  getTrackerStats,
} from "@/lib/erp/marketing/tracker.functions";
import { useBrand } from "@/contexts/brand-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Copy, KeyRound, Plus, Trash2, Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/erp/marketing/install")({
  head: () => ({ meta: [{ title: "Install Tracker — Marketing" }] }),
  component: InstallTrackerPage,
});

function copy(s: string) {
  navigator.clipboard.writeText(s).then(() => toast.success("Copied"));
}

function InstallTrackerPage() {
  const { brands, activeBrand } = useBrand();
  const qc = useQueryClient();
  const fnList = useServerFn(listTrackerSites);
  const fnStats = useServerFn(getTrackerStats);
  const fnCreate = useServerFn(createTrackerSite);
  const fnUpdate = useServerFn(updateTrackerSite);
  const fnRotate = useServerFn(rotateTrackerSiteKey);
  const fnDelete = useServerFn(deleteTrackerSite);

  const sitesQ = useQuery({ queryKey: ["mkt-sites"], queryFn: () => fnList() });
  const statsQ = useQuery({
    queryKey: ["mkt-stats", activeBrand?.id],
    queryFn: () => fnStats({ data: { brand_id: activeBrand?.id } }),
    enabled: !!activeBrand,
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [origins, setOrigins] = useState("");
  const [brandId, setBrandId] = useState(activeBrand?.id ?? "");

  const createMut = useMutation({
    mutationFn: () =>
      fnCreate({
        data: {
          brand_id: brandId,
          name,
          allowed_origins: origins
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: () => {
      toast.success("Site created");
      setOpen(false);
      setName("");
      setOrigins("");
      qc.invalidateQueries({ queryKey: ["mkt-sites"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rotateMut = useMutation({
    mutationFn: (id: string) => fnRotate({ data: { id } }),
    onSuccess: () => {
      toast.success("Site key rotated");
      qc.invalidateQueries({ queryKey: ["mkt-sites"] });
    },
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) =>
      fnUpdate({ data: { id: v.id, is_active: v.is_active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mkt-sites"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => fnDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["mkt-sites"] });
    },
  });

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const trackerSrc = `${baseUrl}/api/public/mkt/tracker.js`;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Website Tracker</h1>
          <p className="text-sm text-muted-foreground">
            UTM, fbclid, fbp, mobile capture — orders ke ad campaign er sathe attribute korar foundation.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" />New Tracker Site</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Tracker Site</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Brand</Label>
                <select
                  className="w-full mt-1 border rounded h-9 px-2 bg-background"
                  value={brandId}
                  onChange={(e) => setBrandId(e.target.value)}
                >
                  <option value="">Select brand…</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Shopify Store" />
              </div>
              <div>
                <Label>Allowed Origins (optional, comma or newline)</Label>
                <Input
                  value={origins}
                  onChange={(e) => setOrigins(e.target.value)}
                  placeholder="https://hobbyshop.com.bd, https://www.hobbyshop.com.bd"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Khali rakhle shob origin allow hobe. Production e nijer domain dao.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={!brandId || !name || createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                {createMut.isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {statsQ.data && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Last 7 days {activeBrand ? `· ${activeBrand.name}` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex gap-8 text-sm">
            <div><div className="text-2xl font-bold">{statsQ.data.sessions}</div><div className="text-muted-foreground">Sessions</div></div>
            <div><div className="text-2xl font-bold">{statsQ.data.events}</div><div className="text-muted-foreground">Events</div></div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Install snippet</CardTitle>
          <CardDescription>Site er &lt;head&gt; e paste koro. site-key replace koro nicher table theke.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted text-xs p-3 rounded overflow-x-auto">{`<script async src="${trackerSrc}" data-site-key="YOUR_SITE_KEY"></script>`}</pre>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => copy(`<script async src="${trackerSrc}" data-site-key="YOUR_SITE_KEY"></script>`)}>
            <Copy className="h-3.5 w-3.5 mr-1" />Copy
          </Button>
          <div className="mt-3 text-xs text-muted-foreground space-y-1">
            <div>• Auto-capture: <code>page_view</code>, UTM, fbclid, _fbp/_fbc cookie, device.</div>
            <div>• Form submit dhorle <code>lead</code> event + mobile/email auto-detect.</div>
            <div>• Custom: <code>{`window.mktTrack('purchase', { value: 1500, mobile: '01...' })`}</code></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Tracker Sites</CardTitle></CardHeader>
        <CardContent>
          {sitesQ.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {sitesQ.data && sitesQ.data.length === 0 && (
            <div className="text-sm text-muted-foreground">Akhono kono site nai. Upor e "New Tracker Site" theke add koro.</div>
          )}
          <div className="space-y-3">
            {sitesQ.data?.map((s: any) => (
              <div key={s.id} className="border rounded p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {s.name}
                      <Badge variant="outline" className="text-xs">{s.brands?.name ?? s.brand_id.slice(0, 6)}</Badge>
                      {!s.is_active && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Last event: {s.last_event_at ? new Date(s.last_event_at).toLocaleString() : "never"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={s.is_active}
                      onCheckedChange={(v) => toggleMut.mutate({ id: s.id, is_active: v })}
                    />
                    <Button size="sm" variant="outline" onClick={() => rotateMut.mutate(s.id)}>
                      <KeyRound className="h-3.5 w-3.5 mr-1" />Rotate
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      if (confirm("Delete this tracker site? All future events will be rejected.")) deleteMut.mutate(s.id);
                    }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted p-2 rounded truncate">{s.site_key}</code>
                  <Button size="sm" variant="outline" onClick={() => copy(s.site_key)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {s.allowed_origins?.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Origins: {s.allowed_origins.join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}