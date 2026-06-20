import { cn } from "@/lib/utils";
import { COURIER_BUCKET_META, normalizeCourierStatus, type CourierShipmentRow } from "@/hooks/erp/use-courier-shipments";

export function CourierStatusBadge({
  shipment,
  flash,
}: {
  shipment: CourierShipmentRow | undefined;
  flash?: boolean;
}) {
  if (!shipment) return null;
  const bucket = normalizeCourierStatus(shipment.status);
  if (!bucket) return null;
  const meta = COURIER_BUCKET_META[bucket];
  const rawStatus = (shipment.status ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  const isActiveDelivery = /assigned_for_delivery|on_delivery|out_for_delivery/.test(rawStatus);
  const showRider = isActiveDelivery && !!shipment.rider_name;
  return (
    <div className="inline-flex flex-col items-start gap-0.5">
      <span
        className={cn(
          "inline-flex items-center gap-1 px-2 h-5 rounded-full border text-[10px] font-bold uppercase tracking-wider whitespace-nowrap shadow-sm transition-colors",
          meta.className,
          flash && "ring-2 ring-emerald-400/70",
        )}
        title={shipment.status ?? bucket}
      >
        {meta.pulse && (
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-60 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
          </span>
        )}
        <span>{meta.label}{meta.emoji ? ` ${meta.emoji}` : ""}</span>
      </span>
      {showRider && (
        <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1 whitespace-nowrap">
          📞 {shipment.rider_name}
          {shipment.rider_phone && (
            <>
              {" — "}
              <a
                href={`tel:${shipment.rider_phone}`}
                onClick={(e) => e.stopPropagation()}
                className="text-sky-600 hover:underline"
              >
                {shipment.rider_phone}
              </a>
            </>
          )}
        </span>
      )}
    </div>
  );
}