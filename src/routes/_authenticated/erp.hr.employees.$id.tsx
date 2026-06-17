import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Phone, Mail, Building2, BadgeCheck, Calendar } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { EmployeeForm } from "@/components/erp/hr/employee-form";
import { getEmployee, updateEmployee, deleteEmployee } from "@/lib/erp/hr/hr.functions";

export const Route = createFileRoute("/_authenticated/erp/hr/employees/$id")({
  head: () => ({ meta: [{ title: "Employee — HR" }] }),
  component: EmployeeDetail,
});

function EmployeeDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
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
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                {e.full_name.charAt(0).toUpperCase()}
              </div>
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
            <Button variant="outline" size="sm" onClick={() => {
              if (confirm(`Delete ${e.full_name}?`)) delMut.mutate();
            }}>
              <Trash2 className="h-4 w-4 mr-1.5" /> Delete
            </Button>
          </CardContent>
        </Card>

        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="history">History ({data.history.length})</TabsTrigger>
            <TabsTrigger value="documents">Documents ({data.documents.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="mt-4">
            <EmployeeForm
              initial={e}
              onSubmit={async (d) => { await mut.mutateAsync(d); }}
              submitting={mut.isPending}
              submitLabel="Save Changes"
            />
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <Card>
              <CardContent className="p-5">
                {data.history.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No history events.</div>
                ) : (
                  <ul className="space-y-3">
                    {data.history.map((h: any) => (
                      <li key={h.id} className="border-l-2 border-primary/40 pl-3 py-1">
                        <div className="text-sm font-medium capitalize">{h.event_type.replace("_"," ")}</div>
                        <div className="text-xs text-muted-foreground">{h.event_date}</div>
                        {h.from_value && <div className="text-xs">From: <code>{JSON.stringify(h.from_value)}</code></div>}
                        {h.to_value && <div className="text-xs">To: <code>{JSON.stringify(h.to_value)}</code></div>}
                        {h.notes && <div className="text-sm mt-1">{h.notes}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="documents" className="mt-4">
            <Card>
              <CardContent className="p-5 text-sm text-muted-foreground">
                Document management aschhe upcoming phase-e.
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}