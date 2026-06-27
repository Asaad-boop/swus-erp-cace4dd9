// Tier-based color classes for monetary amounts (BDT)
// Tiers: <5k slate · 5k-10k sky · 10k-50k emerald · 50k-1L amber · 1L+ violet/gold gradient
export function moneyTier(n: number): string {
  const v = Math.abs(Number(n) || 0);
  if (v >= 100000) return "text-foreground font-extrabold";
  if (v >= 50000) return "text-foreground font-bold";
  if (v >= 10000) return "text-foreground";
  if (v >= 5000) return "text-foreground/90";
  return "text-muted-foreground";
}