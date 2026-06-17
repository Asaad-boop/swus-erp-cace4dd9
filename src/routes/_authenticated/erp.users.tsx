import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Plus, Search, Trash2, KeyRound, ShieldCheck, Mail, MoreHorizontal,
  Download, Copy, Ban, CheckCircle2, Link as LinkIcon, UserCog, Users as UsersIcon,
  Activity, ArrowUpDown, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger,
  DropdownMenuSubContent, DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  APP_ROLES, type AppRole,
  listAppUsers,
  createAppUser, updateUserRoles, setUserPassword, deleteAppUser,
  toggleUserBan, updateUserProfile, generateAuthLink, bulkDeleteUsers, bulkSetRole,
} from "@/lib/erp/users.functions";

export const Route = createFileRoute("/_authenticated/erp/users")({
  head: () => ({ meta: [{ title: "Users — ERP" }] }),
  component: UsersPage,
});

const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  operations: "Operations",
  accountant: "Accountant",
  warehouse_staff: "Warehouse",
  packer: "Packer",
  customer_service: "Customer Service",
  marketing_manager: "Marketing",
  moderator: "Moderator",
  customer: "Customer",
};

const ROLE_DOT: Record<AppRole, string> = {
  admin: "bg-red-500",
  operations: "bg-blue-500",
  accountant: "bg-emerald-500",
  warehouse_staff: "bg-amber-500",
  packer: "bg-orange-500",
  customer_service: "bg-violet-500",
  marketing_manager: "bg-pink-500",
  moderator: "bg-slate-500",
  customer: "bg-zinc-400",
};

const TEAM_ROLES: AppRole[] = ["admin","operations","accountant","warehouse_staff","packer","customer_service","marketing_manager","moderator"];

type Tab = "all" | "team" | "customer" | "disabled" | "no_role";
type SortKey = "name" | "created" | "last_sign_in";

