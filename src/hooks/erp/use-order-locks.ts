import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { OrderLockRow } from "./use-order-lock";

const STALE_MS = 90_000;

/**
 * Subscribe to order_locks for a set of orderIds and return a Map.
 * Stale locks (heartbeat older than STALE_MS) are filtered out.
 */
export function useOrderLocks(orderIds: string[]): Map<string, OrderLockRow> {
  const [locks, setLocks] = useState<Map<string, OrderLockRow>>(new Map());
  const key = orderIds.slice().sort().join(",");

  // Resolve missing user_name via profiles lookup, cached per user_id.
  const resolveName = async (rows: OrderLockRow[]): Promise<OrderLockRow[]> => {
    const missing = Array.from(new Set(rows.filter((r) => !r.user_name).map((r) => r.user_id)));
    if (!missing.length) return rows;
    const { data } = await supabase
      .from("profiles")
      .select("id,display_name,email")
      .in("id", missing);
    const map = new Map<string, string>();
    (data ?? []).forEach((p: any) => {
      map.set(p.id, p.display_name || p.email || "Staff");
    });
    return rows.map((r) => (r.user_name ? r : { ...r, user_name: map.get(r.user_id) ?? "Staff" }));
  };

  useEffect(() => {
    if (!orderIds.length) {
      setLocks(new Map());
      return;
    }
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("order_locks")
        .select("*")
        .in("order_id", orderIds);
      if (cancelled || !data) return;
      const m = new Map<string, OrderLockRow>();
      const now = Date.now();
      const fresh = (data as OrderLockRow[]).filter(
        (row) => now - new Date(row.last_heartbeat_at).getTime() <= STALE_MS,
      );
      const enriched = await resolveName(fresh);
      if (cancelled) return;
      for (const row of enriched) {
        m.set(row.order_id, row);
      }
      setLocks(m);
    };
    load();

    const channel = supabase
      .channel(`order_locks:list:${key.slice(0, 32)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_locks" },
        async (payload) => {
          const oldRow = payload.old as Partial<OrderLockRow> | null;
          const newRow = payload.new as OrderLockRow | null;
          const targetId = newRow?.order_id ?? oldRow?.order_id;
          if (!targetId || !orderIds.includes(targetId)) return;
          let resolved = newRow;
          if (newRow && !newRow.user_name) {
            const [r] = await resolveName([newRow]);
            resolved = r;
          }
          setLocks((prev) => {
            const next = new Map(prev);
            if (payload.eventType === "DELETE") {
              next.delete(targetId);
            } else if (resolved) {
              const isFresh = Date.now() - new Date(resolved.last_heartbeat_at).getTime() <= STALE_MS;
              if (isFresh) next.set(targetId, resolved);
              else next.delete(targetId);
            }
            return next;
          });
        },
      )
      .subscribe();

    // Periodic stale sweep
    const sweep = window.setInterval(() => {
      setLocks((prev) => {
        const now = Date.now();
        let changed = false;
        const next = new Map(prev);
        for (const [id, row] of prev) {
          if (now - new Date(row.last_heartbeat_at).getTime() > STALE_MS) {
            next.delete(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(sweep);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return locks;
}