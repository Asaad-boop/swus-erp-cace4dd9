import type { CrmSegment } from "./types";

const DAY = 24 * 60 * 60 * 1000;

export function computeSegment(args: {
  validOrdersCount: number;
  lifetimeValue: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  metaStatus: string | null;
  vipThresholdLtv?: number;
}): CrmSegment {
  if (args.metaStatus === "blocked") return "blocked";
  if (args.metaStatus === "vip") return "vip";

  const now = Date.now();
  const last = args.lastOrderAt ? new Date(args.lastOrderAt).getTime() : 0;
  const first = args.firstOrderAt ? new Date(args.firstOrderAt).getTime() : 0;
  const daysSinceLast = last ? (now - last) / DAY : Infinity;
  const daysSinceFirst = first ? (now - first) / DAY : Infinity;

  if (args.validOrdersCount >= 5 || (args.vipThresholdLtv && args.lifetimeValue >= args.vipThresholdLtv)) {
    if (daysSinceLast <= 120) return "vip";
  }

  if (daysSinceLast > 120) return "lost";
  if (daysSinceLast > 60 && args.validOrdersCount >= 2) return "at_risk";

  if (daysSinceFirst < 30) return "new";
  if (args.validOrdersCount >= 2) return "repeat";
  return "one_time";
}

export const SEGMENT_LABELS: Record<CrmSegment, string> = {
  new: "New",
  one_time: "One-time",
  repeat: "Repeat",
  vip: "VIP",
  at_risk: "At risk",
  lost: "Lost",
  blocked: "Blocked",
};

export const SEGMENT_TONES: Record<CrmSegment, string> = {
  new: "bg-blue-100 text-blue-800 border-blue-200",
  one_time: "bg-slate-100 text-slate-700 border-slate-200",
  repeat: "bg-emerald-100 text-emerald-800 border-emerald-200",
  vip: "bg-amber-100 text-amber-800 border-amber-200",
  at_risk: "bg-orange-100 text-orange-800 border-orange-200",
  lost: "bg-red-100 text-red-700 border-red-200",
  blocked: "bg-zinc-900 text-zinc-100 border-zinc-700",
};