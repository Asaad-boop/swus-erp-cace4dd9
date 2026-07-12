import { supabase } from "@/integrations/supabase/client";

/**
 * Stamp `orders.printed_at = now()` for the given ids the first time they are
 * printed. Called from every print entry point (BulkPrintDialog, BatchPrintDialog,
 * single-order detail page, dispatch reports) so the badge/filter stays consistent.
 *
 * - Only updates rows where printed_at IS NULL — first print wins (canonical timestamp).
 * - Fire-and-forget: failures are logged but never block the print dialog.
 */
export async function markOrdersPrinted(ids: string[]): Promise<void> {
  const clean = Array.from(new Set(ids.filter(Boolean)));
  if (clean.length === 0) return;
  try {
    const { error } = await supabase
      .from("orders")
      .update({ printed_at: new Date().toISOString() })
      .in("id", clean)
      .is("printed_at", null);
    if (error) console.warn("[markOrdersPrinted] failed:", error.message);
  } catch (e) {
    console.warn("[markOrdersPrinted] threw:", e);
  }
}