// Tier-based color classes for monetary amounts (BDT)
// Tiers: <5k slate · 5k-10k sky · 10k-50k emerald · 50k-1L amber · 1L+ violet/gold gradient
export function moneyTier(n: number): string {
  const v = Math.abs(Number(n) || 0);
  if (v >= 100000) return "bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400 bg-clip-text text-transparent drop-shadow-sm";
  if (v >= 50000) return "text-amber-600 dark:text-amber-400";
  if (v >= 10000) return "text-emerald-600 dark:text-emerald-400";
  if (v >= 5000) return "text-sky-600 dark:text-sky-400";
  return "text-slate-700 dark:text-slate-200";
}