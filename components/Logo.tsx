/*
  Zensil brand lockup — vector recreation of the official logo
  (pink rounded square with the stylised Z, "Zēnsil" wordmark and
  the "Soul Of Your Kitchen" tagline). Inline SVG so it inherits
  crispness at any size and needs no extra request.
*/

export function ZensilMark({ size = 42 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      style={{ display: "block", flex: "none" }}
    >
      <defs>
        <linearGradient id="zn-mark-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f0688c" />
          <stop offset="100%" stopColor="#d92e5f" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="112" height="112" rx="30" fill="url(#zn-mark-g)" />
      {/* corner arcs — the swoosh details of the mark */}
      <path d="M26 56 A30 30 0 0 1 56 26" stroke="#fff" strokeWidth="7" strokeLinecap="round" fill="none" opacity="0.92" />
      <path d="M94 64 A30 30 0 0 1 64 94" stroke="#fff" strokeWidth="7" strokeLinecap="round" fill="none" opacity="0.92" />
      {/* the Z */}
      <path d="M34 30h52v12.5L52.5 77.5H86V90H34V77.5L67.5 42.5H34Z" fill="#fff" />
    </svg>
  );
}

export function ZensilLockup({ size = 42, tagline = "Soul Of Your Kitchen" }: { size?: number; tagline?: string }) {
  return (
    <div className="crest">
      <ZensilMark size={size} />
      <div className="word">
        <b>
          Z<span className="emacron">ē</span>nsil
        </b>
        <span>{tagline}</span>
      </div>
    </div>
  );
}
