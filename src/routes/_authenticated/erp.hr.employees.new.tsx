import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { EmployeeForm } from "@/components/erp/hr/employee-form";
import { createEmployee } from "@/lib/erp/hr/hr.functions";

export const Route = createFileRoute("/_authenticated/erp/hr/employees/new")({
  head: () => ({ meta: [{ title: "New Employee — HR" }] }),
  component: NewEmployee,
});

function NewEmployee() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createEmployee);
  const mut = useMutation({
    mutationFn: (data: any) => createFn({ data }),
    onSuccess: (row) => {
      toast.success("Employee created");
      qc.invalidateQueries({ queryKey: ["hr-employees"] });
      qc.invalidateQueries({ queryKey: ["hr-kpis"] });
      navigate({ to: "/erp/hr/employees/$id", params: { id: row.id } });
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });

  return (
    <div>
      <HrSubnav />
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        <Link to="/erp/hr/employees" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to employees
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">New Employee</h1>
        <EmployeeForm
          onSubmit={async (d) => { await mut.mutateAsync(d); }}
          submitting={mut.isPending}
          submitLabel="Create Employee"
        />
      </div>
    </div>
  );
}