import { supabase } from "@/integrations/supabase/client";

export const HR_DOC_BUCKET = "hr-documents";
export const HR_SELFIE_BUCKET = "hr-attendance-selfies";

export async function uploadHrFile(
  bucket: string,
  path: string,
  file: Blob | File,
  opts?: { contentType?: string; upsert?: boolean },
) {
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: opts?.contentType ?? (file as any).type ?? "application/octet-stream",
    upsert: opts?.upsert ?? true,
  });
  if (error) throw error;
  return data.path;
}

export async function getHrSignedUrl(bucket: string, path: string, expiresInSec = 3600) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSec);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteHrFile(bucket: string, path: string) {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

/** Convert base64 data URL → Blob. Used for selfie capture. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(meta)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}