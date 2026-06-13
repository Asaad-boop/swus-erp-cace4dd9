import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Account, Category, Transaction } from "@/lib/erp/finance";

export function useAccounts(brandId: string | null) {
  return useQuery({
    queryKey: ["erp_accounts", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_accounts")
        .select("id,brand_id,name,account_type,account_number,opening_balance,current_balance,is_active,notes")
        .eq("brand_id", brandId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Account[];
    },
  });
}

export function useCategories(brandId: string | null) {
  return useQuery({
    queryKey: ["erp_categories", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_expense_categories")
        .select("id,brand_id,name,kind,is_active")
        .eq("brand_id", brandId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });
}

export type TxnFilter = {
  brandId: string | null;
  type: "all" | "income" | "expense" | "transfer" | "adjustment";
  accountId: string | null;
  from: string | null;
  to: string | null;
  search: string;
  limit: number;
};

export function useTransactions(filter: TxnFilter) {
  return useQuery({
    queryKey: ["erp_transactions", filter],
    enabled: !!filter.brandId,
    queryFn: async () => {
      let q = supabase
        .from("erp_transactions")
        .select("id,brand_id,txn_type,category_id,account_id,to_account_id,amount,reference_type,reference_id,supplier_id,description,transaction_date,created_at")
        .eq("brand_id", filter.brandId!)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(filter.limit);
      if (filter.type !== "all") q = q.eq("txn_type", filter.type);
      if (filter.accountId) q = q.or(`account_id.eq.${filter.accountId},to_account_id.eq.${filter.accountId}`);
      if (filter.from) q = q.gte("transaction_date", filter.from);
      if (filter.to) q = q.lte("transaction_date", filter.to);
      if (filter.search.trim()) q = q.ilike("description", `%${filter.search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Transaction[];
    },
  });
}

export type PnL = {
  revenue: number;
  delivered_orders: number;
  other_income: number;
  expense_total: number;
  expense_by_category: Record<string, number>;
  profit: number;
};

export function useProfitLoss(brandId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ["erp_pnl", brandId, from, to],
    enabled: !!brandId && !!from && !!to,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("erp_profit_loss", {
        _brand_id: brandId!,
        _from: from,
        _to: to,
      });
      if (error) throw error;
      return data as unknown as PnL;
    },
  });
}