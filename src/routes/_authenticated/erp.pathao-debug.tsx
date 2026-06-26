import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { pathaoLookupByPhoneFn, pathaoMatchAddressFn } from "@/lib/erp/pathao.functions";

export const Route = createFileRoute("/_authenticated/erp/pathao-debug")({
  head: () => ({ meta: [{ title: "Pathao Debug — ERP" }] }),
  component: PathaoDebugPage,
});

function PathaoDebugPage() {
  const { brands, activeBrand } = useBrand();
  const [brandId, setBrandId] = useState<string | undefined>(activeBrand?.id ?? brands[0]?.id);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [phoneResult, setPhoneResult] = useState<any>(null);
  const [addrResult, setAddrResult] = useState<any>(null);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [addrLoading, setAddrLoading] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [addrError, setAddrError] = useState<string | null>(null);

  const lookupPhone = useServerFn(pathaoLookupByPhoneFn);
  const matchAddr = useServerFn(pathaoMatchAddressFn);

  async function runPhone() {
    if (!phone.trim()) return;
    setPhoneLoading(true); setPhoneError(null); setPhoneResult(null);
    try {
      const res = await lookupPhone({ data: { phone: phone.trim(), brandId } });
      setPhoneResult(res);
    } catch (e: any) {
      setPhoneError(e?.message ?? String(e));
    } finally { setPhoneLoading(false); }
  }

  async function runAddress() {
    if (!address.trim()) return;
    setAddrLoading(true); setAddrError(null); setAddrResult(null);
    try {
      const res = await matchAddr({ data: { address: address.trim(), brandId } });
      setAddrResult(res);
    } catch (e: any) {
      setAddrError(e?.message ?? String(e));
    } finally { setAddrLoading(false); }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Pathao Debug</h1>
        <p className="text-sm text-muted-foreground">
          Enter a phone or address and see the exact City / Zone / Area Pathao returns.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Brand</Label>
        <div className="flex flex-wrap gap-2">
          {brands.map((b) => (
            <Button
              key={b.id}
              type="button"
              size="sm"
              variant={brandId === b.id ? "default" : "outline"}
              onClick={() => setBrandId(b.id)}
            >
              {b.name}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Lookup by Phone</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="01XXXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runPhone()}
            />
            <Button onClick={runPhone} disabled={phoneLoading}>
              {phoneLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lookup"}
            </Button>
          </div>
          {phoneError && <div className="text-sm text-destructive">{phoneError}</div>}
          {phoneResult && <ResultBlock data={phoneResult} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Match by Address</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="House 12, Road 5, Dhanmondi, Dhaka"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runAddress()}
            />
            <Button onClick={runAddress} disabled={addrLoading}>
              {addrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Match"}
            </Button>
          </div>
          {addrError && <div className="text-sm text-destructive">{addrError}</div>}
          {addrResult && <ResultBlock data={addrResult} />}
        </CardContent>
      </Card>
    </div>
  );
}

function ResultBlock({ data }: { data: any }) {
  const city = data?.city;
  const zone = data?.zone;
  const area = data?.area;
  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="flex flex-wrap gap-2 text-sm">
        {data?.found === false ? (
          <Badge variant="destructive">Not found</Badge>
        ) : (
          <>
            <Badge variant="secondary">City: {city?.name ?? "—"} ({city?.id ?? "—"})</Badge>
            <Badge variant="secondary">Zone: {zone?.name ?? "—"} ({zone?.id ?? "—"})</Badge>
            <Badge variant="secondary">Area: {area?.name ?? "—"} ({area?.id ?? "—"})</Badge>
            {"confidence" in (data ?? {}) && (
              <Badge>Confidence: {Math.round((data.confidence ?? 0) * 100)}%</Badge>
            )}
            {data?.source && <Badge variant="outline">Source: {data.source}</Badge>}
          </>
        )}
      </div>
      <pre className="overflow-auto rounded bg-background p-3 text-xs">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}