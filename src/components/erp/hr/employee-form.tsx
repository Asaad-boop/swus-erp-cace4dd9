import { useState, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  X,
  User,
  Briefcase,
  Wallet,
  MapPin,
  Tag,
  CheckCircle2,
  Loader2,
  type LucideIcon,
} from "lucide-react";
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

  const initials = (f.full_name || "").split(" ").filter(Boolean).slice(0, 2).map((s: string) => s[0]?.toUpperCase()).join("") || "?";
  const filledRequired = Boolean(f.full_name && f.joining_date);

  return (
    <form onSubmit={handleSubmit} className="space-y-10 pb-24">
      {/* Hero identity preview */}
      <div className="relative overflow-hidden rounded-2xl ring-1 ring-[color:var(--hr-border)] bg-[color:var(--hr-surface-elevated)] shadow-[var(--shadow-hr-card)] p-5 flex items-center gap-4">
        <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full blur-3xl opacity-50 bg-[color:var(--hr-accent-soft)]" />
        <div className="relative h-14 w-14 rounded-2xl grid place-items-center text-lg font-semibold bg-[color:var(--hr-accent-soft)] text-[color:var(--hr-accent)] ring-1 ring-[color:var(--hr-accent)]/15 tabular-nums">
          {initials}
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--hr-text-muted)]">Live preview</div>
          <div className="text-lg font-semibold tracking-tight text-[color:var(--hr-text-strong)] truncate">
            {f.full_name || "New employee"}
          </div>
          <div className="text-sm text-[color:var(--hr-text-muted)] truncate">
            {[f.employment_type?.replace("_", " "), f.work_location].filter(Boolean).join(" · ") || "Fill the form to see details"}
          </div>
        </div>
        <div className="relative hidden md:flex items-center gap-1.5 text-xs">
          <CheckCircle2 className={`h-4 w-4 ${filledRequired ? "text-[color:var(--hr-present)]" : "text-[color:var(--hr-text-muted)] opacity-40"}`} />
          <span className="text-[color:var(--hr-text-muted)]">{filledRequired ? "Ready to save" : "Name & joining date required"}</span>
        </div>
      </div>

      <Section
        icon={User}
        title="Personal Information"
        description="Basic identity used across HR, payroll and the directory."
      >
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

      <Section
        icon={Briefcase}
        title="Employment"
        description="Role, reporting line and compensation."
      >
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
        <Field label="Gross salary (BDT / month)">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[color:var(--hr-text-muted)] pointer-events-none">৳</span>
            <Input type="number" inputMode="numeric" className="pl-7 tabular-nums" value={f.gross_salary} onChange={(e) => set("gross_salary", e.target.value)} />
          </div>
        </Field>
        <Field label="Brands" full>
          <div className="flex flex-wrap gap-1.5">
            {brands.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => toggleBrand(b.id)}
                className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${f.brand_ids.includes(b.id) ? "bg-[color:var(--hr-accent)] text-white border-[color:var(--hr-accent)]" : "border-[color:var(--hr-border)] text-[color:var(--hr-text-strong)] hover:bg-muted"}`}
              >
                {b.name}
              </button>
            ))}
            {brands.length === 0 && <span className="text-xs text-muted-foreground">No brands available.</span>}
          </div>
        </Field>
      </Section>

      <Section
        icon={Wallet}
        title="Bank / Mobile Banking"
        description="Where payroll will be disbursed each cycle."
      >
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

      <Section
        icon={MapPin}
        title="Address & Emergency Contact"
        description="Used for documents and emergency situations."
      >
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

      <Section
        icon={Tag}
        title="Tags & Notes"
        description="Optional metadata for filtering and context."
      >
        <Field label="Tags" full>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(f.tags as string[]).map((t) => (
              <Badge key={t} variant="secondary" className="gap-1 rounded-md">
                {t}
                <button type="button" onClick={() => set("tags", f.tags.filter((x: string) => x !== t))} className="opacity-60 hover:opacity-100">
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

      {/* Sticky action bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-[color:var(--hr-border)] bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto max-w-5xl px-4 md:px-8 py-3 flex items-center justify-between gap-3">
          <div className="text-xs text-[color:var(--hr-text-muted)] hidden sm:block">
            {filledRequired ? (
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-[color:var(--hr-present)]" /> All required fields complete</span>
            ) : (
              <span>Required: name, joining date</span>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button type="submit" disabled={submitting || !filledRequired} className="bg-[color:var(--hr-accent)] hover:opacity-90 text-white min-w-[140px]">
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
              ) : (
                submitLabel
              )}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid lg:grid-cols-[260px_minmax(0,1fr)] gap-x-10 gap-y-4">
      <header className="lg:pt-1">
        <div className="flex items-center gap-2.5">
          <div className="grid place-items-center h-8 w-8 rounded-xl bg-[color:var(--hr-accent-soft)] text-[color:var(--hr-accent)] ring-1 ring-[color:var(--hr-accent)]/15">
            <Icon className="h-4 w-4" />
          </div>
          <h3 className="text-[15px] font-semibold tracking-tight text-[color:var(--hr-text-strong)]">{title}</h3>
        </div>
        {description && (
          <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--hr-text-muted)] lg:max-w-[230px]">
            {description}
          </p>
        )}
      </header>
      <div className="rounded-2xl bg-[color:var(--hr-surface-elevated)] ring-1 ring-[color:var(--hr-border)] shadow-[var(--shadow-hr-card)] p-5">
        <div className="grid md:grid-cols-2 gap-x-5 gap-y-4">
          {children}
        </div>
      </div>
    </section>
  );
}

function Field({ label, required, full, children }: { label: string; required?: boolean; full?: boolean; children: ReactNode }) {
  return (
    <div className={full ? "md:col-span-2 space-y-1.5" : "space-y-1.5"}>
      <Label className="text-[11.5px] font-medium text-[color:var(--hr-text-muted)]">
        {label}
        {required && <span className="text-[color:var(--hr-absent)] ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}