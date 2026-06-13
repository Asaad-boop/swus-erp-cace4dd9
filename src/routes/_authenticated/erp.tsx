import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, Menu as MenuIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandProvider } from "@/contexts/brand-context";
import { ErpSidebar } from "@/components/erp/erp-sidebar";
import { BrandSwitcher } from "@/components/erp/brand-switcher";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/_authenticated/erp")({
  component: ErpLayout,
});

function ErpLayout() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <BrandProvider>
      <div className="flex min-h-screen bg-background">
        <ErpSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 md:px-6 gap-3">
            <div className="flex items-center gap-2 md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon"><MenuIcon className="h-5 w-5" /></Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-60"><ErpSidebar /></SheetContent>
              </Sheet>
              <span className="font-semibold">ERP</span>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-3">
              <BrandSwitcher />
              <div className="hidden sm:block text-sm text-muted-foreground truncate max-w-[180px]">{email}</div>
              <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign out">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
        <Toaster richColors position="top-right" />
      </div>
    </BrandProvider>
  );
}