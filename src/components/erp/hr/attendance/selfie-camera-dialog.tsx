import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCcw, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (data: { selfieBlob: Blob | null; lat: number | null; lng: number | null }) => Promise<void>;
  title?: string;
  requireSelfie?: boolean;
}

export function SelfieCameraDialog({ open, onClose, onConfirm, title = "Check In", requireSelfie = true }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCaptured(null);
    if (requireSelfie) {
      (async () => {
        try {
          const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
          streamRef.current = s;
          if (videoRef.current) videoRef.current.srcObject = s;
        } catch (e: any) {
          toast.error("Camera access denied: " + (e.message ?? "unknown"));
        }
      })();
    }
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, requireSelfie]);

  const snap = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth; canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(v, 0, 0);
    setCaptured(canvas.toDataURL("image/jpeg", 0.8));
    streamRef.current?.getTracks().forEach((t) => t.stop());
  };

  const retake = async () => {
    setCaptured(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const confirm = async () => {
    if (requireSelfie && !captured) {
      toast.error("Capture a selfie first");
      return;
    }
    setBusy(true);
    try {
      let blob: Blob | null = null;
      if (captured) {
        const res = await fetch(captured);
        blob = await res.blob();
      }
      await onConfirm({ selfieBlob: blob, lat: null, lng: null });
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {requireSelfie && (
            <div className="bg-black rounded-md overflow-hidden aspect-[4/3] flex items-center justify-center relative">
              {captured ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={captured} alt="selfie" className="w-full h-full object-cover" />
              ) : (
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              )}
            </div>
          )}
          {requireSelfie && (
            <div className="flex gap-2 justify-center">
              {captured ? (
                <Button size="sm" variant="outline" onClick={retake}>
                  <RefreshCcw className="h-4 w-4 mr-1.5" /> Retake
                </Button>
              ) : (
                <Button size="sm" onClick={snap}>
                  <Camera className="h-4 w-4 mr-1.5" /> Capture
                </Button>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><X className="h-4 w-4 mr-1.5" /> Cancel</Button>
          <Button onClick={confirm} disabled={busy || (requireSelfie && !captured)}>
            <Check className="h-4 w-4 mr-1.5" /> Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}