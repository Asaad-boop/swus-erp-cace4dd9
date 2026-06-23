import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Download, Calendar, AlertCircle, FileBadge } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyDocuments } from "@/lib/erp/hr/me.functions";

export const Route = createFileRoute("/_authenticated/me/documents")({
  head: () => ({ meta: [{ title: "My Documents" }] }),
  component: MyDocuments,
});

function formatBytes(n?: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function MyDocuments() {
  const fn = useServerFn(getMyDocuments);
  const { data, isLoading } = useQuery({ queryKey: ["me", "docs"], queryFn: () => fn() });
  const rows: any[] = data?.rows ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Documents</h1>
        <p className="text-sm text-muted-foreground">Apnar offer letter, ID, contract o onnano nothi ekhane.</p>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center space-y-2">
          <FileBadge className="h-10 w-10 mx-auto text-muted-foreground" />
          <div className="font-semibold">Kono document nei</div>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            HR team apnar nothi upload korle ekhane dekhabe — offer letter, ID copy, contract ityadi.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((d) => {
            const expired = d.expiry_date && new Date(d.expiry_date) < new Date();
            const expSoon =
              !expired && d.expiry_date &&
              (new Date(d.expiry_date).getTime() - Date.now()) / 86400000 < 30;
            return (
              <Card key={d.id} className="p-4 hover:shadow-md transition-shadow group">
                <div className="flex items-start gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{d.title || d.file_name || "Document"}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          {d.doc_type && <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">{d.doc_type}</Badge>}
                          {d.file_size && <span>{formatBytes(d.file_size)}</span>}
                        </div>
                      </div>
                      {d.file_url && (
                        <Button asChild size="sm" variant="ghost" className="shrink-0">
                          <a href={d.file_url} target="_blank" rel="noreferrer" download={d.file_name || true}>
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      {d.issue_date && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> Issued {new Date(d.issue_date).toLocaleDateString()}
                        </span>
                      )}
                      {d.expiry_date && (
                        <span className={`inline-flex items-center gap-1 ${expired ? "text-destructive" : expSoon ? "text-amber-600" : ""}`}>
                          {(expired || expSoon) && <AlertCircle className="h-3 w-3" />}
                          Expires {new Date(d.expiry_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {d.notes && <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{d.notes}</p>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}