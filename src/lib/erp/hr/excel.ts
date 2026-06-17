import * as XLSX from "xlsx";

/** Export rows to a single-sheet .xlsx file and trigger browser download. */
export function exportToXlsx<T extends Record<string, any>>(
  rows: T[],
  sheetName: string,
  filename: string,
) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/** Export multiple sheets. */
export function exportMultiSheetXlsx(
  sheets: { name: string; rows: any[] }[],
  filename: string,
) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/** Export a 2D array (aoa) with first row as headers. */
export function exportAoaXlsx(aoa: any[][], sheetName: string, filename: string) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}