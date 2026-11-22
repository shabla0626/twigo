// Original line glyphs drawn for this site (24×24 coordinate system).
export const GLYPHS = {
  code: "M8 8 L4 12 L8 16 M16 8 L20 12 L16 16 M13.5 6 L10.5 18",
  chart: "M3 19 H21 M6 19 V13 M10.5 19 V8 M15 19 V11 M19.5 19 V5",
  search: "M16 10.5 a5.5 5.5 0 1 1 -11 0 a5.5 5.5 0 1 1 11 0 M14.5 14.5 L19.5 19.5",
  megaphone: "M4 10 V14 H7 L14 18 V6 L7 10 Z M17.5 9.5 a3.5 3.5 0 0 1 0 5",
  headset: "M5 15 V12 a7 7 0 0 1 14 0 V15 M5 14 h2.5 v5 H5 Z M19 14 h-2.5 v5 H19 Z",
  clipboard: "M8 5 H6 V20 H18 V5 H16 M9 3.5 H15 V7 H9 Z M9 13.5 L11 15.5 L15 11.5",
  globe: "M20 12 a8 8 0 1 1 -16 0 a8 8 0 1 1 16 0 M4 12 H20 M12 4 C15 7 15 17 12 20 C9 17 9 7 12 4",
  briefcase: "M4 8 H20 V19 H4 Z M9 8 V5.5 H15 V8 M4 13 H20",
} as const;

export type GlyphName = keyof typeof GLYPHS;

/** Glyph positioned so its center sits at (x, y), scaled to `size` px. */
export function Glyph({
  name,
  x = 0,
  y = 0,
  size = 24,
  className,
  strokeWidth = 1.8,
}: {
  name: GlyphName;
  x?: number;
  y?: number;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const s = size / 24;
  return (
    <path
      d={GLYPHS[name]}
      transform={`translate(${x - 12 * s} ${y - 12 * s}) scale(${s})`}
      fill="none"
      strokeWidth={strokeWidth / s}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    />
  );
}

/** Standalone icon (HTML context). */
export function GlyphIcon({ name, className }: { name: GlyphName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} aria-hidden="true" className={className} stroke="currentColor">
      <Glyph name={name} x={12} y={12} />
    </svg>
  );
}

export const CATEGORY_GLYPHS: GlyphName[] = ["code", "chart", "search", "megaphone", "headset", "clipboard", "globe"];

/** Friendly abstract avatar (no real people depicted). Centered at (0,0). */
export function Avatar({ skin, shirt, r = 30, bg = "#e6f4f8" }: { skin: string; shirt: string; r?: number; bg?: string }) {
  const k = r / 30;
  return (
    <g>
      <clipPath id={`clip-${skin.slice(1)}-${shirt.slice(1)}-${r}`}>
        <circle r={r} />
      </clipPath>
      <circle r={r} fill={bg} />
      <g clipPath={`url(#clip-${skin.slice(1)}-${shirt.slice(1)}-${r})`}>
        <path d={`M${-19 * k} ${30 * k} C${-19 * k} ${8 * k} ${19 * k} ${8 * k} ${19 * k} ${30 * k} Z`} fill={shirt} />
        <circle cy={-5 * k} r={9 * k} fill={skin} />
      </g>
    </g>
  );
}
