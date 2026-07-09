"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

/*
  CSV upload for the Reviews section. Reads the chosen file in the
  browser and posts it to /api/reviews/import; the server upserts into
  the warehouse (idempotent), then we refresh the page data in place.
*/
export default function ImportReviews() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const csv = await file.text();
      const res = await fetch("/api/reviews/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const extra = data.errors?.length ? ` · ${data.errors[0]}` : "";
        setMsg({ ok: true, text: `Imported ${data.inserted} reviews (${data.skipped} skipped)${extra}` });
        router.refresh();
      } else {
        setMsg({ ok: false, text: data.error || "Import failed" });
      }
    } catch {
      setMsg({ ok: false, text: "Could not reach the server" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex" style={{ gap: 8 }}>
      {msg && (
        <span className="tiny" style={{ color: msg.ok ? "var(--color-green-soft)" : "var(--color-crimson-bright)" }}>
          {msg.text}
        </span>
      )}
      <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: "none" }} />
      <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
        <Upload size={15} /> {busy ? "Importing…" : "Import CSV"}
      </button>
    </div>
  );
}
