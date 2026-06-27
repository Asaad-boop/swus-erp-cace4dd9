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
      for (const row of data as OrderLockRow[]) {
        if (now - new Date(row.last_heartbeat_at).getTime() <= STALE_MS) {
          m.set(row.order_id, row);
        }
      }
      setLocks(m);
    };
    load();

    const channel = supabase
      .channel(`order_locks:list:${key.slice(0, 32)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_locks" },
        (payload) => {
          const oldRow = payload.old as Partial<OrderLockRow> | null;
          const newRow = payload.new as OrderLockRow | null;
          const targetId = newRow?.order_id ?? oldRow?.order_id;
          if (!targetId || !orderIds.includes(targetId)) return;
          setLocks((prev) => {
            const next = new Map(prev);
            if (payload.eventType === "DELETE") {
              next.delete(targetId);
            } else if (newRow) {
              const fresh = Date.now() - new Date(newRow.last_heartbeat_at).getTime() <= STALE_MS;
              if (fresh) next.set(targetId, newRow);
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