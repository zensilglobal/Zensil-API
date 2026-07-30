"use client";
import { useEffect } from "react";
import WarehouseError from "@/components/WarehouseError";

/*
  Dashboard pages read the warehouse at request time, so an outage there
  surfaces as a render error. Show what actually broke instead of a blank
  crash screen — and never substitute sample numbers, which would quietly
  misreport the business. The panel itself lives in components/ because the
  overview page renders it inline instead of throwing (see that page).

  Note this does not cover (dash)/layout.tsx: error.tsx never wraps the
  layout in its own segment, so those queries degrade there instead.
*/
export default function DashError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("dashboard render failed:", error);
  }, [error]);

  return <WarehouseError digest={error.digest} retry={unstable_retry} />;
}
