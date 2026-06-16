import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/erp/marketing/expenses")({
  component: () => (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        Manual marketing expenses — coming in Phase 5.
      </CardContent>
    </Card>
  ),
});
