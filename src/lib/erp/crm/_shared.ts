import { z } from "zod";

export async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw error;
  if (!data) throw new Error("Admin only");
}

export function normalizePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  if (!digits.length) return null;
  return digits.slice(-11);
}

/**
 * Bangladesh-aware E.164 normalization for Meta upload.
 * Returns null if cannot resolve to >= 10 digits.
 */
export function normalizeE164(p: string | null | undefined): string | null {
  if (!p) return null;
  let s = p.replace(/[\s\-()]/g, "").trim();
  if (!s) return null;
  if (s.startsWith("+")) s = s.slice(1);
  s = s.replace(/\D/g, "");
  if (!s) return null;
  // BD: 11-digit starting with 01 → prepend 880
  if (s.length === 11 && s.startsWith("01")) s = "880" + s.slice(1);
  // BD: 10-digit starting with 1 → prepend 880
  else if (s.length === 10 && s.startsWith("1")) s = "880" + s;
  if (s.length < 10) return null;
  return s;
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input.toLowerCase().trim());
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const uuidSchema = z.string().uuid();
export const customerKeySchema = z.string().min(1).max(40);