import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  brandIds: z.array(z.string().uuid()).min(1),
  from: z.string(),
  to: z.string(),
});

const num = (v: unknown) => Number(v ?? 0) || 0;
const sum = <T>(arr: T[] | null | undefined, pick: (x: T) => number) =>
  (arr ?? []).reduce((s, x) => s + pick(x), 0);

export type FinanceOverview = {
  range: { from: string; to: string };
  capital: {
    total: number;
    liquid: number;
    inventory: number;
    receivableNet: number;
    breakdown: {
      cash: number; bank: number; mfs: number; inventory: number;
      codReceivable: number; arDue: number; importsAdvance: number;
      supplierPayable: number; importsDue: number; billsPayable: number;
    };
    productsMissingCost: number;
  };
  pnl: {
    revenue: number; cogs: number; gross: number;
    expense: number; otherIncome: number; net: number; margin: number;
    refundLoss: number;
    dailySeries: { date: string; revenue: number; expense: number; net: number }[];
  };
  accounts: { id: string; name: string; type: string; balance: number }[];
  inventoryByBrand: { brand_id: string; brand: string; value: number; units: number }[];
  receivables: {
    codByCourier: { provider: string; amount: number; orders: number }[];
    arTop: { name: string; phone: string | null; amount: number; orders: number }[];
    importsAdvanceTop: { po: string; supplier: string; amount: number }[];
  };
  payables: {
    supplierTop: { name: string; due: number }[];
    importsDueTop: { po: string; supplier: string; due: number; status: string }[];
    upcomingRecurring: { id: string; name: string; amount: number; next_run: string }[];
    topExpenseCats: { name: string; amount: number }[];
    overdueBills: number;
  };
  monthlySeries: { month: string; revenue: number; expense: number; net: number }[];
  recentTxns: { id: string; date: string; type: string; amount: number; description: string | null; account: string | null; category: string | null }[];
};

