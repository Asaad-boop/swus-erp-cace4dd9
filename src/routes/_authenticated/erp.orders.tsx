import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/orders")({
  head: () => ({ meta: [{ title: "Orders — ERP" }] }),
  component: OrdersLayout,
});

const tabs = [
  { to: "/erp/orders/web", label: "Web Orders" },
  { to: "/erp/orders/new", label: "Create New Order" },
  { to: "/erp/orders/list", label: "Order List" },
] as const;

function OrdersLayout() {
  const { pathname } = useLocation();
  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-card px-4 md:px-6">
        <nav className="flex gap-1 -mb-px">
          {tabs.map((t) => {
            const active = pathname === t.to || pathname.startsWith(t.to + "/");
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}