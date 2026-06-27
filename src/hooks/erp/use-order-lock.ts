import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Cooperative order locking — single-editor enforcement for the web orders queue.
 *
 * Lock is considered "stale" if last_heartbeat_at is older than STALE_MS.
 * Holder heartbeats every HEARTBEAT_MS. Realtime fires on insert/update/delete.
 */
const HEARTBEAT_MS = 25_000;
const STALE_MS = 90_000;

export type OrderLockRow = {
  order_id: string;
  user_id: string;
  user_name: string | null;
  acquired_at: string;
  last_heartbeat_at: string;
};

export type OrderLockState = {
  loading: boolean;
  lock: OrderLockRow | null;
  isMine: boolean;
  isStale: boolean;
  heldByOther: boolean;
  takeOver: () => Promise<void>;
  release: () => Promise<void>;
};

export function useOrderLock(orderId: string | null): OrderLockState {
  const [lock, setLock] = useState<OrderLockRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myName, setMyName] = useState<string | null>(null);
  const ownedRef = useRef(false);

  // Load identity once.
  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u || cancel) return;
      setMyUserId(u.id);
      const { data: p } = await supabase
        .from("profiles")
        .select("display_name,email")
        .eq("id", u.id)
        .maybeSingle();
      if (cancel) return;
      setMyName((p?.display_name as string | null) ?? (p?.email as string | null) ?? u.email ?? "Staff");
    })();
    return () => { cancel = true; };
  }, []);

  const fetchLock = useCallback(async (oid: string) => {
    const { data } = await supabase
      .from("order_locks")
      .select("*")
      .eq("order_id", oid)
      .maybeSingle();
    return (data ?? null) as OrderLockRow | null;
  }, []);

  const acquire = useCallback(async (oid: string) => {
    if (!myUserId) return;
    const existing = await fetchLock(oid);
    const stale = existing && Date.now() - new Date(existing.last_heartbeat_at).getTime() > STALE_MS;
    if (existing && existing.user_id !== myUserId && !stale) {
      setLock(existing);
      ownedRef.current = false;
      return;
    }
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("order_locks")
      .upsert(
        { order_id: oid, user_id: myUserId, user_name: myName, acquired_at: now, last_heartbeat_at: now },
        { onConflict: "order_id" },
      )
      .select()
      .single();
    if (!error && data) {
      setLock(data as OrderLockRow);
      ownedRef.current = (data as OrderLockRow).user_id === myUserId;
    }
  }, [myUserId, myName, fetchLock]);

  // Acquire + subscribe + heartbeat.
  useEffect(() => {
    if (!orderId || !myUserId) {
      setLock(null);
      ownedRef.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      await acquire(orderId);
      if (!cancelled) setLoading(false);
    })();

    const channel = supabase
      .channel(`order_lock:${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_locks", filter: `order_id=eq.${orderId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setLock(null);
            ownedRef.current = false;
            return;
          }
          const row = payload.new as OrderLockRow;
          setLock(row);
          ownedRef.current = row.user_id === myUserId;
        },
      )
      .subscribe();

    const heartbeat = window.setInterval(async () => {
      if (!ownedRef.current) return;
      await supabase
        .from("order_locks")
        .update({ last_heartbeat_at: new Date().toISOString() })
        .eq("order_id", orderId)
        .eq("user_id", myUserId);
    }, HEARTBEAT_MS);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeat);
      supabase.removeChannel(channel);
      // Best-effort release if we owned it.
      if (ownedRef.current) {
        supabase.from("order_locks").delete().eq("order_id", orderId).eq("user_id", myUserId).then(() => undefined);
      }
      ownedRef.current = false;
    };
  }, [orderId, myUserId, acquire]);

  const takeOver = useCallback(async () => {
    if (!orderId || !myUserId) return;
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("order_locks")
      .upsert(
        { order_id: orderId, user_id: myUserId, user_name: myName, acquired_at: now, last_heartbeat_at: now },
        { onConflict: "order_id" },
      )
      .select()
      .single();
    if (!error && data) {
      setLock(data as OrderLockRow);
      ownedRef.current = true;
    }
  }, [orderId, myUserId, myName]);

  const release = useCallback(async () => {
    if (!orderId || !myUserId || !ownedRef.current) return;
    await supabase.from("order_locks").delete().eq("order_id", orderId).eq("user_id", myUserId);
    ownedRef.current = false;
    setLock(null);
  }, [orderId, myUserId]);

  const isMine = !!lock && !!myUserId && lock.user_id === myUserId;
  const isStale = !!lock && Date.now() - new Date(lock.last_heartbeat_at).getTime() > STALE_MS;
  const heldByOther = !!lock && !isMine && !isStale;

  return { loading, lock, isMine, isStale, heldByOther, takeOver, release };
}