export const getFinanceOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<FinanceOverview> => {
    const { supabase } = context;
    const { brandIds, from, to } = data;
    const fromTs = `${from}T00:00:00`;
    const toTs = `${to}T23:59:59.999`;

    // 12-month range for monthly series
    const now = new Date();
    const twelveStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const twelveIso = twelveStart.toISOString().slice(0, 10);

    // Daily P&L window (last 30 days inside range OR the range itself if smaller)
    const dailyStart = from;
    const dailyEnd = to;

    const [
      brandsRes, accRes, prodRes, varRes,
      rangeOrdRes, refundOrdRes, codOrdRes, arOrdRes,
      txnRes, recentRes, catsRes,
      billsRes, supplierRes,
      poRes, supForPoRes, recurringRes,
      monthlyOrdRes, monthlyTxnRes,
      dailyOrdRes, dailyTxnRes,
    ] = await Promise.all([
      supabase.from("brands").select("id,name").in("id", brandIds),
      supabase.from("erp_accounts").select("id,name,account_type,current_balance,brand_id").eq("is_active", true).in("brand_id", brandIds).order("current_balance", { ascending: false }),
      supabase.from("products").select("id,brand_id,stock,cost_price,price").in("brand_id", brandIds),
      supabase.from("product_variants").select("product_id,stock"),
      supabase.from("orders").select("total,subtotal,created_at").in("status", ["delivered", "partial_delivered", "paid"]).in("brand_id", brandIds).gte("created_at", fromTs).lte("created_at", toTs),
      supabase.from("orders").select("total").in("status", ["returned", "paid_return", "unpaid_return", "partial_return"]).in("brand_id", brandIds).gte("created_at", fromTs).lte("created_at", toTs),
      supabase.from("orders").select("total,id,courier_shipments!inner(provider)").in("status", ["shipped", "delivered", "partial_delivered"]).in("brand_id", brandIds),
      supabase.from("orders").select("id,total,customer_name,customer_phone").in("status", ["delivered", "partial_delivered"]).eq("payment_status", "unpaid").in("brand_id", brandIds).limit(1000),
      supabase.from("erp_transactions").select("id,txn_type,amount,category_id,transaction_date,account_id").in("brand_id", brandIds).gte("transaction_date", from).lte("transaction_date", to),
      supabase.from("erp_transactions").select("id,txn_type,amount,transaction_date,description,category_id,account_id").in("brand_id", brandIds).order("transaction_date", { ascending: false }).order("created_at", { ascending: false }).limit(10),
      supabase.from("erp_expense_categories").select("id,name").in("brand_id", brandIds),
      supabase.from("erp_bills").select("amount,paid_amount,supplier_id,due_date,status").in("brand_id", brandIds).in("status", ["open", "partial", "overdue"]),
      supabase.from("erp_suppliers").select("id,name").in("brand_id", brandIds),
      supabase.from("imp_purchase_orders").select("id,po_number,supplier_id,grand_total_bdt,paid_bdt,due_bdt,status").in("brand_id", brandIds),
      supabase.from("erp_suppliers").select("id,name").in("brand_id", brandIds),
      supabase.from("erp_recurring_rules").select("id,name,amount,next_run_date").eq("is_active", true).in("brand_id", brandIds).order("next_run_date", { ascending: true }).limit(20),
      supabase.from("orders").select("total,created_at").in("status", ["delivered", "partial_delivered", "paid"]).in("brand_id", brandIds).gte("created_at", `${twelveIso}T00:00:00`),
      supabase.from("erp_transactions").select("amount,transaction_date,txn_type").in("brand_id", brandIds).gte("transaction_date", twelveIso),
      supabase.from("orders").select("total,created_at").in("status", ["delivered", "partial_delivered", "paid"]).in("brand_id", brandIds).gte("created_at", `${dailyStart}T00:00:00`).lte("created_at", `${dailyEnd}T23:59:59.999`),
      supabase.from("erp_transactions").select("amount,transaction_date,txn_type").in("brand_id", brandIds).gte("transaction_date", dailyStart).lte("transaction_date", dailyEnd),
    ]);

    // Brand map
    const brandMap = new Map((brandsRes.data ?? []).map((b) => [b.id as string, b.name as string]));

    // Accounts
    const accounts = (accRes.data ?? []).map((a) => ({
      id: a.id as string,
      name: a.name as string,
      type: a.account_type as string,
      balance: num(a.current_balance),
    }));
    const accMap = new Map(accounts.map((a) => [a.id, a]));
    const cash = accounts.filter((a) => a.type === "cash").reduce((s, a) => s + a.balance, 0);
    const bank = accounts.filter((a) => a.type === "bank").reduce((s, a) => s + a.balance, 0);
    const mfs = accounts.filter((a) => ["bkash", "nagad", "rocket", "mfs"].includes(a.type)).reduce((s, a) => s + a.balance, 0);

    // Inventory valuation (products use product.stock; variants stock summed under their parent product cost)
    const variantsByProduct = new Map<string, number>();
    for (const v of (varRes.data ?? []) as { product_id: string; stock: number | null }[]) {
      variantsByProduct.set(v.product_id, (variantsByProduct.get(v.product_id) ?? 0) + num(v.stock));
    }
    let productsMissingCost = 0;
    const inventoryByBrand = new Map<string, { value: number; units: number }>();
    for (const p of (prodRes.data ?? []) as { id: string; brand_id: string | null; stock: number | null; cost_price: number | null }[]) {
      const variantStock = variantsByProduct.get(p.id) ?? 0;
      const totalStock = num(p.stock) + variantStock;
      const cost = num(p.cost_price);
      if (cost <= 0 && totalStock > 0) productsMissingCost += 1;
      const bid = p.brand_id ?? "unknown";
      const cur = inventoryByBrand.get(bid) ?? { value: 0, units: 0 };
      cur.value += cost * totalStock;
      cur.units += totalStock;
      inventoryByBrand.set(bid, cur);
    }
    const inventoryByBrandArr = Array.from(inventoryByBrand.entries())
      .map(([brand_id, v]) => ({ brand_id, brand: brandMap.get(brand_id) ?? "Unknown", value: v.value, units: v.units }))
      .sort((a, b) => b.value - a.value);
    const inventoryValue = inventoryByBrandArr.reduce((s, x) => s + x.value, 0);

    // Revenue / refunds
    const revenue = sum(rangeOrdRes.data as { total: number }[] | null, (x) => num(x.total));
    const refundLoss = sum(refundOrdRes.data as { total: number }[] | null, (x) => num(x.total));

    // COD receivable by courier
    const codByCourier = new Map<string, { amount: number; orders: number }>();
    let codReceivable = 0;
    for (const r of (codOrdRes.data ?? []) as { total: number; courier_shipments: { provider: string }[] | null }[]) {
      const provider = r.courier_shipments?.[0]?.provider ?? "unknown";
      const cur = codByCourier.get(provider) ?? { amount: 0, orders: 0 };
      cur.amount += num(r.total);
      cur.orders += 1;
      codByCourier.set(provider, cur);
      codReceivable += num(r.total);
    }
    const codByCourierArr = Array.from(codByCourier.entries())
      .map(([provider, v]) => ({ provider, ...v }))
      .sort((a, b) => b.amount - a.amount);

    // AR top (by phone/customer aggregate)
    const arMap = new Map<string, { name: string; phone: string | null; amount: number; orders: number }>();
    let arDue = 0;
    for (const o of (arOrdRes.data ?? []) as { total: number; customer_name: string | null; customer_phone: string | null }[]) {
      const key = (o.customer_phone || o.customer_name || "Unknown").toString();
      const cur = arMap.get(key) ?? { name: o.customer_name ?? "Unknown", phone: o.customer_phone, amount: 0, orders: 0 };
      cur.amount += num(o.total);
      cur.orders += 1;
      arMap.set(key, cur);
      arDue += num(o.total);
    }
    const arTop = Array.from(arMap.values()).sort((a, b) => b.amount - a.amount).slice(0, 5);

    // Transactions in range
    const txns = (txnRes.data ?? []) as { id: string; txn_type: string; amount: number; category_id: string | null; transaction_date: string; account_id: string | null }[];
    const expense = txns.filter((t) => t.txn_type === "expense").reduce((s, t) => s + num(t.amount), 0);
    const otherIncome = txns.filter((t) => t.txn_type === "income").reduce((s, t) => s + num(t.amount), 0);

    // Top expense categories
    const catMap = new Map((catsRes.data ?? []).map((c) => [c.id as string, c.name as string]));
    const expByCat = new Map<string, number>();
    for (const t of txns) {
      if (t.txn_type !== "expense") continue;
      const name = (t.category_id && catMap.get(t.category_id)) || "Uncategorized";
      expByCat.set(name, (expByCat.get(name) ?? 0) + num(t.amount));
    }
    const topExpenseCats = Array.from(expByCat.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // Supplier payable from bills
    const supMap = new Map((supplierRes.data ?? []).map((s) => [s.id as string, s.name as string]));
    const supPayMap = new Map<string, number>();
    let supplierPayable = 0;
    let overdueBills = 0;
    const todayIso = new Date().toISOString().slice(0, 10);
    for (const b of (billsRes.data ?? []) as { amount: number; paid_amount: number | null; supplier_id: string | null; due_date: string | null; status: string }[]) {
      const due = num(b.amount) - num(b.paid_amount);
      if (due <= 0) continue;
      supplierPayable += due;
      if (b.due_date && b.due_date < todayIso) overdueBills += due;
      if (b.supplier_id) {
        supPayMap.set(b.supplier_id, (supPayMap.get(b.supplier_id) ?? 0) + due);
      }
    }
    const supplierTop = Array.from(supPayMap.entries())
      .map(([id, due]) => ({ name: supMap.get(id) ?? "Unknown", due }))
      .sort((a, b) => b.due - a.due)
      .slice(0, 5);

    // Imports advance & due
    const supForPoMap = new Map((supForPoRes.data ?? []).map((s) => [s.id as string, s.name as string]));
    let importsAdvance = 0;
    let importsDueTotal = 0;
    const importsAdvanceList: { po: string; supplier: string; amount: number }[] = [];
    const importsDueList: { po: string; supplier: string; due: number; status: string }[] = [];
    for (const p of (poRes.data ?? []) as { po_number: string; supplier_id: string | null; grand_total_bdt: number; paid_bdt: number | null; due_bdt: number | null; status: string }[]) {
      const paid = num(p.paid_bdt);
      const due = num(p.due_bdt) > 0 ? num(p.due_bdt) : Math.max(num(p.grand_total_bdt) - paid, 0);
      const supplier = supForPoMap.get(p.supplier_id ?? "") ?? "Unknown";
      const notReceived = !["received", "completed", "closed"].includes(p.status);
      if (notReceived && paid > 0) {
        importsAdvance += paid;
        importsAdvanceList.push({ po: p.po_number, supplier, amount: paid });
      }
      if (due > 0) {
        importsDueTotal += due;
        importsDueList.push({ po: p.po_number, supplier, due, status: p.status });
      }
    }
    const importsAdvanceTop = importsAdvanceList.sort((a, b) => b.amount - a.amount).slice(0, 5);
    const importsDueTop = importsDueList.sort((a, b) => b.due - a.due).slice(0, 5);

    // Upcoming recurring (next 30 days)
    const thirty = new Date(); thirty.setDate(thirty.getDate() + 30);
    const thirtyIso = thirty.toISOString().slice(0, 10);
    const upcomingRecurring = ((recurringRes.data ?? []) as { id: string; name: string; amount: number; next_run_date: string | null }[])
      .filter((r) => r.next_run_date && r.next_run_date <= thirtyIso)
      .map((r) => ({ id: r.id, name: r.name, amount: num(r.amount), next_run: r.next_run_date! }));

    // Monthly series (12 mo)
    const months: { month: string; revenue: number; expense: number; net: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, revenue: 0, expense: 0, net: 0 });
    }
    const monthIdx = new Map(months.map((m, i) => [m.month, i]));
    for (const o of (monthlyOrdRes.data ?? []) as { total: number; created_at: string }[]) {
      const i = monthIdx.get(o.created_at.slice(0, 7));
      if (i != null) months[i].revenue += num(o.total);
    }
    for (const t of (monthlyTxnRes.data ?? []) as { amount: number; transaction_date: string; txn_type: string }[]) {
      if (t.txn_type !== "expense") continue;
      const i = monthIdx.get(t.transaction_date.slice(0, 7));
      if (i != null) months[i].expense += num(t.amount);
    }
    for (const m of months) m.net = m.revenue - m.expense;

    // Daily P&L series within selected range
    const dailyMap = new Map<string, { revenue: number; expense: number }>();
    const startD = new Date(dailyStart);
    const endD = new Date(dailyEnd);
    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
      dailyMap.set(d.toISOString().slice(0, 10), { revenue: 0, expense: 0 });
    }
    for (const o of (dailyOrdRes.data ?? []) as { total: number; created_at: string }[]) {
      const k = o.created_at.slice(0, 10);
      const cur = dailyMap.get(k); if (cur) cur.revenue += num(o.total);
    }
    for (const t of (dailyTxnRes.data ?? []) as { amount: number; transaction_date: string; txn_type: string }[]) {
      if (t.txn_type !== "expense") continue;
      const cur = dailyMap.get(t.transaction_date); if (cur) cur.expense += num(t.amount);
    }
    const dailySeries = Array.from(dailyMap.entries()).map(([date, v]) => ({ date, revenue: v.revenue, expense: v.expense, net: v.revenue - v.expense }));

    // COGS = sum of cost_price * units for delivered range. Approx via revenue * average cost ratio is unreliable; skip if unavailable.
    // Heuristic: assume COGS = inventory cost / inventory price ratio * revenue (only if products have cost). Otherwise 0.
    let cogs = 0;
    {
      const prods = (prodRes.data ?? []) as { cost_price: number | null; price: number | null }[];
      const totalCost = prods.reduce((s, p) => s + num(p.cost_price), 0);
      const totalPrice = prods.reduce((s, p) => s + num(p.price), 0);
      const ratio = totalPrice > 0 ? totalCost / totalPrice : 0;
      cogs = revenue * ratio;
    }
    const gross = revenue - cogs;
    const net = revenue + otherIncome - expense - cogs;
    const margin = revenue > 0 ? (net / revenue) * 100 : 0;

    // Recent transactions
    const recentTxns = ((recentRes.data ?? []) as { id: string; txn_type: string; amount: number; transaction_date: string; description: string | null; category_id: string | null; account_id: string | null }[]).map((t) => ({
      id: t.id,
      date: t.transaction_date,
      type: t.txn_type,
      amount: num(t.amount),
      description: t.description,
      account: t.account_id ? accMap.get(t.account_id)?.name ?? null : null,
      category: t.category_id ? catMap.get(t.category_id) ?? null : null,
    }));

    const liquid = cash + bank + mfs;
    const receivableNet = codReceivable + arDue + importsAdvance - supplierPayable - importsDueTotal;
    const totalCapital = liquid + inventoryValue + codReceivable + arDue + importsAdvance - supplierPayable - importsDueTotal;

    return {
      range: { from, to },
      capital: {
        total: totalCapital,
        liquid,
        inventory: inventoryValue,
        receivableNet,
        breakdown: {
          cash, bank, mfs, inventory: inventoryValue,
          codReceivable, arDue, importsAdvance,
          supplierPayable, importsDue: importsDueTotal, billsPayable: supplierPayable,
        },
        productsMissingCost,
      },
      pnl: {
        revenue, cogs, gross, expense, otherIncome, net, margin, refundLoss,
        dailySeries,
      },
      accounts,
      inventoryByBrand: inventoryByBrandArr,
      receivables: { codByCourier: codByCourierArr, arTop, importsAdvanceTop },
      payables: { supplierTop, importsDueTop, upcomingRecurring, topExpenseCats, overdueBills },
      monthlySeries: months,
      recentTxns,
    };
  });
