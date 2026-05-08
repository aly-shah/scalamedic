import { getClinicToday } from "@/lib/utils";

// dateSuffix: when set, replaces the auto today-stamp on the filename.
// Used by the daily-report export so the file is named after the report
// date, not the date the report was generated.
export function downloadCSV(
  data: Record<string, unknown>[],
  filename: string,
  dateSuffix?: string,
) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((h) => {
      const val = row[h];
      const str = val === null || val === undefined ? "" : String(val);
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${dateSuffix ?? getClinicToday()}.csv`;
  link.click();
}
