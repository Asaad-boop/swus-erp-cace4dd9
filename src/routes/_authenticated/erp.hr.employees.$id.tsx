import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Phone, Mail, Calendar, Briefcase, Building2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
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

  if (isLoading) return <div className="min-h-screen bg-background"><HrSubnav /><div className="p-8 text-[color:var(--hr-text-muted)]">Loading…</div></div>;
  if (!data) return <div className="min-h-screen bg-background"><HrSubnav /><div className="p-8">Not found</div></div>;
  if (!access.canAccess && !access.isLoading) {
    return <div className="min-h-screen bg-background"><HrSubnav /><div className="p-8 text-sm text-[color:var(--hr-text-muted)]">You don't have access to HR.</div></div>;
  }
  const e = data.employee;
  const tone = STATUS_TONE[e.status] ?? "neutral";

  return (
    <div className="min-h-screen bg-background">
      <HrSubnav />
      <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
        <Link to="/erp/hr/employees" className="inline-flex items-center gap-1.5 text-sm text-[color:var(--hr-text-muted)] hover:text-[color:var(--hr-text-strong)] transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to employees
        </Link>

        <div className="bg-white rounded-2xl border border-[color:var(--hr-border)] shadow-sm overflow-hidden">
          <div className="h-20 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" />
          <div className="px-6 pb-6 -mt-10 flex items-end justify-between gap-4 flex-wrap">
            <div className="flex items-end gap-4">
              <div className="ring-4 ring-white rounded-full">
                <PhotoUpload
                  employeeId={e.id}
                  currentUrl={e.photo_url}
                  fullName={e.full_name}
                  canEdit={access.canManageEmployees}
                />
              </div>
              <div className="pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-semibold text-[color:var(--hr-text-strong)] tracking-tight">{e.full_name}</h1>
                  <Badge variant="outline" className="font-mono text-xs rounded-md">{e.employee_code}</Badge>
                  <StatusPill tone={tone} dot>{e.status.replace("_"," ")}</StatusPill>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-[color:var(--hr-text-muted)]">
                  {e.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{e.phone}</span>}
                  {e.email && <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{e.email}</span>}
                  <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Joined {e.joining_date}</span>
                </div>
              </div>
            </div>
            {access.canDelete && (
              <Button variant="outline" size="sm" className="rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50 border-red-100" onClick={() => {
                if (confirm(`Delete ${e.full_name}?`)) delMut.mutate();
              }}>
                <Trash2 className="h-4 w-4 mr-1.5" /> Delete
              </Button>
            )}
          </div>
        </div>

        <Tabs defaultValue="profile">
          <div className="sticky top-[120px] z-10 bg-gray-50 -mx-2 px-2 py-1">
            <TabsList className="flex-wrap h-auto bg-white border border-[color:var(--hr-border)] rounded-xl p-1 shadow-sm">
              <TabsTrigger value="profile" className="rounded-lg data-[state=active]:bg-gray-900 data-[state=active]:text-white">Profile</TabsTrigger>
              <TabsTrigger value="employment" className="rounded-lg data-[state=active]:bg-gray-900 data-[state=active]:text-white">Employment</TabsTrigger>
              <TabsTrigger value="salary" className="rounded-lg data-[state=active]:bg-gray-900 data-[state=active]:text-white">Salary</TabsTrigger>
              <TabsTrigger value="documents" className="rounded-lg data-[state=active]:bg-gray-900 data-[state=active]:text-white">Documents</TabsTrigger>
              <TabsTrigger value="history" className="rounded-lg data-[state=active]:bg-gray-900 data-[state=active]:text-white">History</TabsTrigger>
              <TabsTrigger value="attendance" className="rounded-lg data-[state=active]:bg-gray-900 data-[state=active]:text-white">Attendance</TabsTrigger>
              <TabsTrigger value="leave" className="rounded-lg data-[state=active]:bg-gray-900 data-[state=active]:text-white">Leave</TabsTrigger>
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
    </div>
  );
}