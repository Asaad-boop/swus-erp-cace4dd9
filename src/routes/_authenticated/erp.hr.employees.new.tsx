import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HrPageShell } from "@/components/erp/hr/ui/hr-page-shell";
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
    <HrPageShell
      eyebrow="People · Directory"
      title="New Employee"
      subtitle="Add a person to the directory — only Full name and Joining date are required."
      breadcrumbs={[
        { label: "HR" },
        { label: "Employees" },
        { label: "New" },
      ]}
      actions={
        <Link to="/erp/hr/employees">
          <Button variant="outline" size="sm" className="rounded-lg">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
        </Link>
      }
    >
      <div className="max-w-5xl">
        <EmployeeForm
          onSubmit={async (d) => { await mut.mutateAsync(d); }}
          submitting={mut.isPending}
          submitLabel="Create Employee"
        />
      </div>
    </HrPageShell>
  );
}