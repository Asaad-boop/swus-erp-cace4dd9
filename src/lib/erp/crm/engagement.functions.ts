import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, normalizePhone, uuidSchema, customerKeySchema } from "./_shared";

/* =================== ACTIVITIES =================== */

const activityTypeSchema = z.enum(["note", "call", "whatsapp", "email", "order", "tag", "task", "system"]);

export const listCrmActivities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerKey: string; limit?: number; offset?: number }) =>
    z
      .object({
        customerKey: customerKeySchema,
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const key = normalizePhone(data.customerKey) ?? data.customerKey;
    const { data: rows, error, count } = await context.supabase
      .from("crm_activities")
      .select("*", { count: "exact" })
      .eq("customer_key", key)
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw error;

    // Hydrate created_by names (best-effort)
    const userIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.created_by).filter(Boolean)),
    ) as string[];
    const nameMap = new Map<string, string>();
    if (userIds.length) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      (profiles ?? []).forEach((p: any) =>
        nameMap.set(p.id, p.full_name || p.email || "User"),
      );
    }
    return {
      rows: (rows ?? []).map((r: any) => ({
        ...r,
        created_by_name: r.created_by ? nameMap.get(r.created_by) ?? null : null,
      })),
      total: count ?? 0,
    };
  });

export const createCrmActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        customerKey: customerKeySchema,
        brandId: uuidSchema.nullable().optional(),
        type: activityTypeSchema,
        title: z.string().min(1).max(200),
        body: z.string().max(4000).optional().nullable(),
        direction: z.enum(["inbound", "outbound"]).optional().nullable(),
        durationSec: z.number().int().min(0).optional().nullable(),
        whatsappUrl: z.string().max(1000).optional().nullable(),
        metadata: z.record(z.string(), z.any()).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const key = normalizePhone(data.customerKey) ?? data.customerKey;
    const { data: row, error } = await context.supabase
      .from("crm_activities")
      .insert({
        customer_key: key,
        brand_id: data.brandId ?? null,
        type: data.type,
        title: data.title,
        body: data.body ?? null,
        direction: data.direction ?? null,
        duration_seconds: data.durationSec ?? null,
        whatsapp_url: data.whatsappUrl ?? null,
        metadata: data.metadata ?? {},
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const updateCrmActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; body?: string; title?: string }) =>
    z
      .object({
        id: uuidSchema,
        body: z.string().max(4000).optional(),
        title: z.string().min(1).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    // Allow owner OR any admin to edit (admin already asserted above).
    const patch: Record<string, any> = {};
    if (data.body !== undefined) patch.body = data.body;
    if (data.title !== undefined) patch.title = data.title;
    if (!Object.keys(patch).length) return { ok: true };
    const { error } = await context.supabase
      .from("crm_activities")
      .update(patch as any)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCrmActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: uuidSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("crm_activities")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* =================== TASKS =================== */

const prioritySchema = z.enum(["low", "normal", "high", "urgent"]);
const statusSchema = z.enum(["open", "in_progress", "completed", "snoozed", "cancelled"]);

export const listCrmTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        brandId: uuidSchema.optional(),
        customerKey: customerKeySchema.optional(),
        status: statusSchema.optional(),
        assignedTo: uuidSchema.optional(),
        dueBefore: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    let q = context.supabase.from("crm_tasks").select("*").limit(data.limit);
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    if (data.customerKey) {
      const k = normalizePhone(data.customerKey) ?? data.customerKey;
      q = q.eq("customer_key", k);
    }
    if (data.status) q = q.eq("status", data.status);
    if (data.assignedTo) q = q.eq("assigned_to", data.assignedTo);
    if (data.dueBefore) q = q.lt("due_date", data.dueBefore);
    q = q.order("due_date", { ascending: true, nullsFirst: false });
    const { data: rows, error } = await q;
    if (error) throw error;

    // Hydrate assignee + customer name (lightweight)
    const userIds = Array.from(
      new Set(
        (rows ?? []).flatMap((r: any) => [r.assigned_to, r.created_by]).filter(Boolean),
      ),
    ) as string[];
    const userMap = new Map<string, string>();
    if (userIds.length) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      (profiles ?? []).forEach((p: any) =>
        userMap.set(p.id, p.full_name || p.email || "User"),
      );
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      assigned_to_name: r.assigned_to ? userMap.get(r.assigned_to) ?? null : null,
      created_by_name: r.created_by ? userMap.get(r.created_by) ?? null : null,
    }));
  });

export const createCrmTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        customerKey: customerKeySchema,
        brandId: uuidSchema.nullable().optional(),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional().nullable(),
        dueDate: z.string().optional().nullable(),
        priority: prioritySchema.default("normal"),
        assignedTo: uuidSchema.nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const key = normalizePhone(data.customerKey) ?? data.customerKey;
    const { data: row, error } = await context.supabase
      .from("crm_tasks")
      .insert({
        customer_key: key,
        brand_id: data.brandId ?? null,
        title: data.title,
        description: data.description ?? null,
        due_date: data.dueDate ?? null,
        priority: data.priority,
        status: "open",
        assigned_to: data.assignedTo ?? null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const updateCrmTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        id: uuidSchema,
        patch: z
          .object({
            title: z.string().min(1).max(200).optional(),
            description: z.string().max(2000).nullable().optional(),
            dueDate: z.string().nullable().optional(),
            priority: prioritySchema.optional(),
            status: statusSchema.optional(),
            assignedTo: uuidSchema.nullable().optional(),
          })
          .strict(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const patch: Record<string, any> = {};
    const p = data.patch;
    if (p.title !== undefined) patch.title = p.title;
    if (p.description !== undefined) patch.description = p.description;
    if (p.dueDate !== undefined) patch.due_date = p.dueDate;
    if (p.priority !== undefined) patch.priority = p.priority;
    if (p.status !== undefined) patch.status = p.status;
    if (p.assignedTo !== undefined) patch.assigned_to = p.assignedTo;
    const { error } = await context.supabase
      .from("crm_tasks")
      .update(patch as any)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const completeCrmTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: uuidSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("crm_tasks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const snoozeCrmTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; newDueDate: string }) =>
    z.object({ id: uuidSchema, newDueDate: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("crm_tasks")
      .update({ status: "snoozed", due_date: data.newDueDate })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCrmTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: uuidSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("crm_tasks")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getOverdueCrmTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string; limit?: number }) =>
    z
      .object({
        brandId: uuidSchema.optional(),
        limit: z.number().int().min(1).max(50).default(10),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const now = new Date().toISOString();
    let q = context.supabase
      .from("crm_tasks")
      .select("id, customer_key, title, due_date, priority")
      .in("status", ["open", "in_progress", "snoozed"])
      .lt("due_date", now)
      .order("due_date", { ascending: true })
      .limit(data.limit);
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    const { data: rows, error } = await q;
    if (error) throw error;

    // Also return total count for dashboard widget
    let countQ = context.supabase
      .from("crm_tasks")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "in_progress", "snoozed"])
      .lt("due_date", now);
    if (data.brandId) countQ = countQ.eq("brand_id", data.brandId);
    const { count } = await countQ;
    return { rows: rows ?? [], total: count ?? 0 };
  });