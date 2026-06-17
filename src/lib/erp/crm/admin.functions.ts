import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertAdmin,
  normalizePhone,
  normalizeE164,
  sha256Hex,
  hmacSha256Hex,
  uuidSchema,
  customerKeySchema,
} from "./_shared";

/* =================== RFM RECALCULATE =================== */

export const recalculateRfm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string }) =>
    z.object({ brandId: uuidSchema.optional() }).parse(d ?? {}),
  )
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    // SQL function is global (all brands) — keep brandId param for future use
    const { error } = await context.supabase.rpc("calculate_rfm_all_brands");
    if (error) throw error;
    return { ok: true, calculated_at: new Date().toISOString() };
  });

/* =================== CUSTOM FIELD DEFS =================== */

const fieldTypeSchema = z.enum(["text", "number", "date", "toggle", "select", "url"]);

export const listCustomFieldDefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string }) =>
    z.object({ brandId: uuidSchema.optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    let q = context.supabase
      .from("crm_custom_field_definitions")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

function slugifyKey(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "field";
}

export const createCustomFieldDef = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        brandId: uuidSchema.nullable().optional(),
        label: z.string().min(1).max(80),
        fieldKey: z.string().max(40).optional(),
        fieldType: fieldTypeSchema.default("text"),
        options: z.array(z.string()).optional(),
        isRequired: z.boolean().default(false),
        sortOrder: z.number().int().default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const key = slugifyKey(data.fieldKey || data.label);
    const { data: row, error } = await context.supabase
      .from("crm_custom_field_definitions")
      .insert({
        brand_id: data.brandId ?? null,
        label: data.label,
        field_key: key,
        field_type: data.fieldType,
        options: data.options ? { values: data.options } : null,
        is_required: data.isRequired,
        sort_order: data.sortOrder,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const updateCustomFieldDef = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        id: uuidSchema,
        patch: z
          .object({
            label: z.string().min(1).max(80).optional(),
            fieldType: fieldTypeSchema.optional(),
            options: z.array(z.string()).optional(),
            isRequired: z.boolean().optional(),
            sortOrder: z.number().int().optional(),
          })
          .strict(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const patch: Record<string, any> = {};
    if (data.patch.label !== undefined) patch.label = data.patch.label;
    if (data.patch.fieldType !== undefined) patch.field_type = data.patch.fieldType;
    if (data.patch.options !== undefined)
      patch.options = { values: data.patch.options };
    if (data.patch.isRequired !== undefined) patch.is_required = data.patch.isRequired;
    if (data.patch.sortOrder !== undefined) patch.sort_order = data.patch.sortOrder;
    const { error } = await context.supabase
      .from("crm_custom_field_definitions")
      .update(patch as any)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCustomFieldDef = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: uuidSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("crm_custom_field_definitions")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const updateCustomerCustomFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerKey: string; fields: Record<string, any> }) =>
    z
      .object({
        customerKey: customerKeySchema,
        fields: z.record(z.string(), z.any()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const key = normalizePhone(data.customerKey) ?? data.customerKey;
    // Read existing then merge (primary wins on conflict on subsequent re-saves
    // is irrelevant here — caller posts the full latest set per request).
    const { error } = await context.supabase
      .from("crm_customer_meta")
      .upsert(
        {
          customer_key: key,
          custom_fields: data.fields,
          updated_by: context.userId,
        } as any,
        { onConflict: "customer_key" },
      );
    if (error) throw error;
    return { ok: true };
  });

/* =================== SAVED FILTERS =================== */

export const listSavedFilters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string }) =>
    z.object({ brandId: uuidSchema.optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    let q = context.supabase
      .from("crm_saved_filters")
      .select("*")
      .order("name", { ascending: true });
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const createSavedFilter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        brandId: uuidSchema.nullable().optional(),
        name: z.string().min(1).max(80),
        filters: z.record(z.string(), z.any()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("crm_saved_filters")
      .insert({
        brand_id: data.brandId ?? null,
        name: data.name,
        filters: data.filters,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const deleteSavedFilter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: uuidSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("crm_saved_filters")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* =================== DUPLICATES =================== */

/**
 * Finds potential duplicate customers (per brand or global).
 * Strategy:
 *  - Pulls non-merged customers from `crm_customers_v` (caps at 5000 for safety).
 *  - Groups by:
 *      a) Exact phone match (after normalization) — almost certain duplicate.
 *      b) Name similarity > 0.8 (Jaro-style trigram via plain JS — pg_trgm
 *         index exists for future server-side query; we compute in JS to
 *         work seamlessly with the view).
 */
function trigramSimilarity(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "");
  const tri = (s: string) => {
    const t = `  ${norm(s)} `;
    const out = new Set<string>();
    for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
    return out;
  };
  const A = tri(a);
  const B = tri(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((x) => B.has(x) && inter++);
  return inter / (A.size + B.size - inter);
}

export const findCrmDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string; threshold?: number; limit?: number }) =>
    z
      .object({
        brandId: uuidSchema.optional(),
        threshold: z.number().min(0.5).max(1).default(0.8),
        limit: z.number().int().min(1).max(5000).default(2000),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    let q = context.supabase
      .from("crm_customers_v")
      .select("customer_key, name, email, brand_ids, orders_count, lifetime_value, last_order_at")
      .limit(data.limit);
    if (data.brandId) q = q.overlaps("brand_ids", [data.brandId]);
    const { data: rows, error } = await q;
    if (error) throw error;

    // Filter out already merged
    const keys = (rows ?? []).map((r: any) => r.customer_key);
    const mergedSet = new Set<string>();
    if (keys.length) {
      const { data: merged } = await context.supabase
        .from("crm_customer_meta")
        .select("customer_key")
        .in("customer_key", keys)
        .eq("is_merged", true);
      (merged ?? []).forEach((m: any) => mergedSet.add(m.customer_key));
    }
    const active: any[] = (rows ?? []).filter((r: any) => r.customer_key && !mergedSet.has(r.customer_key));

    // Phone groups (same key would not happen post-normalization, so skip).
    // Group by name similarity.
    const groups: Array<{
      id: string;
      reason: string;
      members: any[];
    }> = [];
    const claimed = new Set<string>();
    for (let i = 0; i < active.length; i++) {
      const a = active[i];
      if (claimed.has(a.customer_key)) continue;
      if (!a.name || a.name.length < 3) continue;
      const bucket = [a];
      for (let j = i + 1; j < active.length; j++) {
        const b = active[j];
        if (claimed.has(b.customer_key)) continue;
        if (!b.name || b.name.length < 3) continue;
        const sim = trigramSimilarity(a.name, b.name);
        if (sim >= data.threshold) bucket.push(b);
      }
      if (bucket.length >= 2) {
        bucket.forEach((m) => claimed.add(m.customer_key));
        groups.push({
          id: a.customer_key,
          reason: `Name similarity ≥ ${(data.threshold * 100).toFixed(0)}%`,
          members: bucket,
        });
      }
    }
    return { groups, totalScanned: active.length };
  });

export const mergeCrmCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { primaryKey: string; duplicateKeys: string[] }) =>
    z
      .object({
        primaryKey: customerKeySchema,
        duplicateKeys: z.array(customerKeySchema).min(1).max(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const primary = normalizePhone(data.primaryKey) ?? data.primaryKey;
    const dupes = data.duplicateKeys
      .map((k) => normalizePhone(k) ?? k)
      .filter((k) => k !== primary);
    if (!dupes.length) return { ok: true, merged: 0 };

    // 1) Reassign activities + tasks + notes + tags → primary
    await context.supabase.from("crm_activities").update({ customer_key: primary } as any).in("customer_key", dupes);
    await context.supabase.from("crm_tasks").update({ customer_key: primary } as any).in("customer_key", dupes);
    await context.supabase.from("crm_customer_notes").update({ customer_key: primary } as any).in("customer_key", dupes);
    // Tags: upsert distinct
    const { data: dupTags } = await context.supabase
      .from("crm_customer_tags")
      .select("tag")
      .in("customer_key", dupes);
    const tagSet = Array.from(new Set((dupTags ?? []).map((t: any) => t.tag)));
    if (tagSet.length) {
      const rows = tagSet.map((tag) => ({
        customer_key: primary,
        tag,
        created_by: context.userId,
      }));
      await context.supabase
        .from("crm_customer_tags")
        .upsert(rows, { onConflict: "customer_key,tag" });
      await context.supabase.from("crm_customer_tags").delete().in("customer_key", dupes);
    }

    // 2) Merge custom_fields: primary wins on conflict
    const { data: metas } = await context.supabase
      .from("crm_customer_meta")
      .select("customer_key, custom_fields")
      .in("customer_key", [primary, ...dupes]);
    const primaryFields = ((metas ?? []).find((m: any) => m.customer_key === primary)?.custom_fields ?? {}) as Record<string, any>;
    let merged: Record<string, any> = {};
    (metas ?? [])
      .filter((m: any) => m.customer_key !== primary)
      .forEach((m: any) => {
        merged = { ...((m.custom_fields ?? {}) as Record<string, any>), ...merged };
      });
    const finalFields = { ...merged, ...primaryFields };

    await context.supabase
      .from("crm_customer_meta")
      .upsert(
        { customer_key: primary, custom_fields: finalFields, updated_by: context.userId } as any,
        { onConflict: "customer_key" },
      );

    // 3) Mark duplicates merged_into primary
    const dupeRows = dupes.map((k) => ({
      customer_key: k,
      is_merged: true,
      merged_into: primary,
      updated_by: context.userId,
    }));
    const { error: mergeErr } = await context.supabase
      .from("crm_customer_meta")
      .upsert(dupeRows as any, { onConflict: "customer_key" });
    if (mergeErr) throw mergeErr;

    return { ok: true, merged: dupes.length, primaryKey: primary };
  });

/* =================== META PUSH =================== */

const META_GRAPH_VERSION = "v19.0";

async function metaFetch(
  url: string,
  init: { method: "GET" | "POST"; body?: any; accessToken: string; appSecret?: string },
): Promise<any> {
  // Compute appsecret_proof when app secret available (recommended by Meta)
  let proof = "";
  if (init.appSecret) {
    proof = await hmacSha256Hex(init.appSecret, init.accessToken);
  }
  const u = new URL(url);
  u.searchParams.set("access_token", init.accessToken);
  if (proof) u.searchParams.set("appsecret_proof", proof);
  const res = await fetch(u.toString(), {
    method: init.method,
    headers: { "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const msg = json?.error?.message || `Meta API ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

export const pushSegmentToMetaAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        brandId: uuidSchema,
        adAccountId: uuidSchema,
        segment: z.string().min(1),
        audienceName: z.string().min(1).max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    // 1) Get ad account creds
    const { data: acct, error: acctErr } = await context.supabase
      .from("mkt_ad_accounts")
      .select("id, external_id, name, access_token, app_secret, brand_id")
      .eq("id", data.adAccountId)
      .maybeSingle();
    if (acctErr) throw acctErr;
    if (!acct) throw new Error("Ad account not found");
    if (!acct.access_token) throw new Error("Ad account missing access_token");
    if (acct.brand_id !== data.brandId) throw new Error("Ad account does not belong to brand");

    // 2) Get customer phones matching segment
    const { data: meta, error: metaErr } = await context.supabase
      .from("crm_customer_meta")
      .select("customer_key")
      .eq("rfm_segment", data.segment)
      .neq("is_merged", true);
    if (metaErr) throw metaErr;
    const keys = (meta ?? []).map((m: any) => m.customer_key);
    if (!keys.length) {
      return { ok: false, error: "No customers in segment", matched: 0 };
    }

    // Validate brand match via view
    const { data: viewRows } = await context.supabase
      .from("crm_customers_v")
      .select("customer_key, brand_ids")
      .in("customer_key", keys)
      .overlaps("brand_ids", [data.brandId]);
    const validKeys = (viewRows ?? []).map((r: any) => r.customer_key);
    if (!validKeys.length) {
      return { ok: false, error: "No segment customers belong to brand", matched: 0 };
    }

    // 3) Normalize + hash phones
    const hashed: string[] = [];
    for (const k of validKeys) {
      const e164 = normalizeE164(k);
      if (!e164) continue;
      hashed.push(await sha256Hex(e164));
    }
    if (!hashed.length) {
      return { ok: false, error: "No normalizable phones", matched: 0 };
    }

    const audienceName =
      data.audienceName || `CRM • ${data.segment} • ${new Date().toISOString().slice(0, 10)}`;

    // 4) Create custom audience
    const created = await metaFetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${acct.external_id}/customaudiences`,
      {
        method: "POST",
        accessToken: acct.access_token,
        appSecret: acct.app_secret ?? undefined,
        body: {
          name: audienceName,
          subtype: "CUSTOM",
          customer_file_source: "USER_PROVIDED_ONLY",
          description: `Auto-generated from CRM segment "${data.segment}"`,
        },
      },
    );
    const audienceId = created.id as string;

    // 5) Upload users (Meta caps batches ~10k; we send in chunks of 5000)
    const CHUNK = 5000;
    let uploaded = 0;
    for (let i = 0; i < hashed.length; i += CHUNK) {
      const slice = hashed.slice(i, i + CHUNK);
      await metaFetch(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/${audienceId}/users`,
        {
          method: "POST",
          accessToken: acct.access_token,
          appSecret: acct.app_secret ?? undefined,
          body: {
            payload: {
              schema: "PHONE",
              data: slice.map((h) => [h]),
            },
          },
        },
      );
      uploaded += slice.length;
    }

    return {
      ok: true,
      audienceId,
      audienceName,
      adAccount: acct.name,
      matched: hashed.length,
      uploaded,
    };
  });