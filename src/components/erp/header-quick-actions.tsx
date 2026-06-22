import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { PackagePlus, TrendingDown, TrendingUp, Search } from "lucide-react";
import { useErpQuickActions } from "@/contexts/erp-quick-actions";
import { useGlobalSearch } from "@/components/erp/global-search";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function ActionButton({
  label, shortcut, onClick, children, tone,
}: {
  label: string;
  shortcut?: string;
  onClick?: () => void;
  children: React.ReactNode;
  tone?: "default" | "danger" | "success";
}) {
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border/60 bg-background/60 text-muted-foreground transition-all hover:-translate-y-0.5 hover:shadow-sm",
            tone === "danger" && "hover:text-red-600 hover:border-red-500/40 hover:bg-red-500/10",
            tone === "success" && "hover:text-emerald-600 hover:border-emerald-500/40 hover:bg-emerald-500/10",
            (!tone || tone === "default") && "hover:text-foreground hover:border-border hover:bg-accent",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="font-medium flex items-center gap-2">
        <span>{label}</span>
        {shortcut && (
          <kbd className="inline-flex items-center rounded border border-border/60 bg-muted px-1.5 py-0.5 text-[10px] font-mono">{shortcut}</kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export function HeaderQuickActions() {
  const { openTxn } = useErpQuickActions();
  const { openSearch } = useGlobalSearch();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "n") { e.preventDefault(); navigate({ to: "/erp/orders/new" }); }
      else if (k === "i") { e.preventDefault(); openTxn("income"); }
      else if (k === "e") { e.preventDefault(); openTxn("expense"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, openTxn]);

  return (
    <TooltipProvider>
      <div className="hidden md:flex items-center gap-1.5 pr-2 border-r border-border/60 mr-1">
        <button
          onClick={openSearch}
          className="group h-9 inline-flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3 text-xs font-medium text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search</span>
          <kbd className="ml-2 inline-flex items-center rounded border border-border/60 bg-muted px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
        </button>
        <ActionButton label="New Order" shortcut="N">
          <Link to="/erp/orders/new" className="inline-flex h-full w-full items-center justify-center">
            <PackagePlus className="h-4 w-4" />
          </Link>
        </ActionButton>
        <ActionButton label="Add Income" shortcut="I" tone="success" onClick={() => openTxn("income")}>
          <TrendingUp className="h-4 w-4" />
        </ActionButton>
        <ActionButton label="Add Expense" shortcut="E" tone="danger" onClick={() => openTxn("expense")}>
          <TrendingDown className="h-4 w-4" />
        </ActionButton>
      </div>
    </TooltipProvider>
  );
}