function initials(s?: string | null) {
  const t = (s ?? "?").trim();
  const parts = t.split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function UsersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAppUsers);
  const deleteFn = useServerFn(deleteAppUser);
  const banFn = useServerFn(toggleUserBan);
  const bulkDelFn = useServerFn(bulkDeleteUsers);
  const bulkRoleFn = useServerFn(bulkSetRole);
  const linkFn = useServerFn(generateAuthLink);

  const { data: users = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["app-users"],
    queryFn: () => listFn({ data: undefined as any }),
  });

  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<any | null>(null);
  const [pwUser, setPwUser] = useState<any | null>(null);
  const [detailUser, setDetailUser] = useState<any | null>(null);
  const [confirmDel, setConfirmDel] = useState<any | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkDel, setConfirmBulkDel] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["app-users"] });

  const deleteMut = useMutation({
    mutationFn: (vars: { userId: string }) => deleteFn({ data: vars }),
    onSuccess: () => { toast.success("User deleted"); invalidate(); setConfirmDel(null); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const banMut = useMutation({
    mutationFn: (vars: { userId: string; ban: boolean }) => banFn({ data: vars }),
    onSuccess: (_, v) => { toast.success(v.ban ? "User disabled" : "User enabled"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const bulkDelMut = useMutation({
    mutationFn: () => bulkDelFn({ data: { userIds: [...selected] } }),
    onSuccess: (r: any) => { toast.success(`${r.count} user(s) deleted`); setSelected(new Set()); setConfirmBulkDel(false); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const bulkRoleMut = useMutation({
    mutationFn: (vars: { role: AppRole; action: "add" | "remove" }) => bulkRoleFn({ data: { userIds: [...selected], ...vars } }),
    onSuccess: () => { toast.success("Roles updated"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  /* ---------- derived ---------- */
  const counts = useMemo(() => {
    const all = users as any[];
    const now = Date.now();
    const isDisabled = (u: any) => u.banned_until && new Date(u.banned_until).getTime() > now;
    return {
      total: all.length,
      team: all.filter(u => u.roles.some((r: AppRole) => TEAM_ROLES.includes(r))).length,
      customer: all.filter(u => u.roles.includes("customer") || u.roles.length === 0).length,
      disabled: all.filter(isDisabled).length,
      no_role: all.filter(u => u.roles.length === 0).length,
      active30d: all.filter(u => u.last_sign_in_at && (now - new Date(u.last_sign_in_at).getTime()) < 30*864e5).length,
      neverSigned: all.filter(u => !u.last_sign_in_at).length,
    };
  }, [users]);

  const filtered = useMemo(() => {
    const now = Date.now();
    let arr = (users as any[]).filter((u) => {
      const disabled = u.banned_until && new Date(u.banned_until).getTime() > now;
      if (tab === "team" && !u.roles.some((r: AppRole) => TEAM_ROLES.includes(r))) return false;
      if (tab === "customer" && !(u.roles.includes("customer") || u.roles.length === 0)) return false;
      if (tab === "disabled" && !disabled) return false;
      if (tab === "no_role" && u.roles.length !== 0) return false;
      if (q) {
        const n = q.toLowerCase();
        if (!((u.email ?? "").toLowerCase().includes(n) || (u.display_name ?? "").toLowerCase().includes(n))) return false;
      }
      return true;
    });
    arr.sort((a: any, b: any) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name") {
        return ((a.display_name ?? a.email ?? "").localeCompare(b.display_name ?? b.email ?? "")) * dir;
      }
      const av = sortKey === "created" ? a.created_at : a.last_sign_in_at;
      const bv = sortKey === "created" ? b.created_at : b.last_sign_in_at;
      const at = av ? new Date(av).getTime() : 0;
      const bt = bv ? new Date(bv).getTime() : 0;
      return (at - bt) * dir;
    });
    return arr;
  }, [users, q, tab, sortKey, sortDir]);

  const allSelected = filtered.length > 0 && filtered.every(u => selected.has(u.id));

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const exportCsv = () => {
    const rows = [["Email","Name","Roles","Status","Created","Last sign-in"]];
    filtered.forEach(u => {
      const disabled = u.banned_until && new Date(u.banned_until).getTime() > Date.now();
      rows.push([
        u.email ?? "",
        u.display_name ?? "",
        u.roles.join("|"),
        disabled ? "Disabled" : (u.last_sign_in_at ? "Active" : "Never signed-in"),
        u.created_at ?? "",
        u.last_sign_in_at ?? "",
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `users-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const copyLink = async (email: string, type: "recovery" | "magiclink") => {
    try {
      const r: any = await linkFn({ data: { email, type } });
      if (r?.url) {
        await navigator.clipboard.writeText(r.url);
        toast.success(`${type === "recovery" ? "Reset" : "Magic"} link copied to clipboard`);
      }
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><UserCog className="h-6 w-6" /> Users</h1>
          <p className="text-sm text-muted-foreground">Team members ar permission centrally manage korun.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4 mr-1", isFetching && "animate-spin")} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add user
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<UsersIcon className="h-4 w-4" />} label="Total users" value={counts.total} />
        <StatCard icon={<Activity className="h-4 w-4 text-emerald-500" />} label="Active (30d)" value={counts.active30d} />
        <StatCard icon={<Mail className="h-4 w-4 text-amber-500" />} label="Never signed-in" value={counts.neverSigned} />
        <StatCard icon={<Ban className="h-4 w-4 text-red-500" />} label="Disabled" value={counts.disabled} />
      </div>

      {/* Tabs + search */}
      <Card className="p-3 space-y-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="all">All <span className="ml-1.5 text-xs opacity-60">{counts.total}</span></TabsTrigger>
            <TabsTrigger value="team">Team <span className="ml-1.5 text-xs opacity-60">{counts.team}</span></TabsTrigger>
            <TabsTrigger value="customer">Customers <span className="ml-1.5 text-xs opacity-60">{counts.customer}</span></TabsTrigger>
            <TabsTrigger value="no_role">No role <span className="ml-1.5 text-xs opacity-60">{counts.no_role}</span></TabsTrigger>
            <TabsTrigger value="disabled">Disabled <span className="ml-1.5 text-xs opacity-60">{counts.disabled}</span></TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email or name…" className="pl-8" />
          </div>
          <div className="text-xs text-muted-foreground">{filtered.length} of {(users as any[]).length}</div>
        </div>
      </Card>

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <Card className="p-3 flex flex-wrap items-center gap-2 border-primary/40 bg-primary/5">
          <div className="text-sm font-medium">{selected.size} selected</div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline"><ShieldCheck className="h-4 w-4 mr-1" /> Assign role</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {APP_ROLES.map(r => (
                <DropdownMenuItem key={r} onClick={() => bulkRoleMut.mutate({ role: r, action: "add" })}>
                  <span className={cn("h-2 w-2 rounded-full mr-2", ROLE_DOT[r])} /> Add: {ROLE_LABEL[r]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              {APP_ROLES.map(r => (
                <DropdownMenuItem key={"rm-"+r} onClick={() => bulkRoleMut.mutate({ role: r, action: "remove" })}>
                  <span className={cn("h-2 w-2 rounded-full mr-2 opacity-50", ROLE_DOT[r])} /> Remove: {ROLE_LABEL[r]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="destructive" onClick={() => setConfirmBulkDel(true)}>
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </Card>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => {
                    const next = new Set(selected);
                    if (v) filtered.forEach(u => next.add(u.id));
                    else filtered.forEach(u => next.delete(u.id));
                    setSelected(next);
                  }}
                />
              </TableHead>
              <TableHead>
                <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("name")}>
                  User <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("last_sign_in")}>
                  Last sign-in <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>
                <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("created")}>
                  Created <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <UsersIcon className="h-8 w-8 opacity-40" />
                  <div className="text-sm">No users in this view.</div>
                </div>
              </TableCell></TableRow>
            ) : filtered.map((u) => {
              const disabled = u.banned_until && new Date(u.banned_until).getTime() > Date.now();
              const isSelected = selected.has(u.id);
              return (
                <TableRow key={u.id} className={cn(isSelected && "bg-accent/40")}>
                  <TableCell>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(v) => {
                        const next = new Set(selected);
                        if (v) next.add(u.id); else next.delete(u.id);
                        setSelected(next);
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <button className="flex items-center gap-3 text-left hover:opacity-80" onClick={() => setDetailUser(u)}>
                      <div className={cn(
                        "h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold text-primary-foreground",
                        "bg-gradient-to-br from-primary to-primary/60"
                      )}>
                        {initials(u.display_name ?? u.email)}
                      </div>
                      <div>
                        <div className="text-sm font-medium leading-tight">{u.display_name ?? <span className="text-muted-foreground italic">No name</span>}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </div>
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[260px]">
                      {u.roles.length === 0 ? <Badge variant="outline" className="text-muted-foreground">No role</Badge> :
                        u.roles.map((r: AppRole) => (
                          <Badge key={r} variant="secondary" className="gap-1.5 font-normal">
                            <span className={cn("h-1.5 w-1.5 rounded-full", ROLE_DOT[r])} />
                            {ROLE_LABEL[r] ?? r}
                          </Badge>
                        ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {disabled ? (
                      <Badge variant="destructive" className="gap-1"><Ban className="h-3 w-3" /> Disabled</Badge>
                    ) : u.last_sign_in_at ? (
                      <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-amber-700 dark:text-amber-400 border-amber-500/40">
                        <Mail className="h-3 w-3" /> Invited
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "Never"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="text-xs text-muted-foreground">{u.email}</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => setDetailUser(u)}>
                          <UserCog className="h-4 w-4 mr-2" /> View details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditUser(u)}>
                          <ShieldCheck className="h-4 w-4 mr-2" /> Edit permissions
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setPwUser(u)}>
                          <KeyRound className="h-4 w-4 mr-2" /> Set password
                        </DropdownMenuItem>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <LinkIcon className="h-4 w-4 mr-2" /> Generate link
                          </DropdownMenuSubTrigger>
                          <DropdownMenuPortal>
                            <DropdownMenuSubContent>
                              <DropdownMenuItem onClick={() => copyLink(u.email, "recovery")}>Password reset link</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => copyLink(u.email, "magiclink")}>Magic sign-in link</DropdownMenuItem>
                            </DropdownMenuSubContent>
                          </DropdownMenuPortal>
                        </DropdownMenuSub>
                        <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(u.email); toast.success("Email copied"); }}>
                          <Copy className="h-4 w-4 mr-2" /> Copy email
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {disabled ? (
                          <DropdownMenuItem onClick={() => banMut.mutate({ userId: u.id, ban: false })}>
                            <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" /> Enable account
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => banMut.mutate({ userId: u.id, ban: true })}>
                            <Ban className="h-4 w-4 mr-2 text-amber-600" /> Disable account
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setConfirmDel(u)}>
                          <Trash2 className="h-4 w-4 mr-2" /> Delete user
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={invalidate}
      />
      {editUser && (
        <EditUserDialog
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => { invalidate(); }}
        />
      )}
      {pwUser && <PasswordDialog user={pwUser} onClose={() => setPwUser(null)} />}
      {detailUser && (
        <UserDetailSheet
          user={detailUser}
          onClose={() => setDetailUser(null)}
          onChanged={invalidate}
          onEdit={() => { setEditUser(detailUser); setDetailUser(null); }}
          onPassword={() => { setPwUser(detailUser); setDetailUser(null); }}
        />
      )}

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{confirmDel?.email}</strong> permanently delete hobe. Auth account ar roles sob remove hobe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => confirmDel && deleteMut.mutate({ userId: confirmDel.id })}>
              Yes, delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmBulkDel} onOpenChange={setConfirmBulkDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} users?</AlertDialogTitle>
            <AlertDialogDescription>
              Apnar own account skip hobe. Baki sob permanently delete hobe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => bulkDelMut.mutate()}>
              Yes, delete all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}<span>{label}</span></div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </Card>
  );
}

/* =================== Sub-components =================== */

function CreateUserDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const fn = useServerFn(createAppUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roles, setRoles] = useState<AppRole[]>([]);

  const reset = () => { setEmail(""); setPassword(""); setDisplayName(""); setRoles([]); };

  const mut = useMutation({
    mutationFn: () => fn({ data: { email, password, displayName: displayName || undefined, roles } }),
    onSuccess: () => { toast.success("User created"); onCreated(); onClose(); reset(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const toggleRole = (r: AppRole) => setRoles(c => c.includes(r) ? c.filter(x => x !== r) : [...c, r]);
  const applyPreset = (preset: AppRole[]) => setRoles(preset);
  const genPassword = () => {
    const s = Math.random().toString(36).slice(2, 10) + "A1!";
    setPassword(s); toast.success("Password generated");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add new user</DialogTitle>
          <DialogDescription>Account create korun ar roles assign korun.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email *</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@company.com" />
            </div>
            <div>
              <Label>Password *</Label>
              <div className="flex gap-1">
                <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 chars" />
                <Button type="button" variant="outline" size="sm" onClick={genPassword}>Gen</Button>
              </div>
            </div>
          </div>
          <div>
            <Label>Display name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label>Roles</Label>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => applyPreset(["admin"])}>Admin</Button>
                <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => applyPreset(["operations","warehouse_staff"])}>Ops+WH</Button>
                <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setRoles([])}>Clear</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {APP_ROLES.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm cursor-pointer rounded-md border border-border p-2 hover:bg-accent">
                  <Checkbox checked={roles.includes(r)} onCheckedChange={() => toggleRole(r)} />
                  <span className={cn("h-2 w-2 rounded-full", ROLE_DOT[r])} />
                  <span>{ROLE_LABEL[r]}</span>
                </label>
              ))}
            </div>
          </div>
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

function EditUserDialog({ user, onClose, onSaved }: { user: any; onClose: () => void; onSaved: () => void }) {
  const rolesFn = useServerFn(updateUserRoles);

  const [roles, setRoles] = useState<AppRole[]>(user.roles);

  const mut = useMutation({
    mutationFn: async () => {
      await rolesFn({ data: { userId: user.id, roles } });
    },
    onSuccess: () => { toast.success("Saved"); onSaved(); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const toggleRole = (r: AppRole) => setRoles(c => c.includes(r) ? c.filter(x => x !== r) : [...c, r]);

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
                  <span className={cn("h-2 w-2 rounded-full", ROLE_DOT[r])} />
                  <span>{ROLE_LABEL[r]}</span>
                </label>
              ))}
            </div>
          </div>
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
  const gen = () => setPassword(Math.random().toString(36).slice(2, 10) + "A1!");
  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Set new password</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>New password</Label>
          <div className="flex gap-1">
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 chars" />
            <Button type="button" variant="outline" onClick={gen}>Gen</Button>
          </div>
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

function UserDetailSheet({ user, onClose, onChanged, onEdit, onPassword }: {
  user: any; onClose: () => void; onChanged: () => void; onEdit: () => void; onPassword: () => void;
}) {
  const profileFn = useServerFn(updateUserProfile);
  const [displayName, setDisplayName] = useState(user.display_name ?? "");
  const [savingName, setSavingName] = useState(false);

  const disabled = user.banned_until && new Date(user.banned_until).getTime() > Date.now();

  const saveName = async () => {
    try {
      setSavingName(true);
      await profileFn({ data: { userId: user.id, displayName } });
      toast.success("Profile updated"); onChanged();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setSavingName(false); }
  };

  return (
    <Sheet open={true} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>User details</SheetTitle>
          <SheetDescription>{user.email}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center text-lg font-semibold">
              {initials(user.display_name ?? user.email)}
            </div>
            <div>
              <div className="font-medium">{user.display_name ?? "—"}</div>
              <div className="text-sm text-muted-foreground">{user.email}</div>
              <div className="mt-1 flex gap-1">
                {disabled
                  ? <Badge variant="destructive">Disabled</Badge>
                  : user.last_sign_in_at
                    ? <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400">Active</Badge>
                    : <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">Invited</Badge>}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Display name</Label>
            <div className="flex gap-2">
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              <Button onClick={saveName} disabled={savingName}>{savingName ? "…" : "Save"}</Button>
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1.5">Roles</div>
            <div className="flex flex-wrap gap-1">
              {user.roles.length === 0 ? <Badge variant="outline">No role</Badge> :
                user.roles.map((r: AppRole) => (
                  <Badge key={r} variant="secondary" className="gap-1.5">
                    <span className={cn("h-1.5 w-1.5 rounded-full", ROLE_DOT[r])} />
                    {ROLE_LABEL[r] ?? r}
                  </Badge>
                ))}
            </div>
          </div>


          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Created</div>
              <div>{user.created_at ? new Date(user.created_at).toLocaleString() : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Last sign-in</div>
              <div>{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "Never"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Email confirmed</div>
              <div>{user.email_confirmed_at ? "Yes" : "No"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">User ID</div>
              <button className="text-xs font-mono truncate hover:text-foreground" title={user.id}
                onClick={() => { navigator.clipboard.writeText(user.id); toast.success("ID copied"); }}>
                {user.id.slice(0, 8)}… <Copy className="inline h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button size="sm" variant="outline" onClick={onEdit}><ShieldCheck className="h-4 w-4 mr-1" /> Edit roles</Button>
            <Button size="sm" variant="outline" onClick={onPassword}><KeyRound className="h-4 w-4 mr-1" /> Password</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}