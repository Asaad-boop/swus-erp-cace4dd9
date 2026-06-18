export type LocalPoStatus = "draft" | "sent" | "partial" | "received" | "cancelled";

export const LOCAL_PO_STATUS: Record<LocalPoStatus, { label: string; tone: string }> = {
  draft:     { label: "Draft",     tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  sent:      { label: "Sent",      tone: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  partial:   { label: "Partial",   tone: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  received:  { label: "Received",  tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  cancelled: { label: "Cancelled", tone: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
};

export const fmtBdt = (n: number) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(n || 0);

export const newIdemKey = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;