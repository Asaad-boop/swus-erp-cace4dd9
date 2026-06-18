import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bookmark, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  listSavedFilters, createSavedFilter, deleteSavedFilter,
} from "@/lib/erp/crm/admin.functions";

export function SavedFiltersMenu({
  brandId, currentFilters, onApply,
}: {
  brandId?: string;
  currentFilters: Record<string, any>;
  onApply: (filters: Record<string, any>) => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listSavedFilters);
  const createFn = useServerFn(createSavedFilter);
  const deleteFn = useServerFn(deleteSavedFilter);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");

  const q = useQuery({
    queryKey: ["crm-saved-filters", brandId ?? "all"],
    queryFn: () => listFn({ data: { brandId } }),
    staleTime: 60_000,
  });

  const createMut = useMutation({
    mutationFn: () => createFn({ data: { brandId: brandId ?? null, name: name.trim(), filters: currentFilters } }),
    onSuccess: () => {
      toast.success("Filter saved");
      setSaveOpen(false); setName("");
      qc.invalidateQueries({ queryKey: ["crm-saved-filters"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Filter deleted");
      qc.invalidateQueries({ queryKey: ["crm-saved-filters"] });
    },
  });

  const items = q.data ?? [];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Bookmark className="h-4 w-4" /> Saved
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs">Saved filters</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {items.length === 0 && (
            <div className="px-2 py-2 text-xs text-muted-foreground">No saved filters yet.</div>
          )}
          {items.map((f: any) => (
            <div key={f.id} className="flex items-center justify-between pr-1">
              <DropdownMenuItem
                className="flex-1"
                onClick={() => onApply(f.filters as Record<string, any>)}
              >
                {f.name}
              </DropdownMenuItem>
              <Button
                variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); deleteMut.mutate(f.id); }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSaveOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Save current filters…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Save current filters</DialogTitle></DialogHeader>
          <Input placeholder="Filter name (e.g. VIP last 30d)" value={name} onChange={(e) => setName(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button disabled={!name.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
              {createMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}