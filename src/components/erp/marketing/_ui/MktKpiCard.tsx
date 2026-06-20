import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from "lucide-react";

type Tone = "good" | "bad" | "neutral" | "brand";

export function MktKpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  trend,
  trendValue,
  onClick,
  active,
  className,
}: {
  icon?: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  tone?: Tone;
  trend?: "up" | "down" | "flat";
  trendValue?: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}) {
  const valueTone =
    tone === "good"
      ? "text-emerald-600"
      : tone === "bad"
        ? "text-red-600"
        : tone === "brand"
          ? "text-[#1877F2]"
          : "text-foreground";
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-600" : "text-muted-foreground";

  const Wrapper: any = onClick ? "button" : "div";

  return (
    <Card
      className={cn(
        "rounded-xl border border-gray-100 shadow-sm transition-all duration-150",
        onClick && "cursor-pointer hover:shadow-md hover:-translate-y-px",
        active && "ring-2 ring-[#1877F2] border-[#1877F2]/40",
        className,
      )}
    >
      <Wrapper
        type={onClick ? "button" : undefined}
        onClick={onClick}
        className="block w-full text-left"
      >
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
            {Icon && (
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#1877F2]/8 text-[#1877F2]">
                <Icon className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
          <div className={cn("text-2xl font-bold tabular-nums leading-tight", valueTone)}>
            {value}
          </div>
          <div className="flex items-center gap-2 mt-1.5 min-h-[16px]">
            {sub && <span className="text-xs text-muted-foreground truncate">{sub}</span>}
            {trend && trendValue && (
              <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium", trendColor)}>
                <TrendIcon className="h-3 w-3" />
                {trendValue}
              </span>
            )}
          </div>
        </CardContent>
      </Wrapper>
    </Card>
  );
}