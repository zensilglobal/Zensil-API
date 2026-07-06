"use client";
import { Download } from "lucide-react";

/**
 * Client-side CSV download. The CSV is computed server-side from live data
 * and passed in as a string; this just turns it into a file the operator can
 * import into Amazon Ads / their PO system. No round-trip, works offline.
 */
export default function DownloadCsv({
  csv,
  filename,
  label,
  className = "btn ghost",
  disabled,
}: {
  csv: string;
  filename: string;
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  function download() {
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  return (
    <button type="button" className={className} onClick={download} disabled={disabled}>
      <Download size={15} /> {label}
    </button>
  );
}
