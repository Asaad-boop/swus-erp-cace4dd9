import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Phone, Mail, Calendar } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
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

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-6">Not found</div>;
  if (!access.canAccess && !access.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">You don't have access to HR.</div>;
  }
  const e = data.employee;

  return (
    <div>
      <HrSubnav />
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
        <Link to="/erp/hr/employees" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to employees
        </Link>

        <Card>
          <CardContent className="p-5 flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4">
              <PhotoUpload
                employeeId={e.id}
                currentUrl={e.photo_url}
                fullName={e.full_name}
                canEdit={access.canManageEmployees}
              />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold">{e.full_name}</h1>
                  <Badge variant="outline" className="font-mono text-xs">{e.employee_code}</Badge>
                  <Badge>{e.status.replace("_"," ")}</Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm text-muted-foreground">
                  {e.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{e.phone}</span>}
                  {e.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{e.email}</span>}
                  <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Joined {e.joining_date}</span>
                </div>
              </div>
            </div>
            {access.canDelete && (
              <Button variant="outline" size="sm" onClick={() => {
                if (confirm(`Delete ${e.full_name}?`)) delMut.mutate();
              }}>
                <Trash2 className="h-4 w-4 mr-1.5" /> Delete
              </Button>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="profile">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="employment">Employment</TabsTrigger>
            <TabsTrigger value="salary">Salary</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="leave">Leave</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="mt-4">
            <EmployeeForm
              initial={e}
              onSubmit={async (d) => { await mut.mutateAsync(d); }}
              submitting={mut.isPending}
              submitLabel="Save Changes"
            />
          </TabsContent>
          <TabsContent value="employment" className="mt-4">
            <EmployeeForm
              initial={e}
              onSubmit={async (d) => { await mut.mutateAsync(d); }}
              submitting={mut.isPending}
              submitLabel="Save Changes"
            />
          </TabsContent>
          <TabsContent value="salary" className="mt-4">
            <SalaryTab
              employeeId={e.id}
              initial={e}
              canEdit={access.canSeeSalary}
              canView={access.canSeeSalary}
            />
          </TabsContent>
          <TabsContent value="documents" className="mt-4">
            <DocumentsTab employeeId={e.id} canEdit={access.canManageDocuments} />
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <HistoryTab employeeId={e.id} canEdit={access.canManageEmployees} />
          </TabsContent>
          <TabsContent value="attendance" className="mt-4">
            <AttendanceSummaryTab employeeId={e.id} />
          </TabsContent>
          <TabsContent value="leave" className="mt-4">
            <LeaveSummaryTab employeeId={e.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}