import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Megaphone, BarChart3, Receipt, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/erp/marketing/")({
  component: MarketingOverview,
});

const cards = [
  {
    to: "/erp/marketing/accounts",
    title: "Ad Accounts",
    desc: "Connect your Meta ad accounts and trigger manual sync.",
    icon: Megaphone,
  },
  {
    to: "/erp/marketing/campaigns",
    title: "Campaigns",
    desc: "Browse campaigns with Meta vs Confirmed vs Delivered results.",
    icon: BarChart3,
  },
  {
    to: "/erp/marketing/expenses",
    title: "Manual Expenses",
    desc: "Track influencer, content & photoshoot spend per product / campaign.",
    icon: Receipt,
  },
  {
    to: "/erp/marketing/sync",
    title: "Sync Log",
    desc: "See the last Meta sync runs and error history.",
    icon: RefreshCw,
  },
];

function MarketingOverview() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Marketing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Meta ads integration, campaign performance, and accurate Meta vs Confirmed vs Delivered tracking.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map(({ to, title, desc, icon: Icon }) => (
          <Link key={to} to={to as never} className="block">
            <Card className="h-full hover:border-primary transition-colors">
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
