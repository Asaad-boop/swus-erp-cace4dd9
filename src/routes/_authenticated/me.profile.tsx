import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { User, Phone, Mail, Building2, Briefcase, Calendar, MapPin, UserCog, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { getMyEmployee } from "@/lib/erp/hr/me.functions";

export const Route = createFileRoute("/_authenticated/me/profile")({
  head: () => ({ meta: [{ title: "My Profile" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const fn = useServerFn(getMyEmployee);
  const { data } = useQuery({ queryKey: ["me", "profile"], queryFn: () => fn() });
  const emp: any = data?.employee;

  if (!emp) {
    return <Card className="p-6 text-center text-sm text-muted-foreground">No employee record</Card>;
  }

  return (
    <div className="space-y-5">
      {/* Hero */}
      <Card className="overflow-hidden border-0 bg-gradient-to-br from-slate-900 to-slate-700 text-white p-5">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 ring-2 ring-white/30">
            {emp.photo_url && <AvatarImage src={emp.photo_url} />}
            <AvatarFallback className="bg-white/10 text-white text-xl font-bold">
              {(emp.display_name || emp.full_name || "U").slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="text-xl font-bold truncate">{emp.display_name || emp.full_name}</div>
            <div className="text-sm text-white/70 truncate">{data?.designation?.name || emp.employment_type || "Employee"}</div>
            {emp.employee_code && <div className="mt-1.5 inline-block rounded bg-white/15 px-2 py-0.5 text-[10px] font-mono">{emp.employee_code}</div>}
          </div>
        </div>
      </Card>

      <Button asChild variant="outline" className="w-full">
        <Link to="/me/performance"><TrendingUp className="h-4 w-4 mr-2" /> View my performance</Link>
      </Button>

      <Card>
        <SectionHeader>Contact</SectionHeader>
        <Field icon={Mail} label="Email" value={emp.email} />
        <Field icon={Phone} label="Phone" value={emp.phone} />
      </Card>

      <Card>
        <SectionHeader>Work</SectionHeader>
        <Field icon={Building2} label="Department" value={data?.department?.name} />
        <Field icon={Briefcase} label="Designation" value={data?.designation?.name} />
        <Field icon={UserCog} label="Manager" value={data?.manager?.display_name || data?.manager?.full_name} />
        <Field icon={MapPin} label="Location" value={emp.work_location} />
        <Field icon={Calendar} label="Joined" value={emp.joining_date ? new Date(emp.joining_date).toLocaleDateString() : null} />
        <Field icon={User} label="Status" value={<Badge variant="outline" className="capitalize">{emp.status}</Badge>} />
      </Card>
    </div>
  );
}

function SectionHeader({ children }: any) {
  return <div className="border-b px-4 py-3 font-semibold text-sm">{children}</div>;
}
function Field({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b last:border-0">
      <div className="h-8 w-8 rounded-lg bg-muted grid place-items-center shrink-0"><Icon className="h-4 w-4 text-muted-foreground" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="text-sm font-medium truncate">{value}</div>
      </div>
    </div>
  );
}