import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  User as UserIcon, ShieldCheck, Briefcase, ArrowLeft, ArrowRight, Check, Loader2, Sparkles,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { APP_ROLES, type AppRole } from "@/lib/erp/users.functions";
import { createPerson } from "@/lib/erp/hr/person.functions";
import { listDepartments, listDesignations } from "@/lib/erp/hr/hr.functions";
import { useBrand } from "@/contexts/brand-context";

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

const STAFF_ROLES: AppRole[] = APP_ROLES.filter((r) => r !== "customer" && r !== "moderator") as AppRole[];

type Step = 0 | 1 | 2;

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated?: (res: { userId?: string; employeeId?: string }) => void;
};

export function AddPersonDialog({ open, onOpenChange, onCreated }: Props) {
  const qc = useQueryClient();
  const { brands } = useBrand();
  const createFn = useServerFn(createPerson);
  const deptsFn = useServerFn(listDepartments);
  const desigsFn = useServerFn(listDesignations);

  const { data: depts = [] } = useQuery({ queryKey: ["hr-depts"], queryFn: () => deptsFn(), enabled: open });
  const { data: desigs = [] } = useQuery({ queryKey: ["hr-desigs"], queryFn: () => desigsFn(), enabled: open });

  const [step, setStep] = useState<Step>(0);

  // basics
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // access
  const [createLogin, setCreateLogin] = useState(true);
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("operations");
  const [brandIds, setBrandIds] = useState<string[]>([]);

  // employment
  const [createEmployee, setCreateEmployee] = useState(true);
  const [joiningDate, setJoiningDate] = useState(new Date().toISOString().slice(0, 10));
  const [deptId, setDeptId] = useState<string | "none">("none");
  const [desigId, setDesigId] = useState<string | "none">("none");
  const [empType, setEmpType] = useState<string>("full_time");
  const [salary, setSalary] = useState<string>("");

  const reset = () => {
    setStep(0);
    setFullName(""); setEmail(""); setPhone("");
    setCreateLogin(true); setPassword(""); setRole("operations"); setBrandIds([]);
    setCreateEmployee(true); setJoiningDate(new Date().toISOString().slice(0, 10));
    setDeptId("none"); setDesigId("none"); setEmpType("full_time"); setSalary("");
  };

  const mut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          basics: {
            full_name: fullName.trim(),
            email: email.trim(),
            phone: phone.trim(),
          },
          access: createLogin
            ? {
                createLogin: true,
                password,
                roles: [role],
                brandIds,
              }
            : { createLogin: false },
          employment: createEmployee
            ? {
                createEmployee: true,
                joining_date: joiningDate,
                department_id: deptId === "none" ? null : deptId,
                designation_id: desigId === "none" ? null : desigId,
                employment_type: empType as any,
                gross_salary: salary ? Number(salary) : null,
              }
            : { createEmployee: false },
        },
      }),
    onSuccess: (res) => {
      toast.success("Person added");
      qc.invalidateQueries({ queryKey: ["hr-employees"] });
      qc.invalidateQueries({ queryKey: ["hr-kpis"] });
      qc.invalidateQueries({ queryKey: ["app-users"] });
      onCreated?.(res);
      onOpenChange(false);
      reset();
    },
    onError: (e: any) => toast.error(e?.message || "Failed to add person"),
  });

  const canNextFromBasics = fullName.trim().length > 0;
  const canNextFromAccess = !createLogin || (email.trim().length > 0 && password.length >= 6);
  const canSubmit = (createLogin || createEmployee) && canNextFromBasics && canNextFromAccess;

  const steps = [
    { key: 0, label: "Basics", icon: UserIcon },
    { key: 1, label: "Access", icon: ShieldCheck },
    { key: 2, label: "Employment", icon: Briefcase },
  ] as const;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            <Sparkles className="h-3.5 w-3.5" />
            People · Add
          </div>
          <DialogTitle className="text-[22px] tracking-tight">Add a Person</DialogTitle>
          <DialogDescription className="text-[13px]">
            Ek wizard e: login, role, brand, ar employee record — jeta lagbe ticket koro, baki skip.
          </DialogDescription>

          {/* Stepper */}
          <div className="mt-4 flex items-center gap-2">
            {steps.map((s, i) => {
              const active = step === s.key;
              const done = step > s.key;
              return (
                <div key={s.key} className="flex items-center gap-2 flex-1">
                  <div className={cn(
                    "h-7 w-7 rounded-full grid place-items-center text-[11px] font-semibold transition-all",
                    active && "bg-foreground text-background ring-2 ring-foreground/15 ring-offset-2 ring-offset-background",
                    done && "bg-emerald-500 text-white",
                    !active && !done && "bg-muted text-muted-foreground"
                  )}>
                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <div className={cn(
                    "text-[12px] font-medium",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}>{s.label}</div>
                  {i < steps.length - 1 && <div className="flex-1 h-px bg-border/60" />}
                </div>
              );
            })}
          </div>
        </DialogHeader>

        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[12px]">Full name *</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Md. Rakib Hasan" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[12px]">Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rakib@company.com" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[12px]">Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
                </div>
              </div>
              <p className="text-[12px] text-muted-foreground">
                Email lagbe jodi tumi login dao. Shudhu employee record toiri korte chao? Email skip kora jay.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <label className="flex items-start gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/40 cursor-pointer">
                <Checkbox checked={createLogin} onCheckedChange={(v) => setCreateLogin(!!v)} className="mt-0.5" />
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">Create login</div>
                  <div className="text-[12px] text-muted-foreground">App e login korte parbe. Role + brand access dewa jabe.</div>
                </div>
              </label>

              {createLogin && (
                <div className="space-y-3 pl-3 border-l-2 border-border/60 ml-1">
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">Password * <span className="text-muted-foreground font-normal">(min 6 chars)</span></Label>
                    <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Set initial password" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">Role</Label>
                    <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STAFF_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">Brand access <span className="text-muted-foreground font-normal">(empty = all)</span></Label>
                    <div className="flex flex-wrap gap-1.5">
                      {brands.map((b) => {
                        const sel = brandIds.includes(b.id);
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => setBrandIds((prev) => sel ? prev.filter((x) => x !== b.id) : [...prev, b.id])}
                            className={cn(
                              "h-7 px-3 rounded-full text-[12px] border transition-colors",
                              sel ? "bg-foreground text-background border-foreground" : "bg-background border-border/60 hover:bg-muted",
                            )}
                          >
                            {b.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <label className="flex items-start gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/40 cursor-pointer">
                <Checkbox checked={createEmployee} onCheckedChange={(v) => setCreateEmployee(!!v)} className="mt-0.5" />
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">Create HR employee record</div>
                  <div className="text-[12px] text-muted-foreground">Attendance, leave, payroll cholbe. Skip korle khali login thakbe.</div>
                </div>
              </label>

              {createEmployee && (
                <div className="space-y-3 pl-3 border-l-2 border-border/60 ml-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[12px]">Joining date</Label>
                      <Input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[12px]">Employment type</Label>
                      <Select value={empType} onValueChange={setEmpType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full_time">Full Time</SelectItem>
                          <SelectItem value="part_time">Part Time</SelectItem>
                          <SelectItem value="contract">Contract</SelectItem>
                          <SelectItem value="intern">Intern</SelectItem>
                          <SelectItem value="consultant">Consultant</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[12px]">Department</Label>
                      <Select value={deptId} onValueChange={(v) => setDeptId(v as any)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          {(depts as any[]).map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[12px]">Designation</Label>
                      <Select value={desigId} onValueChange={(v) => setDesigId(v as any)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          {(desigs as any[]).map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">Gross salary (BDT)</Label>
                    <Input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="Optional" />
                  </div>
                </div>
              )}

              {!createEmployee && !createLogin && (
                <div className="text-[12px] text-rose-600 dark:text-rose-400">
                  At least login or employee record — ekta create korte hobe.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border/60 flex items-center justify-between gap-2 bg-muted/30">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setStep((s) => (s === 0 ? 0 : ((s - 1) as Step)))}
            disabled={step === 0 || mut.isPending}
            className="rounded-full"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
          </Button>

          {step < 2 ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setStep((s) => ((s + 1) as Step))}
              disabled={(step === 0 && !canNextFromBasics) || (step === 1 && !canNextFromAccess)}
              className="rounded-full"
            >
              Next <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => mut.mutate()}
              disabled={!canSubmit || mut.isPending}
              className="rounded-full"
            >
              {mut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
              Create Person
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}