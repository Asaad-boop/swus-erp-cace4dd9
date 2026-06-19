// Bangladesh MFS (Mobile Financial Service) charge helpers.
// Rates are indicative public retail rates (as of 2025) — used to *suggest*
// charges on transfers. Always treat as an editable suggestion, not a quote.

export type MfsProvider = "bkash" | "nagad" | "rocket";
export type MfsTxType = "send_money" | "cash_out_agent" | "cash_out_atm" | "payment";

type RateFn = (amount: number) => number;

const RATES: Record<MfsProvider, Partial<Record<MfsTxType, RateFn>>> = {
  bkash: {
    // Send Money: ৳5 flat (up to certain limits)
    send_money: () => 5,
    // Cash Out (agent, priyo number): 1.85% (≈ ৳18.50 per 1000)
    cash_out_agent: (a) => +(a * 0.0185).toFixed(2),
    // Cash Out (ATM): 1.49% (≈ ৳14.90 per 1000)
    cash_out_atm: (a) => +(a * 0.0149).toFixed(2),
    // Payment: usually 0
    payment: () => 0,
  },
  nagad: {
    send_money: () => 5,
    // Cash Out (regular): 1.45%
    cash_out_agent: (a) => +(a * 0.0145).toFixed(2),
    cash_out_atm: (a) => +(a * 0.0125).toFixed(2),
    payment: () => 0,
  },
  rocket: {
    send_money: () => 5,
    // Cash Out: 1.80%
    cash_out_agent: (a) => +(a * 0.018).toFixed(2),
    cash_out_atm: (a) => +(a * 0.018).toFixed(2),
    payment: () => 0,
  },
};

export function calcMfsCharge(amount: number, provider: MfsProvider, type: MfsTxType): number {
  const fn = RATES[provider]?.[type];
  if (!fn || !amount || amount <= 0) return 0;
  return fn(amount);
}

export function mfsChargeLabel(provider: MfsProvider, type: MfsTxType): string {
  const map: Record<MfsTxType, string> = {
    send_money: "Send Money fee",
    cash_out_agent: "Cash-out (agent) fee",
    cash_out_atm: "Cash-out (ATM) fee",
    payment: "Payment fee",
  };
  return `${provider.toUpperCase()} · ${map[type]}`;
}

export const MFS_TYPE_OPTIONS: Array<{ value: MfsTxType; label: string }> = [
  { value: "send_money", label: "Send Money" },
  { value: "cash_out_agent", label: "Cash Out (Agent)" },
  { value: "cash_out_atm", label: "Cash Out (ATM)" },
  { value: "payment", label: "Payment" },
];

export function isMfsSubtype(s: string | null | undefined): s is MfsProvider {
  return s === "bkash" || s === "nagad" || s === "rocket";
}