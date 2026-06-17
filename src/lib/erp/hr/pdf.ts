/**
 * Print-based PDF helper. Mounts the given HTML in a hidden iframe and
 * triggers the browser print dialog so the user can "Save as PDF".
 * Matches the existing order-invoice pattern in the project.
 */
export function printHtml(html: string, opts?: { title?: string }) {
  if (typeof window === "undefined") return;
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "-10000px";
  iframe.style.bottom = "-10000px";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><title>${opts?.title ?? "Document"}</title>
    <style>
      *{box-sizing:border-box} body{font:13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:0;padding:24px}
      table{width:100%;border-collapse:collapse} td,th{padding:6px 8px;border:1px solid #ddd;text-align:left;vertical-align:top}
      th{background:#f5f5f5;font-weight:600}
      h1,h2,h3{margin:0 0 8px} .right{text-align:right} .muted{color:#666}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;gap:16px}
      .totals td{font-weight:600;background:#fafafa}
      .sig{margin-top:48px;display:flex;justify-content:space-between} .sig div{border-top:1px solid #999;padding-top:6px;width:200px;text-align:center}
      @media print{body{padding:0}}
    </style></head><body>${html}</body></html>`);
  doc.close();
  const win = iframe.contentWindow!;
  const cleanup = () => setTimeout(() => iframe.remove(), 1000);
  win.onafterprint = cleanup;
  setTimeout(() => {
    win.focus();
    win.print();
  }, 150);
}

export function fmtBdt(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return `৳${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(v)}`;
}