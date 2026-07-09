/*
  Official Zensil brand assets, pulled from the brand CDN
  (zensil.in/cdn/shop/files) — the exact logo, not a recreation.
  - /zensil-logo.png : full lockup (mark + "Zēnsil" + tagline), transparent
  - /zensil-mark.png : the square mark alone (also used as the favicon)
*/

const LOCKUP_RATIO = 536 / 170; // trimmed lockup width ÷ height

export function ZensilMark({ size = 42 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/zensil-mark.png"
      width={size}
      height={size}
      alt="Zensil"
      style={{ display: "block", flex: "none" }}
    />
  );
}

export function ZensilLockup({ size = 56 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/zensil-logo.png"
      height={size}
      width={Math.round(size * LOCKUP_RATIO)}
      alt="Zēnsil — Soul Of Your Kitchen"
      className="lockup-img"
      style={{ display: "block" }}
    />
  );
}
