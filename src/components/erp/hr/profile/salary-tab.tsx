import { useState, useMemo } from "react";
import { Lock, Save } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateSalaryStructure } from "@/lib/erp/hr/profile.functions";

interface Props {
  employeeId: string;
  initial: any;
  canEdit: boolean;
  canView: boolean;
}

const ALLOW_KEYS = ["house", "transport", "medical", "other"] as const;
const DEDUCT_KEYS = ["pf", "tax", "loan", "other"] as const;

export function SalaryTab({ employeeId, initial, canEdit, canView }: Props) {
  if (!canView) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          <Lock className="h-6 w-6 mx-auto mb-2 opacity-60" /> Salary information is restricted to admin and operations roles.
        </CardContent>
      </Card>
    );
  }
  const s = initial.salary_structure ?? {};
  const [gross, setGross] = useState(Number(initial.gross_salary ?? 0));
  const [basic, setBasic] = useState(Number(s.basic ?? 0));
  const [allow, setAllow] = useState<Record<string, number>>({
    house: Number(s.allowances?.house ?? 0),
    transport: Number(s.allowances?.transport ?? 0),
    medical: Number(s.allowances?.medical ?? 0),
    other: Number(s.allowances?.other ?? 0),
  });
  const [deduct, setDeduct] = useState<Record<string, number>>({
    pf: Number(s.deductions?.pf ?? 0),
    tax: Number(s.deductions?.tax ?? 0),
    loan: Number(s.deductions?.loan ?? 0),
    other: Number(s.deductions?.other ?? 0),
  });

  const allowSum = useMemo(() => Object.values(allow).reduce((a, b) => a + (b || 0), 0), [allow]);
  const deductSum = useMemo(() => Object.values(deduct).reduce((a, b) => a + (b || 0), 0), [deduct]);
  const computedGross = basic + allowSum;
  const net = computedGross - deductSum;

  const qc = useQueryClient();
  const fn = useServerFn(updateSalaryStructure);
  const mut = useMutation({
    mutationFn: () => fn({
      data: {
        id: employeeId,
        gross_salary: gross || computedGross,
        salary_structure: { basic, allowances: allow, deductions: deduct },
      },
    }),
    onSuccess: () => {
      toast.success("Salary updated");
      qc.invalidateQueries({ queryKey: ["hr-employee", employeeId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const FieldGrid = ({ obj, set, keys, label }: { obj: Record<string,number>; set: (v:Record<string,number>)=>void; keys: readonly string[]; label: string }) => (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="text-sm font-semibold">{label}</div>
        <div className="grid grid-cols-2 gap-3">
          {keys.map((k) => (
            <div key={k}>
              <Label className="capitalize text-xs">{k}</Label>
              <Input
                type="number"
                value={obj[k] ?? 0}
                disabled={!canEdit}
                onChange={(e) => set({ ...obj, [k]: Number(e.target.value) || 0 })}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Basic Salary</Label>
            <Input type="number" value={basic} disabled={!canEdit} onChange={(e) => setBasic(Number(e.target.value) || 0)} />
          </div>
          <div>
            <Label className="text-xs">Stored Gross (override)</Label>
            <Input type="number" value={gross} disabled={!canEdit} onChange={(e) => setGross(Number(e.target.value) || 0)} />
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-2">
            <div className="rounded bg-muted p-2 text-center"><div className="text-xs text-muted-foreground">Gross</div><div className="font-bold">৳{computedGross.toLocaleString("en-BD")}</div></div>
            <div className="rounded bg-primary/10 p-2 text-center"><div className="text-xs text-muted-foreground">Net Pay</div><div className="font-bold text-primary">৳{net.toLocaleString("en-BD")}</div></div>
          </div>
        </CardContent>
      </Card>
      <div className="grid md:grid-cols-2 gap-4">
        <FieldGrid obj={allow} set={setAllow} keys={ALLOW_KEYS} label={`Allowances (৳${allowSum.toLocaleString("en-BD")})`} />
        <FieldGrid obj={deduct} set={setDeduct} keys={DEDUCT_KEYS} label={`Deductions (৳${deductSum.toLocaleString("en-BD")})`} />
      </div>
      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            <Save className="h-4 w-4 mr-1.5" /> Save Salary
          </Button>
        </div>
      )}
    </div>
  );
}