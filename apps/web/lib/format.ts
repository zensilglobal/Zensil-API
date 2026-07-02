// INR / number / percent formatting. Money is INR; timestamps presented in IST.

export function inr(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export function inrK(n: number): string {
  n = Math.round(n);
  if (n >= 10000000) return "₹" + (n / 10000000).toFixed(2) + "Cr";
  if (n >= 100000) return "₹" + (n / 100000).toFixed(2) + "L";
  if (n >= 1000) return "₹" + (n / 1000).toFixed(1) + "K";
  return "₹" + n;
}

export function num(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

export function pct(n: number): string {
  return n.toFixed(1) + "%";
}

export function deltaPct(cur: number, prev: number): number {
  if (!prev) return 0;
  return ((cur - prev) / prev) * 100;
}

export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
}

export function channelName(c: string): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}
