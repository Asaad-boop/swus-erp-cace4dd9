import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/erp/marketing/campaigns")({
  component: () => (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        Campaigns dashboard — coming in Phase 4 (after first ad account sync).
      </CardContent>
    </Card>
  ),
});
