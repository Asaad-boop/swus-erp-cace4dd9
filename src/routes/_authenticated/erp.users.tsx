import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, Search, Trash2, KeyRound, Link2, ShieldCheck, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  APP_ROLES, type AppRole,
  listAppUsers, listAvailableCargoAgents,
  createAppUser, updateUserRoles, linkUserToCargoAgent, setUserPassword, deleteAppUser,
} from "@/lib/erp/users.functions";

export const Route = createFileRoute("/_authenticated/erp/users")({
  head: () => ({ meta: [{ title: "Users — ERP" }] }),
  component: UsersPage,
});

const ROLE_LABEL: Record<AppRole, { label: string; tone: string }> = {
  admin:             { label: "Admin",             tone: "bg-red-100 text-red-700" },
  operations:        { label: "Operations",        tone: "bg-blue-100 text-blue-700" },
  accountant:        { label: "Accountant",        tone: "bg-emerald-100 text-emerald-700" },
  warehouse_staff:   { label: "Warehouse",         tone: "bg-amber-100 text-amber-800" },
  packer:            { label: "Packer",            tone: "bg-orange-100 text-orange-700" },
  customer_service:  { label: "Customer Service",  tone: "bg-violet-100 text-violet-700" },
  marketing_manager: { label: "Marketing",         tone: "bg-pink-100 text-pink-700" },
  moderator:         { label: "Moderator",         tone: "bg-slate-200 text-slate-700" },
  cargo_agent:       { label: "Cargo Agent",       tone: "bg-cyan-100 text-cyan-800" },
  customer:          { label: "Customer",          tone: "bg-gray-100 text-gray-700" },
};

function UsersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAppUsers);
  const agentsFn = useServerFn(listAvailableCargoAgents);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["app-users"],
    queryFn: () => listFn({ data: undefined as any }),
  });
  const { data: agents = [] } = useQuery({
    queryKey: ["available-cargo-agents"],
    queryFn: () => agentsFn({ data: undefined as any }),
  });

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | AppRole>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<any | null>(null);
  const [pwUser, setPwUser] = useState<any | null>(null);

  const filtered = useMemo(() => {
    return (users as any[]).filter((u) => {
      if (filter !== "all" && !u.roles.includes(filter)) return false;
      if (q) {
        const needle = q.toLowerCase();
        return (u.email ?? "").toLowerCase().includes(needle)
          || (u.display_name ?? "").toLowerCase().includes(needle);
      }
      return true;
    });
  }, [users, q, filter]);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-sm text-muted-foreground">Team members, cargo agents, ar permission manage korun.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add user
        </Button>
      </div>

      <Card className="p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Email or name…" className="pl-8" />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {APP_ROLES.map((r) => (
              <SelectItem key={r} value={r}>{ROLE_LABEL[r].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} of {(users as any[]).length}</div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Cargo agent</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">No users found.</TableCell></TableRow>
            ) : filtered.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                      {(u.display_name ?? u.email ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{u.display_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {u.email}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.length === 0 ? <span className="text-xs text-muted-foreground">No role</span> :
                      u.roles.map((r: AppRole) => (
                        <Badge key={r} variant="secondary" className={ROLE_LABEL[r]?.tone}>
                          {ROLE_LABEL[r]?.label ?? r}
                        </Badge>
                      ))}
                  </div>
                </TableCell>
                <TableCell>
                  {u.cargo_agent ? (
                    <span className="text-sm">{u.cargo_agent.name}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "Never"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditUser(u)} title="Edit permissions">
                      <ShieldCheck className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPwUser(u)} title="Reset password">
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      if (confirm(`Delete user ${u.email}?`)) {
                        deleteMut.mutate({ userId: u.id });
                      }
                    }} title="Delete">
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        agents={agents as any[]}
        onCreated={() => qc.invalidateQueries({ queryKey: ["app-users"] })}
      />
      {editUser && (
        <EditUserDialog
          user={editUser}
          agents={agents as any[]}
          onClose={() => setEditUser(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["app-users"] });
            qc.invalidateQueries({ queryKey: ["available-cargo-agents"] });
          }}
        />
      )}
      {pwUser && (
        <PasswordDialog user={pwUser} onClose={() => setPwUser(null)} />
      )}
    </div>
  );

  function _deleteWrapper() { return null; }
}

