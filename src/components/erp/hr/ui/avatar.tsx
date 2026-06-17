import { cn } from "@/lib/utils";

interface Props {
  name?: string | null;
  src?: string | null;
  size?: 28 | 32 | 40 | 56 | 80;
  className?: string;
}

function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const sizeMap: Record<number, string> = {
  28: "h-7 w-7 text-[10px]",
  32: "h-8 w-8 text-xs",
  40: "h-10 w-10 text-sm",
  56: "h-14 w-14 text-base",
  80: "h-20 w-20 text-xl",
};

export function HrAvatar({ name, src, size = 40, className }: Props) {
  if (src) {
    return (
      <img
        src={src}
        alt={name ?? ""}
        className={cn("rounded-full object-cover ring-2 ring-white shadow-sm", sizeMap[size], className)}
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 text-indigo-700 font-semibold flex items-center justify-center ring-2 ring-white shadow-sm",
        sizeMap[size],
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}