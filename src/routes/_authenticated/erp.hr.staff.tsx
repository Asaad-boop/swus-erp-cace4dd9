import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Plus, Search, Trash2, KeyRound, ShieldCheck, Mail, MoreHorizontal,
  Download, Copy, Ban, CheckCircle2, Link as LinkIcon, UserCog, Users as UsersIcon,
  Activity, ArrowUpDown, RefreshCw, Sparkles, Building2, ChevronLeft, ChevronRight,
  Phone, User as UserIcon, AtSign, Filter,
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
import { listUserBrandAccess, setUserBrandAccess } from "@/lib/erp/settings/user-brand-access.functions";
import { useBrand } from "@/contexts/brand-context";

export const Route = createFileRoute("/_authenticated/erp/hr/staff")({
  head: () => ({ meta: [{ title: "Staff — HR" }] }),
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

const ROLE_DESC: Record<AppRole, string> = {
  admin: "Full system access — everything",
  operations: "Orders, dispatch, day-to-day operations",
  accountant: "Finance, ERP books, reports",
  warehouse_staff: "Inventory, stock, receiving",
  packer: "Pack & ship orders only",
  customer_service: "Customers, support, CRM",
  marketing_manager: "Campaigns, ads, marketing analytics",
  moderator: "Reviews, content moderation",
  customer: "End customer (no admin)",
};

type RolePreset = { id: string; label: string; description: string; roles: AppRole[]; icon: string };
const ROLE_PRESETS: RolePreset[] = [
  { id: "admin", label: "Administrator", description: "Full system control", roles: ["admin"], icon: "👑" },
  { id: "manager", label: "Operations Manager", description: "Orders + Finance overview", roles: ["operations", "accountant"], icon: "📊" },
  { id: "warehouse", label: "Warehouse Team", description: "Stock + Packing", roles: ["warehouse_staff", "packer"], icon: "📦" },
  { id: "packer", label: "Packer Only", description: "Pack & dispatch", roles: ["packer"], icon: "🏷️" },
  { id: "accountant", label: "Accountant", description: "Finance only", roles: ["accountant"], icon: "💰" },
  { id: "cs", label: "Customer Service", description: "Support & CRM", roles: ["customer_service"], icon: "🎧" },
  { id: "marketing", label: "Marketing Manager", description: "Campaigns & ads", roles: ["marketing_manager"], icon: "📣" },
  { id: "custom", label: "Custom", description: "Pick roles manually", roles: [], icon: "⚙️" },
];

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
  const [roleFilter, setRoleFilter] = useState<AppRole | "any">("any");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<any | null>(null);
  const [pwUser, setPwUser] = useState<any | null>(null);
  const [detailUser, setDetailUser] = useState<any | null>(null);
  const [confirmDel, setConfirmDel] = useState<any | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkDel, setConfirmBulkDel] = useState(false);

  // Keyboard shortcut: N to add new
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName)) return;
      if (e.key === "n" || e.key === "N") { e.preventDefault(); setCreateOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      if (roleFilter !== "any" && !u.roles.includes(roleFilter)) return false;
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
  }, [users, q, tab, roleFilter, sortKey, sortDir]);

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
          <p className="text-sm text-muted-foreground">Team members ar permission centrally manage korun. <kbd className="ml-1 px-1.5 py-0.5 text-[10px] bg-muted rounded border border-border">N</kbd> = new user</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4 mr-1", isFetching && "animate-spin")} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="shadow-sm">
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
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as any)}>
              <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Any role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any role</SelectItem>
                {APP_ROLES.map(r => (
                  <SelectItem key={r} value={r}>
                    <span className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", ROLE_DOT[r])} />
                      {ROLE_LABEL[r]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
  const linkFn = useServerFn(generateAuthLink);
  const { brands } = useBrand();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [preset, setPreset] = useState<string>("custom");

  const reset = () => {
    setEmail(""); setPassword(""); setDisplayName(""); setPhone("");
    setRoles([]); setBrandIds([]); setStep(1); setCreatedEmail(null); setMagicLink(null); setPreset("custom");
  };

  const mut = useMutation({
    mutationFn: () => fn({ data: {
      email, password, displayName: displayName || undefined,
      phone: phone || undefined, roles, brandIds,
    } }),
    onSuccess: async () => {
      toast.success("User created");
      onCreated();
      setCreatedEmail(email);
      try {
        const r: any = await linkFn({ data: { email, type: "magiclink" } });
        if (r?.url) setMagicLink(r.url);
      } catch {}
      setStep(4);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const toggleRole = (r: AppRole) => setRoles(c => c.includes(r) ? c.filter(x => x !== r) : [...c, r]);
  const toggleBrand = (b: string) => setBrandIds(c => c.includes(b) ? c.filter(x => x !== b) : [...c, b]);
  const genPassword = () => {
    const s = Math.random().toString(36).slice(2, 10) + "A1!";
    setPassword(s); toast.success("Password generated — copy save kore rakhun");
  };
  const applyPreset = (p: RolePreset) => {
    setPreset(p.id);
    if (p.id !== "custom") setRoles(p.roles);
  };

  const validStep1 = email.trim().length > 0 && /\S+@\S+\.\S+/.test(email) && password.length >= 6;
  const validStep2 = preset !== "custom" || roles.length > 0;

  const close = () => { onClose(); setTimeout(reset, 200); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Add new user
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Step 1 of 3 — Account details"}
            {step === 2 && "Step 2 of 3 — Role & permissions"}
            {step === 3 && "Step 3 of 3 — Brand access"}
            {step === 4 && "Done — share the invite link"}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        {step < 4 && (
          <div className="flex items-center gap-2 mb-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex items-center flex-1">
                <div className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all",
                  step === n ? "bg-primary text-primary-foreground ring-4 ring-primary/20" :
                  step > n ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                )}>
                  {step > n ? <CheckCircle2 className="h-4 w-4" /> : n}
                </div>
                {n < 3 && <div className={cn("h-0.5 flex-1 mx-1.5", step > n ? "bg-emerald-500" : "bg-muted")} />}
              </div>
            ))}
          </div>
        )}

        {/* STEP 1 — profile */}
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-2">
            <div>
              <Label className="flex items-center gap-1.5"><AtSign className="h-3.5 w-3.5" /> Email *</Label>
              <Input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@company.com" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="flex items-center gap-1.5"><UserIcon className="h-3.5 w-3.5" /> Display name</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <Label className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+8801..." />
              </div>
            </div>
            <div>
              <Label className="flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> Password *</Label>
              <div className="flex gap-1">
                <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 chars" />
                <Button type="button" variant="outline" onClick={genPassword}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" /> Gen
                </Button>
              </div>
              {password && password.length < 6 && <p className="text-xs text-amber-600 mt-1">At least 6 characters</p>}
            </div>
          </div>
        )}

        {/* STEP 2 — roles via preset */}
        {step === 2 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-2">
            <div>
              <Label className="mb-2 block">Quick role preset</Label>
              <div className="grid grid-cols-2 gap-2">
                {ROLE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={cn(
                      "text-left rounded-lg border-2 p-3 transition-all hover:border-primary/60 hover:bg-accent/40",
                      preset === p.id ? "border-primary bg-primary/5 shadow-sm" : "border-border"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{p.icon}</span>
                      <span className="font-medium text-sm">{p.label}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>
                    {p.roles.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {p.roles.map(r => (
                          <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {ROLE_LABEL[r]}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
            {preset === "custom" && (
              <div className="border-t pt-3">
                <Label className="mb-2 block">Custom roles ({roles.length} selected)</Label>
                <div className="grid grid-cols-2 gap-2 max-h-[260px] overflow-y-auto">
                  {APP_ROLES.map((r) => (
                    <label key={r} className={cn(
                      "flex items-start gap-2 text-sm cursor-pointer rounded-md border p-2.5 transition hover:bg-accent",
                      roles.includes(r) ? "border-primary/60 bg-primary/5" : "border-border"
                    )}>
                      <Checkbox checked={roles.includes(r)} onCheckedChange={() => toggleRole(r)} className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span className={cn("h-2 w-2 rounded-full", ROLE_DOT[r])} />
                          {ROLE_LABEL[r]}
                        </div>
                        <div className="text-[11px] text-muted-foreground leading-tight">{ROLE_DESC[r]}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {preset !== "custom" && roles.length > 0 && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <div className="text-xs text-muted-foreground mb-1">Assigned roles:</div>
                <div className="flex flex-wrap gap-1.5">
                  {roles.map(r => (
                    <Badge key={r} variant="secondary" className="gap-1.5">
                      <span className={cn("h-1.5 w-1.5 rounded-full", ROLE_DOT[r])} />
                      {ROLE_LABEL[r]}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3 — brand access */}
        {step === 3 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-2">
            <div>
              <Label className="flex items-center gap-1.5 mb-2"><Building2 className="h-3.5 w-3.5" /> Brand access</Label>
              <p className="text-xs text-muted-foreground mb-3">
                User shudhu ei brand(s) er data dekhte parbe. Kichu select na korle <strong>all brands</strong> access pabe (admin-style).
              </p>
              {brands.length === 0 ? (
                <div className="text-sm text-muted-foreground italic p-4 text-center border rounded-md">No brands configured</div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  <div className="flex gap-2 mb-2">
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setBrandIds(brands.map(b => b.id))}>Select all</Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setBrandIds([])}>Clear (all access)</Button>
                  </div>
                  {brands.map((b) => (
                    <label key={b.id} className={cn(
                      "flex items-center gap-3 cursor-pointer rounded-md border p-2.5 transition hover:bg-accent",
                      brandIds.includes(b.id) ? "border-primary/60 bg-primary/5" : "border-border"
                    )}>
                      <Checkbox checked={brandIds.includes(b.id)} onCheckedChange={() => toggleBrand(b.id)} />
                      {b.logo_url ? (
                        <img src={b.logo_url} alt="" className="h-7 w-7 rounded object-cover" />
                      ) : (
                        <div className="h-7 w-7 rounded bg-muted flex items-center justify-center text-xs font-medium">
                          {b.name[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{b.name}</div>
                        <div className="text-[11px] text-muted-foreground">{b.slug}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 4 — done */}
        {step === 4 && (
          <div className="space-y-4 text-center py-4 animate-in fade-in zoom-in-95">
            <div className="h-16 w-16 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-500" />
            </div>
            <div>
              <div className="text-lg font-semibold">User created!</div>
              <div className="text-sm text-muted-foreground">{createdEmail}</div>
            </div>
            {magicLink && (
              <div className="text-left rounded-md border bg-muted/40 p-3">
                <Label className="text-xs">Magic sign-in link (one-time)</Label>
                <div className="flex gap-1 mt-1">
                  <Input readOnly value={magicLink} className="font-mono text-xs" />
                  <Button type="button" variant="outline" onClick={() => {
                    navigator.clipboard.writeText(magicLink); toast.success("Link copied");
                  }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">Share this with user to sign in without password.</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 1 && (
            <>
              <Button variant="ghost" onClick={close}>Cancel</Button>
              <Button onClick={() => setStep(2)} disabled={!validStep1}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="ghost" onClick={() => setStep(1)}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={() => setStep(3)} disabled={!validStep2}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}
          {step === 3 && (
            <>
              <Button variant="ghost" onClick={() => setStep(2)}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
                {mut.isPending ? "Creating…" : (<><Sparkles className="h-4 w-4 mr-1" /> Create user</>)}
              </Button>
            </>
          )}
          {step === 4 && (
            <Button onClick={close} className="w-full">Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, onClose, onSaved }: { user: any; onClose: () => void; onSaved: () => void }) {
  const rolesFn = useServerFn(updateUserRoles);
  const listBrandsFn = useServerFn(listUserBrandAccess);
  const setBrandsFn = useServerFn(setUserBrandAccess);
  const { brands } = useBrand();

  const [roles, setRoles] = useState<AppRole[]>(user.roles);
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [tab, setTab] = useState<"roles" | "brands">("roles");

  const { data: allAccess } = useQuery({
    queryKey: ["user-brand-access"],
    queryFn: () => listBrandsFn({ data: undefined as any }),
  });

  useEffect(() => {
    if (allAccess) setBrandIds(allAccess[user.id] ?? []);
  }, [allAccess, user.id]);

  const mut = useMutation({
    mutationFn: async () => {
      await rolesFn({ data: { userId: user.id, roles } });
      await setBrandsFn({ data: { userId: user.id, brandIds } });
    },
    onSuccess: () => { toast.success("Saved"); onSaved(); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const toggleRole = (r: AppRole) => setRoles(c => c.includes(r) ? c.filter(x => x !== r) : [...c, r]);
  const toggleBrand = (b: string) => setBrandIds(c => c.includes(b) ? c.filter(x => x !== b) : [...c, b]);

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit permissions</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid grid-cols-2 mb-3">
            <TabsTrigger value="roles"><ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Roles ({roles.length})</TabsTrigger>
            <TabsTrigger value="brands"><Building2 className="h-3.5 w-3.5 mr-1.5" /> Brands ({brandIds.length || "all"})</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === "roles" ? (
          <div className="space-y-3">
            <div className="flex gap-1 flex-wrap">
              {ROLE_PRESETS.filter(p => p.id !== "custom").map(p => (
                <Button key={p.id} type="button" size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => setRoles(p.roles)}>
                  {p.icon} {p.label}
                </Button>
              ))}
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setRoles([])}>Clear</Button>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-[320px] overflow-y-auto">
              {APP_ROLES.map((r) => (
                <label key={r} className={cn(
                  "flex items-start gap-2 text-sm cursor-pointer rounded-md border p-2.5 transition hover:bg-accent",
                  roles.includes(r) ? "border-primary/60 bg-primary/5" : "border-border"
                )}>
                  <Checkbox checked={roles.includes(r)} onCheckedChange={() => toggleRole(r)} className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 font-medium">
                      <span className={cn("h-2 w-2 rounded-full", ROLE_DOT[r])} />
                      {ROLE_LABEL[r]}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{ROLE_DESC[r]}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Empty selection = all brands access. Specific brand select korle user shudhu oi brand(s) e access pabe.
            </p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setBrandIds(brands.map(b => b.id))}>Select all</Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setBrandIds([])}>Clear (all access)</Button>
            </div>
            <div className="space-y-2 max-h-[320px] overflow-y-auto">
              {brands.length === 0 ? (
                <div className="text-sm text-muted-foreground italic p-4 text-center border rounded-md">No brands configured</div>
              ) : brands.map((b) => (
                <label key={b.id} className={cn(
                  "flex items-center gap-3 cursor-pointer rounded-md border p-2.5 transition hover:bg-accent",
                  brandIds.includes(b.id) ? "border-primary/60 bg-primary/5" : "border-border"
                )}>
                  <Checkbox checked={brandIds.includes(b.id)} onCheckedChange={() => toggleBrand(b.id)} />
                  {b.logo_url ? (
                    <img src={b.logo_url} alt="" className="h-7 w-7 rounded object-cover" />
                  ) : (
                    <div className="h-7 w-7 rounded bg-muted flex items-center justify-center text-xs font-medium">
                      {b.name[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{b.name}</div>
                    <div className="text-[11px] text-muted-foreground">{b.slug}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
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