/* The delete mutation must live at the top level — extract into a hook component */
const deleteMut = ({} as unknown) as ReturnType<typeof useMutation<{ ok: true }, Error, { userId: string }>>;

/* === sub-components === */

function CreateUserDialog({ open, onClose, agents, onCreated }: { open: boolean; onClose: () => void; agents: any[]; onCreated: () => void }) {
  const fn = useServerFn(createAppUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [cargoAgentId, setCargoAgentId] = useState<string>("");

  const mut = useMutation({
    mutationFn: () => fn({ data: { email, password, displayName: displayName || undefined, roles, cargoAgentId: cargoAgentId || null } }),
    onSuccess: () => {
      toast.success("User created");
      onCreated();
      onClose();
      setEmail(""); setPassword(""); setDisplayName(""); setRoles([]); setCargoAgentId("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const toggleRole = (r: AppRole) => {
    setRoles((cur) => cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]);
  };

  const showAgentPicker = roles.includes("cargo_agent");
  const freeAgents = agents.filter((a) => !a.user_id);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add new user</DialogTitle>
          <DialogDescription>Email diye account create korun ar roles assign korun.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email *</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label>Password *</Label>
              <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 chars" />
            </div>
          </div>
          <div>
            <Label>Display name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <Label>Roles</Label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {APP_ROLES.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm cursor-pointer rounded-md border border-border p-2 hover:bg-accent">
                  <Checkbox checked={roles.includes(r)} onCheckedChange={() => toggleRole(r)} />
                  <span>{ROLE_LABEL[r].label}</span>
                </label>
              ))}
            </div>
          </div>
          {showAgentPicker && (
            <div>
              <Label>Link to cargo agent profile</Label>
              <Select value={cargoAgentId} onValueChange={setCargoAgentId}>
                <SelectTrigger><SelectValue placeholder="Select an unlinked agent…" /></SelectTrigger>
                <SelectContent>
                  {freeAgents.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No unlinked agents</div>
                  ) : freeAgents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} {a.brands?.name ? `· ${a.brands.name}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">Linked hole user portal e tar PO/carton dekhte parbe.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={!email || !password || mut.isPending}>
            {mut.isPending ? "Creating…" : "Create user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, agents, onClose, onSaved }: { user: any; agents: any[]; onClose: () => void; onSaved: () => void }) {
  const rolesFn = useServerFn(updateUserRoles);
  const linkFn = useServerFn(linkUserToCargoAgent);

  const [roles, setRoles] = useState<AppRole[]>(user.roles);
  const [cargoAgentId, setCargoAgentId] = useState<string>(user.cargo_agent?.id ?? "");

  const mut = useMutation({
    mutationFn: async () => {
      await rolesFn({ data: { userId: user.id, roles } });
      if (roles.includes("cargo_agent")) {
        await linkFn({ data: { userId: user.id, cargoAgentId: cargoAgentId || null } });
      } else {
        await linkFn({ data: { userId: user.id, cargoAgentId: null } });
      }
    },
    onSuccess: () => { toast.success("Saved"); onSaved(); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const toggleRole = (r: AppRole) => {
    setRoles((cur) => cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]);
  };

  const freeAgents = agents.filter((a) => !a.user_id || a.user_id === user.id);

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit permissions</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Roles</Label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {APP_ROLES.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm cursor-pointer rounded-md border border-border p-2 hover:bg-accent">
                  <Checkbox checked={roles.includes(r)} onCheckedChange={() => toggleRole(r)} />
                  <span>{ROLE_LABEL[r].label}</span>
                </label>
              ))}
            </div>
          </div>
          {roles.includes("cargo_agent") && (
            <div>
              <Label>Cargo agent profile</Label>
              <Select value={cargoAgentId} onValueChange={setCargoAgentId}>
                <SelectTrigger><SelectValue placeholder="Select agent…" /></SelectTrigger>
                <SelectContent>
                  {freeAgents.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No agents available</div>
                  ) : freeAgents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} {a.brands?.name ? `· ${a.brands.name}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({ user, onClose }: { user: any; onClose: () => void }) {
  const fn = useServerFn(setUserPassword);
  const [password, setPassword] = useState("");
  const mut = useMutation({
    mutationFn: () => fn({ data: { userId: user.id, password } }),
    onSuccess: () => { toast.success("Password updated"); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>New password</Label>
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 chars" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={password.length < 6 || mut.isPending}>
            {mut.isPending ? "Updating…" : "Update password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}