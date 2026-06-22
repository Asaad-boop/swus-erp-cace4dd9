import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Wallet, TrendingUp, CheckCircle2, Clock, Receipt } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { getMyPayslips, getMyPayslip } from "@/lib/erp/hr/me.functions";

export const Route = createFileRoute("/_authenticated/me/payslips")({
  head: () => ({ meta: [{ title: "My Payslips" }] }),
  component: PayslipsPage,
});

function fmt(n: number) {
  return `৳${Math.round(Number(n || 0)).toLocaleString()}`;
}
function monthLabel(m?: number, y?: number) {
  if (!m || !y) return "—";
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function PayslipsPage() {
  const fn = useServerFn(getMyPayslips);
  const one = useServerFn(getMyPayslip);
  const { data } = useQuery({ queryKey: ["me", "payslips"], queryFn: () => fn() });
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: detail } = useQuery({
    queryKey: ["me", "payslip", openId],
    queryFn: () => one({ data: { id: openId! } }),
    enabled: !!openId,
  });

  const rows: any[] = data?.rows ?? [];
  const ytd = data?.ytd;
  const emp: any = data?.employee;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <Wallet className="h-5 w-5 text-emerald-600" /> Payslips
      </h1>

      {/* Salary card */}
      {emp?.gross_salary && (
        <Card className="p-5 bg-gradient-to-br from-emerald-500 to-teal-700 text-white border-0">
          <div className="text-[11px] uppercase tracking-wider text-white/70">Monthly gross</div>
          <div className="text-3xl font-bold tabular-nums mt-1">{fmt(emp.gross_salary)}</div>
          <div className="text-xs text-white/80 mt-1">{emp.currency || "BDT"}</div>
        </Card>
      )}

      {/* YTD */}
      {ytd && ytd.count > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Kpi icon={TrendingUp} label="YTD Gross" value={fmt(ytd.gross)} tone="text-blue-600" />
          <Kpi icon={CheckCircle2} label="YTD Net" value={fmt(ytd.net)} tone="text-emerald-600" />
          <Kpi icon={Receipt} label="Slips" value={String(ytd.count)} tone="text-violet-600" />
        </div>
      )}

      <Card>
        <div className="border-b px-4 py-3 font-semibold text-sm">All payslips</div>
        {rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No payslips yet</div>
        ) : (
          <div className="divide-y">
            {rows.map((p: any) => (
              <button
                key={p.id}
                onClick={() => setOpenId(p.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
              >
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 grid place-items-center text-emerald-600">
                  <Wallet className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm">{monthLabel(p.hr_payroll_runs?.month, p.hr_payroll_runs?.year)}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    {p.payment_status === "paid" ? (
                      <><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Paid {p.paid_at ? `· ${new Date(p.paid_at).toLocaleDateString()}` : ""}</>
                    ) : (
                      <><Clock className="h-3 w-3 text-amber-500" /> {p.hr_payroll_runs?.status || "Draft"}</>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold">{fmt(p.net_pay)}</div>
                  <div className="text-[10px] text-muted-foreground">Net</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Sheet open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Payslip · {monthLabel(detail?.hr_payroll_runs?.month, detail?.hr_payroll_runs?.year)}</SheetTitle>
          </SheetHeader>
          {detail && (
            <div className="space-y-4 mt-4">
              <div className="rounded-lg bg-muted/50 p-4">
                <div className="text-xs text-muted-foreground">Net pay</div>
                <div className="text-3xl font-bold tabular-nums">{fmt(detail.net_pay)}</div>
              </div>

              <Section title="Earnings">
                <Row label="Basic" value={fmt(detail.basic)} />
                {Object.entries((detail.allowances as any) || {}).map(([k, v]: any) => (
                  <Row key={k} label={k} value={fmt(v)} />
                ))}
                {detail.overtime_earning > 0 && <Row label="Overtime" value={fmt(detail.overtime_earning)} />}
                <Row label="Gross" value={fmt(detail.gross)} bold />
              </Section>

              <Section title="Deductions">
                {Object.entries((detail.deductions as any) || {}).map(([k, v]: any) => (
                  <Row key={k} label={k} value={fmt(v)} />
                ))}
                {detail.absent_deduction > 0 && <Row label="Absent deduction" value={fmt(detail.absent_deduction)} />}
                {detail.late_deduction > 0 && <Row label="Late deduction" value={fmt(detail.late_deduction)} />}
              </Section>

              <div className="flex items-center justify-between text-sm pt-2">
                <span>Status</span>
                <Badge variant={detail.payment_status === "paid" ? "default" : "secondary"} className="capitalize">{detail.payment_status || "draft"}</Badge>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: any) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Icon className={cn("h-3.5 w-3.5", tone)} />{label}</div>
      <div className="text-lg font-bold tabular-nums mt-1">{value}</div>
    </Card>
  );
}
function Section({ title, children }: any) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</div>
      <div className="rounded-lg border divide-y">{children}</div>
    </div>
  );
}
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between px-3 py-2 text-sm capitalize", bold && "font-semibold bg-muted/40")}>
      <span>{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}