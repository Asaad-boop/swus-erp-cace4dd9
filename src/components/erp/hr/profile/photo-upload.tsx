import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  HR_DOC_BUCKET,
  uploadHrFile,
  getHrSignedUrl,
  deleteHrFile,
} from "@/lib/erp/hr/storage";
import { setEmployeePhoto } from "@/lib/erp/hr/profile.functions";

interface Props {
  employeeId: string;
  currentUrl: string | null;
  fullName: string;
  canEdit: boolean;
}

export function PhotoUpload({ employeeId, currentUrl, fullName, canEdit }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const setPhotoFn = useServerFn(setEmployeePhoto);
  const [busy, setBusy] = useState(false);
  const [signed, setSigned] = useState<string | null>(null);

  // resolve signed url on mount if path stored
  useState(() => {
    (async () => {
      if (!currentUrl) return;
      if (currentUrl.startsWith("http")) {
        setSigned(currentUrl);
        return;
      }
      try {
        const url = await getHrSignedUrl(HR_DOC_BUCKET, currentUrl, 3600);
        setSigned(url);
      } catch {
        setSigned(null);
      }
    })();
  });

  const mut = useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${employeeId}/avatar.${ext}`;
      await uploadHrFile(HR_DOC_BUCKET, path, file, { upsert: true });
      await setPhotoFn({ data: { id: employeeId, photo_url: path } });
      const url = await getHrSignedUrl(HR_DOC_BUCKET, path, 3600);
      return url;
    },
    onSuccess: (url) => {
      setSigned(url);
      toast.success("Photo updated");
      qc.invalidateQueries({ queryKey: ["hr-employee", employeeId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Upload failed"),
    onSettled: () => setBusy(false),
  });

  const delMut = useMutation({
    mutationFn: async () => {
      if (currentUrl && !currentUrl.startsWith("http")) {
        try { await deleteHrFile(HR_DOC_BUCKET, currentUrl); } catch {}
      }
      await setPhotoFn({ data: { id: employeeId, photo_url: null } });
    },
    onSuccess: () => {
      setSigned(null);
      toast.success("Photo removed");
      qc.invalidateQueries({ queryKey: ["hr-employee", employeeId] });
    },
  });

  const initials = fullName
    .split(" ")
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

  return (
    <div className="flex items-center gap-4">
      <div className="h-20 w-20 rounded-full bg-primary/10 overflow-hidden flex items-center justify-center text-2xl font-bold text-primary">
        {signed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signed} alt={fullName} className="h-full w-full object-cover" />
        ) : (
          initials || "?"
        )}
      </div>
      {canEdit && (
        <div className="flex flex-col gap-1.5">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              mut.mutate(f);
              e.target.value = "";
            }}
          />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Camera className="h-3.5 w-3.5 mr-1.5" />}
            {signed ? "Change photo" : "Upload photo"}
          </Button>
          {signed && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => delMut.mutate()}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove
            </Button>
          )}
        </div>
      )}
    </div>
  );
}