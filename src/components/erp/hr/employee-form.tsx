import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { listDepartments, listDesignations, listEmployees } from "@/lib/erp/hr/hr.functions";
import type { HrEmployee } from "@/lib/erp/hr/types";

type Props = {
  initial?: Partial<HrEmployee> | null;
  onSubmit: (data: any) => Promise<void> | void;
  submitting?: boolean;
  submitLabel?: string;
};

export function EmployeeForm({ initial, onSubmit, submitting, submitLabel = "Save" }: Props) {
  const { brands } = useBrand();
  const deptsFn = useServerFn(listDepartments);
  const desigsFn = useServerFn(listDesignations);
  const empsFn = useServerFn(listEmployees);
  const { data: depts = [] } = useQuery({ queryKey: ["hr-depts"], queryFn: () => deptsFn() });
  const { data: desigs = [] } = useQuery({ queryKey: ["hr-desigs"], queryFn: () => desigsFn() });
  const { data: managers } = useQuery({
    queryKey: ["hr-managers"],
    queryFn: () => empsFn({ data: { pageSize: 500 } }),
  });

  const [f, setF] = useState<any>({
    full_name: "",
    email: "",
    phone: "",
    gender: "",
    date_of_birth: "",
    nid: "",
    tin: "",
    status: "active",
    employment_type: "full_time",
    joining_date: new Date().toISOString().slice(0, 10),
    department_id: "",
    designation_id: "",
    manager_id: "",
    work_location: "",
    work_email: "",
    bank_name: "",
    bank_account_no: "",
    mfs_provider: "",
    mfs_number: "",
    gross_salary: "",
    present_address: "",
    permanent_address: "",
    emergency_name: "",
    emergency_relation: "",
    emergency_phone: "",
    brand_ids: [] as string[],
    tags: [] as string[],
    notes: "",
  });
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (initial) {
      setF((prev: any) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(initial).map(([k, v]) => [k, v === null || v === undefined ? (Array.isArray(prev[k]) ? [] : "") : v]),
        ),
      }));
    }
  }, [initial]);

  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const toggleBrand = (id: string) =>
    set("brand_ids", f.brand_ids.includes(id) ? f.brand_ids.filter((b: string) => b !== id) : [...f.brand_ids, id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = { ...f };
    Object.keys(payload).forEach((k) => {
      if (payload[k] === "") payload[k] = null;
    });
    if (payload.gross_salary !== null) payload.gross_salary = Number(payload.gross_salary) || null;
    await onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <Section title="Personal Information">
        <Field label="Full name" required>
          <Input value={f.full_name} onChange={(e) => set("full_name", e.target.value)} required />
        </Field>
        <Field label="Email">
          <Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Gender">
          <Select value={f.gender || "none"} onValueChange={(v) => set("gender", v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Date of birth">
          <Input type="date" value={f.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
        </Field>
        <Field label="NID">
          <Input value={f.nid} onChange={(e) => set("nid", e.target.value)} />
        </Field>
        <Field label="TIN">
          <Input value={f.tin} onChange={(e) => set("tin", e.target.value)} />
        </Field>
        <Field label="Blood group">
          <Input value={f.blood_group || ""} onChange={(e) => set("blood_group", e.target.value)} />
        </Field>
      </Section>

      <Section title="Employment">
        <Field label="Status">
          <Select value={f.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["active","probation","on_leave","suspended","terminated","resigned","retired"].map((s) => (
                <SelectItem key={s} value={s}>{s.replace("_"," ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Type">
          <Select value={f.employment_type} onValueChange={(v) => set("employment_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["full_time","part_time","contract","intern","consultant"].map((s) => (
                <SelectItem key={s} value={s}>{s.replace("_"," ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Joining date" required>
          <Input type="date" value={f.joining_date} onChange={(e) => set("joining_date", e.target.value)} required />
        </Field>
        <Field label="Department">
          <Select value={f.department_id || "none"} onValueChange={(v) => set("department_id", v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {(depts as any[]).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Designation">
          <Select value={f.designation_id || "none"} onValueChange={(v) => set("designation_id", v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {(desigs as any[]).map((d) => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Reporting manager">
          <Select value={f.manager_id || "none"} onValueChange={(v) => set("manager_id", v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {(managers?.rows ?? []).filter((m: any) => m.id !== initial?.id).map((m: any) => (
                <SelectItem key={m.id} value={m.id}>{m.full_name} · {m.employee_code}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Work location">
          <Input value={f.work_location} onChange={(e) => set("work_location", e.target.value)} />
        </Field>
        <Field label="Work email">
          <Input type="email" value={f.work_email} onChange={(e) => set("work_email", e.target.value)} />
        </Field>
        <Field label="Gross salary (BDT/mo)">
          <Input type="number" value={f.gross_salary} onChange={(e) => set("gross_salary", e.target.value)} />
        </Field>
        <Field label="Brands" full>
          <div className="flex flex-wrap gap-1.5">
            {brands.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => toggleBrand(b.id)}
                className={`px-2.5 py-1 rounded-md text-xs border ${f.brand_ids.includes(b.id) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
              >
                {b.name}
              </button>
            ))}
            {brands.length === 0 && <span className="text-xs text-muted-foreground">No brands available.</span>}
          </div>
        </Field>
      </Section>

      <Section title="Bank / Mobile Banking">
        <Field label="Bank name">
          <Input value={f.bank_name} onChange={(e) => set("bank_name", e.target.value)} />
        </Field>
        <Field label="Bank account no.">
          <Input value={f.bank_account_no} onChange={(e) => set("bank_account_no", e.target.value)} />
        </Field>
        <Field label="MFS provider">
          <Select value={f.mfs_provider || "none"} onValueChange={(v) => set("mfs_provider", v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              <SelectItem value="bKash">bKash</SelectItem>
              <SelectItem value="Nagad">Nagad</SelectItem>
              <SelectItem value="Rocket">Rocket</SelectItem>
              <SelectItem value="Upay">Upay</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="MFS number">
          <Input value={f.mfs_number} onChange={(e) => set("mfs_number", e.target.value)} />
        </Field>
      </Section>

      <Section title="Address & Emergency Contact">
        <Field label="Present address" full>
          <Textarea rows={2} value={f.present_address} onChange={(e) => set("present_address", e.target.value)} />
        </Field>
        <Field label="Permanent address" full>
          <Textarea rows={2} value={f.permanent_address} onChange={(e) => set("permanent_address", e.target.value)} />
        </Field>
        <Field label="Emergency contact name">
          <Input value={f.emergency_name} onChange={(e) => set("emergency_name", e.target.value)} />
        </Field>
        <Field label="Relation">
          <Input value={f.emergency_relation} onChange={(e) => set("emergency_relation", e.target.value)} />
        </Field>
        <Field label="Emergency phone">
          <Input value={f.emergency_phone} onChange={(e) => set("emergency_phone", e.target.value)} />
        </Field>
      </Section>

      <Section title="Tags & Notes">
        <Field label="Tags" full>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(f.tags as string[]).map((t) => (
              <Badge key={t} variant="secondary" className="gap-1">
                {t}
                <button type="button" onClick={() => set("tags", f.tags.filter((x: string) => x !== t))}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Add tag and Enter"
              onKeyDown={(e) => {
                if (e.key === "Enter" && tagInput.trim()) {
                  e.preventDefault();
                  if (!f.tags.includes(tagInput.trim())) set("tags", [...f.tags, tagInput.trim()]);
                  setTagInput("");
                }
              }}
            />
          </div>
        </Field>
        <Field label="Notes" full>
          <Textarea rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </Section>

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">{title}</h3>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 border border-border rounded-lg bg-card">
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, full, children }: { label: string; required?: boolean; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? "md:col-span-2 lg:col-span-3 space-y-1.5" : "space-y-1.5"}>
      <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
      {children}
    </div>
  );
}