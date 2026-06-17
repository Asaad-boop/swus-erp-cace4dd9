import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LogIn, LogOut, Coffee, MapPin, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listEmployees } from "@/lib/erp/hr/hr.functions";
import { punchIn, punchBreak, punchOut, getTodayPunchStatus } from "@/lib/erp/hr/punch.functions";
import { HR_SELFIE_BUCKET, uploadHrFile } from "@/lib/erp/hr/storage";
import { SelfieCameraDialog } from "./selfie-camera-dialog";

type Mode = "simple" | "gps" | "selfie";

export function LivePunchPanel() {
  const qc = useQueryClient();
  const empsFn = useServerFn(listEmployees);
  const statusFn = useServerFn(getTodayPunchStatus);
  const punchInFn = useServerFn(punchIn);
  const breakFn = useServerFn(punchBreak);
  const punchOutFn = useServerFn(punchOut);

  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<Mode>("simple");
  const [cameraEmp, setCameraEmp] = useState<{ id: string; name: string } | null>(null);

  const { data: empsData } = useQuery({
    queryKey: ["hr-emp-mini-live", search],
    queryFn: () => empsFn({ data: { search, status: "active", pageSize: 200 } }),
  });
  const emps = empsData?.rows ?? [];
  const { data: statusMap = {} } = useQuery({
    queryKey: ["punch-status", emps.map((e: any) => e.id).join(",")],
    queryFn: () => statusFn({ data: { employeeIds: emps.map((e: any) => e.id) } }),
    enabled: emps.length > 0,
    refetchInterval: 30000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["punch-status"] });

  const doPunchIn = async (empId: string, payload: { lat: number | null; lng: number | null; selfie_url: string | null }) => {
    try {
      await punchInFn({ data: { employee_id: empId, ...payload } });
      toast.success("Checked in");
      refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const simpleIn = useMutation({
    mutationFn: (id: string) => punchInFn({ data: { employee_id: id } }),
    onSuccess: () => { toast.success("Checked in"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });
  const breakMut = useMutation({
    mutationFn: (v: { id: string; action: "start" | "end" }) => breakFn({ data: { employee_id: v.id, action: v.action } }),
    onSuccess: () => refresh(),
    onError: (e: any) => toast.error(e.message),
  });
  const outMut = useMutation({
    mutationFn: (id: string) => punchOutFn({ data: { employee_id: id } }),
    onSuccess: () => { toast.success("Checked out"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleCheckIn = (emp: any) => {
    if (mode === "simple") return simpleIn.mutate(emp.id);
    setCameraEmp({ id: emp.id, name: emp.full_name });
  };

  const cameraConfirm = async (data: { selfieBlob: Blob | null; lat: number | null; lng: number | null }) => {
    if (!cameraEmp) return;
    let selfieUrl: string | null = null;
    if (data.selfieBlob) {
      const path = `${cameraEmp.id}/${new Date().toISOString().slice(0,10)}.jpg`;
      await uploadHrFile(HR_SELFIE_BUCKET, path, data.selfieBlob, { contentType: "image/jpeg" });
      selfieUrl = path;
    }
    await doPunchIn(cameraEmp.id, { lat: data.lat, lng: data.lng, selfie_url: selfieUrl });
    setCameraEmp(null);
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm font-semibold">Live Punch — {new Date().toLocaleDateString("en-BD", { weekday: "short", month: "short", day: "numeric" })}</div>
          <div className="inline-flex rounded-md border p-0.5">
            <Button size="sm" variant={mode === "simple" ? "default" : "ghost"} onClick={() => setMode("simple")} className="h-7 px-2">Simple</Button>
            <Button size="sm" variant={mode === "gps" ? "default" : "ghost"} onClick={() => setMode("gps")} className="h-7 px-2"><MapPin className="h-3 w-3 mr-1" />GPS</Button>
            <Button size="sm" variant={mode === "selfie" ? "default" : "ghost"} onClick={() => setMode("selfie")} className="h-7 px-2"><Camera className="h-3 w-3 mr-1" />Selfie+GPS</Button>
          </div>
        </div>
        <Input placeholder="Search employee…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <div className="border rounded overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>In</TableHead>
                <TableHead>Out</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emps.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No employees.</TableCell></TableRow>
              ) : emps.map((e: any) => {
                const s = (statusMap as any)[e.id];
                const checkedIn = !!s?.check_in_time;
                const onBreak = !!s?.break_start && !s?.break_end;
                const checkedOut = !!s?.check_out_time;
                return (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{e.full_name}</div>
                      <div className="text-xs text-muted-foreground">{e.employee_code}</div>
                    </TableCell>
                    <TableCell>
                      {checkedOut ? <Badge className="bg-slate-200 text-slate-700">Out</Badge>
                        : onBreak ? <Badge className="bg-amber-100 text-amber-800">On break</Badge>
                        : checkedIn ? <Badge className="bg-emerald-100 text-emerald-800">In</Badge>
                        : <Badge variant="outline">Not started</Badge>}
                      {s?.late_min ? <span className="ml-2 text-xs text-amber-600">+{s.late_min}m late</span> : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {s?.check_in_time ? new Date(s.check_in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {s?.check_out_time ? new Date(s.check_out_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{s?.total_hours ? `${s.total_hours}h` : "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        {!checkedIn && !checkedOut && (
                          <Button size="sm" variant="outline" onClick={() => handleCheckIn(e)}>
                            {simpleIn.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3 mr-1" />} In
                          </Button>
                        )}
                        {checkedIn && !checkedOut && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => breakMut.mutate({ id: e.id, action: onBreak ? "end" : "start" })}>
                              <Coffee className="h-3 w-3 mr-1" /> {onBreak ? "End break" : "Break"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => outMut.mutate(e.id)}>
                              <LogOut className="h-3 w-3 mr-1" /> Out
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <SelfieCameraDialog
        open={!!cameraEmp}
        onClose={() => setCameraEmp(null)}
        onConfirm={cameraConfirm}
        title={cameraEmp ? `Check In — ${cameraEmp.name}` : "Check In"}
        requireSelfie={mode === "selfie"}
      />
    </Card>
  );
}