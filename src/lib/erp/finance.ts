export type TxnType = "income" | "expense" | "transfer" | "adjustment";

export type Account = {
  id: string;
  brand_id: string;
  name: string;
  account_type: string;
  account_number: string | null;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
  notes: string | null;
};

export type Category = {
  id: string;
  brand_id: string;
  name: string;
  kind: string;
  is_active: boolean;
};

export type Transaction = {
  id: string;
  brand_id: string;
  txn_type: string;
  category_id: string | null;
  account_id: string | null;
  to_account_id: string | null;
  amount: number;
  reference_type: string | null;
  reference_id: string | null;
  supplier_id: string | null;
  description: string | null;
  transaction_date: string;
  created_at: string;
};

export const TXN_TYPE_LABEL: Record<string, { label: string; className: string }> = {
  income: { label: "Income", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  expense: { label: "Expense", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  transfer: { label: "Transfer", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  adjustment: { label: "Adjustment", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
};

export const ACCOUNT_TYPES = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "bkash", label: "bKash" },
  { value: "nagad", label: "Nagad" },
  { value: "rocket", label: "Rocket" },
  { value: "other", label: "Other" },
] as const;

export function fmtBdt(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return "৳" + v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function exportTransactionsCsv(
  rows: Transaction[],
  catMap: Map<string, string>,
  accMap: Map<string, string>,
): string {
  const headers = ["Date", "Type", "Category", "Account", "To Account", "Amount", "Reference", "Description"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const t of rows) {
    lines.push([
      t.transaction_date,
      t.txn_type,
      t.category_id ? catMap.get(t.category_id) ?? "" : "",
      t.account_id ? accMap.get(t.account_id) ?? "" : "",
      t.to_account_id ? accMap.get(t.to_account_id) ?? "" : "",
      t.amount,
      t.reference_type ?? "",
      t.description ?? "",
    ].map(esc).join(","));
  }
  return lines.join("\n");
}