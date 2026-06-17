import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Upload, Download, Trash2, FileText, Calendar, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  listEmployeeDocuments,
  recordEmployeeDocument,
  deleteEmployeeDocument,
} from "@/lib/erp/hr/profile.functions";
import {
  HR_DOC_BUCKET,
  uploadHrFile,
  getHrSignedUrl,
} from "@/lib/erp/hr/storage";

const DOC_TYPES = ["NID", "Passport", "Contract", "Offer Letter", "Certificate", "Other"];

export function DocumentsTab({ employeeId, canEdit }: { employeeId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listEmployeeDocuments);
  const recFn = useServerFn(recordEmployeeDocument);
  const delFn = useServerFn(deleteEmployeeDocument);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["hr-employee-docs", employeeId],
    queryFn: () => listFn({ data: { employeeId } }),
  });

  const [open, setOpen] = useState(false);
  const [type, setType] = useState("NID");
  const [title, setTitle] = useState("");
  const [expiry, setExpiry] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setOpen(false); setType("NID"); setTitle(""); setExpiry(""); setNotes(""); setFile(null);
  };

  const upload = async () => {
    if (!file || !title) { toast.error("Title and file required"); return; }
    setUploading(true);
    try {
      const ts = Date.now();
      const safe = file.name.replace(/[^a-z0-9._-]/gi, "_");
      const path = `${employeeId}/${ts}_${safe}`;
      await uploadHrFile(HR_DOC_BUCKET, path, file);
      await recFn({
        data: {
          employee_id: employeeId,
          doc_type: type,
          title,
          file_url: path,
          file_name: file.name,
          mime_type: file.type,
          file_size: file.size,
          expiry_date: expiry || null,
          notes: notes || null,
        },
      });
      toast.success("Document uploaded");
      qc.invalidateQueries({ queryKey: ["hr-employee-docs", employeeId] });
      reset();
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally { setUploading(false); }
  };

  const del = useMutation({
    mutationFn: (d: any) => delFn({ data: { id: d.id, file_url: d.file_url } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["hr-employee-docs", employeeId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const download = async (path: string, filename?: string) => {
    try {
      const url = await getHrSignedUrl(HR_DOC_BUCKET, path, 600);
      const a = document.createElement("a");
      a.href = url; a.download = filename || "document"; a.target = "_blank";
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e: any) { toast.error(e.message ?? "Download failed"); }
  };

  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm text-muted-foreground">{(docs as any[]).length} documents</div>
          {canEdit && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Upload className="h-4 w-4 mr-1.5" /> Upload
            </Button>
          )}
        </div>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : (docs as any[]).length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No documents yet.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-2">
            {(docs as any[]).map((d) => {
              const expiringSoon = d.expiry_date && d.expiry_date >= today && d.expiry_date <= in30;
              return (
                <div key={d.id} className="border rounded p-3 flex items-start gap-3">
                  <FileText className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{d.doc_type}</Badge>
                      <span className="font-medium text-sm truncate">{d.title}</span>
                      {expiringSoon && <Badge className="bg-amber-100 text-amber-800 text-[10px]"><AlertTriangle className="h-3 w-3 mr-0.5" />expiring soon</Badge>}
                    </div>
                    {d.expiry_date && (
                      <div className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Expires {d.expiry_date}
                      </div>
                    )}
                    {d.notes && <div className="text-xs text-muted-foreground mt-1">{d.notes}</div>}
                    <div className="flex gap-1 mt-2">
                      <Button size="sm" variant="outline" onClick={() => download(d.file_url, d.file_name)}>
                        <Download className="h-3 w-3 mr-1" /> Download
                      </Button>
                      {canEdit && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Delete this document?")) del.mutate(d); }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => !o && reset()}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. NID Front" />
            </div>
            <div>
              <Label>Expiry Date (optional)</Label>
              <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div>
              <Label>File</Label>
              <Input ref={inputRef} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={reset}>Cancel</Button>
            <Button onClick={upload} disabled={uploading || !file || !title}>
              {uploading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}