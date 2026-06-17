import { cn } from "@/lib/utils";

export function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn("bg-gray-100 rounded animate-pulse", className)} />;
}

export function SkeletonCard({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3", className)}>
      <SkeletonLine className="h-4 w-1/3" />
      <SkeletonLine className="h-8 w-1/2" />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonLine key={i} className="h-3 w-full" />
      ))}
    </div>
  );
}

export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <div className="flex gap-4 py-4 px-4 border-b border-gray-50">
      {Array.from({ length: cols }).map((_, i) => (
        <SkeletonLine key={i} className="h-4 flex-1" />
      ))}
    </div>
  );
}