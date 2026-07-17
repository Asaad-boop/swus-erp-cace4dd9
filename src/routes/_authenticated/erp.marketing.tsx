import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Megaphone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/erp/marketing")({
  head: () => ({ meta: [{ title: "Marketing — ERP" }] }),
  component: MarketingPlaceholder,
});

function MarketingPlaceholder() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Card>
        <CardContent className="py-12 text-center space-y-3">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted">
            <Megaphone className="h-5 w-5 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-semibold">Marketing module — rebuilding</h1>
          <p className="text-sm text-muted-foreground">
            Purano UI clean kora holo. Data, sync, canonical RPCs untouched.
            Notun design next-e ashche.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}