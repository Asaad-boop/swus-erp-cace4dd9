import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Phone, Mail, Calendar, Briefcase, Building2, MapPin, UserCircle2, IdCard } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HrPageShell } from "@/components/erp/hr/ui/hr-page-shell";
import { EmployeeForm } from "@/components/erp/hr/employee-form";
import { getEmployee, updateEmployee, deleteEmployee } from "@/lib/erp/hr/hr.functions";
import { useHrAccess } from "@/lib/erp/hr/role-gate";
import { PhotoUpload } from "@/components/erp/hr/profile/photo-upload";
import { SalaryTab } from "@/components/erp/hr/profile/salary-tab";
import { DocumentsTab } from "@/components/erp/hr/profile/documents-tab";
import { HistoryTab } from "@/components/erp/hr/profile/history-tab";
import {
  AttendanceSummaryTab,
  LeaveSummaryTab,
} from "@/components/erp/hr/profile/summary-tabs";
import { StatusPill, type StatusTone } from "@/components/erp/hr/ui/status-pill";

const STATUS_TONE: Record<string, StatusTone> = {
  active: "active", probation: "pending", on_leave: "leave",
  suspended: "late", terminated: "absent", resigned: "inactive", retired: "inactive",
};

export const Route = createFileRoute("/_authenticated/erp/hr/employees/$id")({
  head: () => ({ meta: [{ title: "Employee — HR" }] }),
  component: EmployeeDetail,
});

function EmployeeDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const access = useHrAccess();
  const getFn = useServerFn(getEmployee);
  const updateFn = useServerFn(updateEmployee);
  const delFn = useServerFn(deleteEmployee);

  const { data, isLoading } = useQuery({
    queryKey: ["hr-employee", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const mut = useMutation({
    mutationFn: (d: any) => updateFn({ data: { ...d, id } }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["hr-employee", id] });
      qc.invalidateQueries({ queryKey: ["hr-employees"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: () => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      navigate({ to: "/erp/hr/employees" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <HrPageShell eyebrow="People · Directory" title="Loading…" breadcrumbs={[{ label: "HR" }, { label: "Employees" }]}>
        <div className="text-sm text-[color:var(--hr-text-muted)]">Loading employee…</div>
      </HrPageShell>
    );
  }
  if (!data) {
    return (
      <HrPageShell eyebrow="People · Directory" title="Not found" breadcrumbs={[{ label: "HR" }, { label: "Employees" }]}>
        <div className="text-sm text-[color:var(--hr-text-muted)]">This employee could not be found.</div>
      </HrPageShell>
    );
  }
  if (!access.canAccess && !access.isLoading) {
    return (
      <HrPageShell eyebrow="People · Directory" title="Access denied" breadcrumbs={[{ label: "HR" }, { label: "Employees" }]}>
        <div className="text-sm text-[color:var(--hr-text-muted)]">You don't have access to HR.</div>
      </HrPageShell>
    );
  }
  const e = data.employee;
  const tone = STATUS_TONE[e.status] ?? "neutral";
  const dept = (e as any).department?.name as string | undefined;
  const desig = (e as any).designation?.title as string | undefined;

  const facts: Array<{ icon: typeof IdCard; label: string; value?: string | null }> = [
    { icon: Briefcase, label: "Designation", value: desig },
    { icon: Building2, label: "Department", value: dept },
    { icon: MapPin, label: "Work location", value: e.work_location },
    { icon: UserCircle2, label: "Employment", value: e.employment_type?.replace("_", " ") },
  ];

  return (
    <HrPageShell
      eyebrow="People · Employee profile"
      title={e.full_name}
      subtitle={[desig, dept].filter(Boolean).join(" · ") || "Employee profile and records"}
      breadcrumbs={[
        { label: "HR" },
        { label: "Employees", to: "/erp/hr/employees" },
        { label: e.full_name },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Link to="/erp/hr/employees">
            <Button variant="outline" size="sm" className="rounded-lg">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
          </Link>
          {access.canDelete && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-[color:var(--hr-absent)] hover:text-[color:var(--hr-absent)] hover:bg-[color:var(--hr-absent)]/10 border-[color:var(--hr-absent)]/30"
              onClick={() => { if (confirm(`Delete ${e.full_name}?`)) delMut.mutate(); }}
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Delete
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Hero identity card */}
        <div className="relative overflow-hidden rounded-2xl ring-1 ring-[color:var(--hr-border)] bg-[color:var(--hr-surface-elevated)] shadow-[var(--shadow-hr-card)]">
          <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full blur-3xl opacity-60 bg-[color:var(--hr-accent-soft)]" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full blur-3xl opacity-40 bg-[color:var(--hr-accent-soft)]" />
          <div className="relative p-6 md:p-7 flex flex-col md:flex-row md:items-center gap-6">
            <div className="ring-4 ring-[color:var(--hr-surface-elevated)] rounded-full shadow-[var(--shadow-hr-card)]">
              <PhotoUpload
                employeeId={e.id}
                currentUrl={e.photo_url}
                fullName={e.full_name}
                canEdit={access.canManageEmployees}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-[color:var(--hr-text-strong)] truncate">
                  {e.full_name}
                </h1>
                <Badge variant="outline" className="font-mono text-[11px] rounded-md border-[color:var(--hr-border)] text-[color:var(--hr-text-muted)]">
                  <IdCard className="h-3 w-3 mr-1" /> {e.employee_code}
                </Badge>
                <StatusPill tone={tone} dot>{e.status.replace("_"," ")}</StatusPill>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[color:var(--hr-text-muted)]">
                {e.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{e.phone}</span>}
                {e.email && <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{e.email}</span>}
                <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Joined {e.joining_date}</span>
              </div>

              {facts.some((f) => f.value) && (
                <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {facts.filter((f) => f.value).map((f) => (
                    <div
                      key={f.label}
                      className="rounded-xl px-3 py-2.5 bg-[color:var(--hr-surface)] ring-1 ring-[color:var(--hr-border)]"
                    >
                      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--hr-text-muted)]">
                        <f.icon className="h-3 w-3" /> {f.label}
                      </div>
                      <div className="mt-1 text-sm font-medium text-[color:var(--hr-text-strong)] truncate capitalize">
                        {f.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <Tabs defaultValue="profile">
          <div className="sticky top-[64px] z-10 -mx-2 px-2 py-2 bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
            <TabsList className="flex-wrap h-auto bg-[color:var(--hr-surface-elevated)] border border-[color:var(--hr-border)] rounded-xl p-1 shadow-[var(--shadow-hr-card)]">
              {[
                ["profile", "Profile"],
                ["employment", "Employment"],
                ["salary", "Salary"],
                ["documents", "Documents"],
                ["history", "History"],
                ["attendance", "Attendance"],
                ["leave", "Leave"],
              ].map(([v, l]) => (
                <TabsTrigger
                  key={v}
                  value={v}
                  className="rounded-lg text-[color:var(--hr-text-muted)] data-[state=active]:bg-[color:var(--hr-accent)] data-[state=active]:text-white data-[state=active]:shadow-sm"
                >
                  {l}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="profile" className="mt-5">
            <EmployeeForm initial={e} onSubmit={async (d) => { await mut.mutateAsync(d); }} submitting={mut.isPending} submitLabel="Save Changes" />
          </TabsContent>
          <TabsContent value="employment" className="mt-5">
            <EmployeeForm initial={e} onSubmit={async (d) => { await mut.mutateAsync(d); }} submitting={mut.isPending} submitLabel="Save Changes" />
          </TabsContent>
          <TabsContent value="salary" className="mt-5">
            <SalaryTab employeeId={e.id} initial={e} canEdit={access.canSeeSalary} canView={access.canSeeSalary} />
          </TabsContent>
          <TabsContent value="documents" className="mt-5">
            <DocumentsTab employeeId={e.id} canEdit={access.canManageDocuments} />
          </TabsContent>
          <TabsContent value="history" className="mt-5">
            <HistoryTab employeeId={e.id} canEdit={access.canManageEmployees} />
          </TabsContent>
          <TabsContent value="attendance" className="mt-5">
            <AttendanceSummaryTab employeeId={e.id} />
          </TabsContent>
          <TabsContent value="leave" className="mt-5">
            <LeaveSummaryTab employeeId={e.id} />
          </TabsContent>
        </Tabs>
      </div>
    </HrPageShell>
  );
}