import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Mail, Shield, UserPlus, Trash2, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBrand } from "@/contexts/brand-context";
import { useCurrentRole } from "@/hooks/use-current-role";
import {
  listAppUsers,
  createAppUser,
  updateUserRoles,
  deleteAppUser,
  toggleUserBan,
  APP_ROLES,
} from "@/lib/erp/users.functions";
import {
  listUserBrandAccess,
  setUserBrandAccess,
} from "@/lib/erp/settings/user-brand-access.functions";

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: "Full access — all data, all settings, user management",
  operations: "Orders, inventory, courier — no finance secrets",
  accountant: "Finance, reports, reconciliation — read inventory",
  warehouse_staff: "Stock movements, picking, packing",
  packer: "Pack orders, print labels",
  customer_service: "Read orders & customers, add notes",
  marketing_manager: "Campaigns, ads, attribution — no finance",
  moderator: "Limited content moderation",
  customer: "Storefront only",
};

export function UsersSection() {
  const { brands } = useBrand();
  const { isAdmin } = useCurrentRole();
  const qc = useQueryClient();

  const listFn = useServerFn(listAppUsers);
  const createFn = useServerFn(createAppUser);
  const updateRolesFn = useServerFn(updateUserRoles);
  const deleteFn = useServerFn(deleteAppUser);
  const banFn = useServerFn(toggleUserBan);
  const listAccessFn = useServerFn(listUserBrandAccess);
  const setAccessFn = useServerFn(setUserBrandAccess);

  const usersQ = useQuery({
    queryKey: ["admin-users"],
    enabled: isAdmin,
    queryFn: () => listFn(),
  });
  const accessQ = useQuery({
    queryKey: ["user-brand-access"],
    enabled: isAdmin,
    queryFn: () => listAccessFn(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["user-brand-access"] });
  };

  const createMut = useMutation({
    mutationFn: (d: { email: string; password: string; displayName: string; role: string }) =>
      createFn({ data: { email: d.email, password: d.password, displayName: d.displayName, roles: [d.role] } }),
    onSuccess: () => { toast.success("User created"); invalidate(); setInviteOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rolesMut = useMutation({
    mutationFn: (d: { userId: string; roles: string[] }) => updateRolesFn({ data: d }),
    onSuccess: () => { toast.success("Role updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const accessMut = useMutation({
    mutationFn: (d: { userId: string; brandIds: string[] }) => setAccessFn({ data: d }),
    onSuccess: () => { toast.success("Brand access updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const banMut = useMutation({
    mutationFn: (d: { userId: string; ban: boolean }) => banFn({ data: d }),
    onSuccess: () => { toast.success("User updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (userId: string) => deleteFn({ data: { userId } }),
    onSuccess: () => { toast.success("User deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: "", password: "", displayName: "", role: "operations" });

  if (!isAdmin) {
    return <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
      <Shield className="inline h-4 w-4 mr-1" /> Admin only.
    </div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Users & Permissions</h2>
          <p className="text-xs text-muted-foreground">Manage staff, roles and per-brand access.</p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild><Button size="sm"><UserPlus className="h-4 w-4" /> Invite user</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Invite user</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Email</Label><Input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /></div>
              <div><Label>Display name</Label><Input value={invite.displayName} onChange={(e) => setInvite({ ...invite, displayName: e.target.value })} /></div>
              <div><Label>Temporary password</Label><Input type="password" value={invite.password} onChange={(e) => setInvite({ ...invite, password: e.target.value })} /></div>
              <div><Label>Role</Label>
                <Select value={invite.role} onValueChange={(v) => setInvite({ ...invite, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{APP_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => createMut.mutate(invite)} disabled={createMut.isPending || !invite.email || invite.password.length < 6}>
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Create user
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* USER LIST */}
      <div className="rounded-xl border bg-card divide-y">
        {usersQ.isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        {usersQ.data?.map((u) => {
          const userAccess: string[] = (accessQ.data as any)?.[u.id] ?? [];
          const isBanned = !!u.banned_until && u.banned_until !== "none";
          return (
            <div key={u.id} className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold flex items-center gap-2">
                    {u.display_name || u.email}
                    {isBanned && <Badge variant="destructive" className="text-[10px]">Disabled</Badge>}
                    {!u.email_confirmed_at && <Badge variant="outline" className="text-[10px]">Unverified</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </div>
                <Select
                  value={u.roles[0] ?? "operations"}
                  onValueChange={(v) => rolesMut.mutate({ userId: u.id, roles: [v] })}
                >
                  <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{APP_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="icon" variant="ghost" onClick={() => banMut.mutate({ userId: u.id, ban: !isBanned })} title={isBanned ? "Enable" : "Disable"}>
                  <Power className={"h-4 w-4 " + (isBanned ? "text-destructive" : "")} />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => {
                  if (confirm(`Delete ${u.email}?`)) deleteMut.mutate(u.id);
                }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              <div className="flex items-center gap-2 flex-wrap pl-1">
                <span className="text-xs font-medium text-muted-foreground">Brands:</span>
                {brands.map((b) => {
                  const checked = userAccess.includes(b.id);
                  return (
                    <label key={b.id} className="flex items-center gap-1.5 text-xs border rounded px-2 py-1 cursor-pointer hover:bg-accent">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const next = v
                            ? [...userAccess, b.id]
                            : userAccess.filter((x) => x !== b.id);
                          accessMut.mutate({ userId: u.id, brandIds: next });
                        }}
                      />
                      {b.name}
                    </label>
                  );
                })}
                {brands.length === 0 && <span className="text-xs text-muted-foreground italic">No brands</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ROLE MATRIX */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold mb-3">Role descriptions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          {APP_ROLES.map((r) => (
            <div key={r} className="flex gap-2 items-start">
              <Badge variant="outline" className="font-mono shrink-0">{r}</Badge>
              <span className="text-muted-foreground">{ROLE_DESCRIPTIONS[r] ?? "—"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
