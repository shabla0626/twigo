import { Avatar, Glyph, type GlyphName } from "./glyphs";

// Six illustrative contributor roles around one shared project. Lines carry
// contributions inward (teal) and shared results back outward (white).
const C = { x: 240, y: 230 };
const NODES: { x: number; y: number; label: string; glyph: GlyphName; skin: string; shirt: string; bg: string }[] = [
  { x: 240, y: 62, label: "Development", glyph: "code", skin: "#f1c7a3", shirt: "#5fb7c2", bg: "#e0f2fe" },
  { x: 386, y: 146, label: "Data & AI", glyph: "chart", skin: "#8d5a3b", shirt: "#c3b4ee", bg: "#f3e8ff" },
  { x: 386, y: 314, label: "Research", glyph: "search", skin: "#e0ac83", shirt: "#9fd3a8", bg: "#dcfce7" },
  { x: 240, y: 398, label: "Support", glyph: "headset", skin: "#5a3a28", shirt: "#f2b8a2", bg: "#ffe4e6" },
  { x: 94, y: 314, label: "Operations", glyph: "clipboard", skin: "#f6d8bd", shirt: "#a9bff0", bg: "#e0e7ff" },
  { x: 94, y: 146, label: "Marketing", glyph: "megaphone", skin: "#b07a52", shirt: "#f3d08a", bg: "#fef3c7" },
];

export function HeroNetwork({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 460"
      className={className}
      role="img"
      aria-label="Illustration: people with different skills connected to one shared project"
    >
      <defs>
        <radialGradient id="hero-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#8ad8e0" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#8ad8e0" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx={C.x} cy={C.y} r={150} fill="url(#hero-glow)" />

      {/* Slowly rotating orbit */}
      <g className="anim-spin-slow">
        <circle cx={C.x} cy={C.y} r={168} fill="none" stroke="#8d99b0" strokeOpacity={0.45} strokeDasharray="2 10" />
        <circle cx={C.x + 168} cy={C.y} r={3} className="fill-accent-500" />
        <circle cx={C.x - 119} cy={C.y - 119} r={3} fill="#c3b4ee" />
        <circle cx={C.x - 60} cy={C.y + 157} r={2.5} fill="#f5b38f" />
      </g>

      {/* Connections */}
      {NODES.map((n, i) => (
        <g key={`l-${i}`}>
          <line x1={n.x} y1={n.y} x2={C.x} y2={C.y} stroke="#dde2ea" strokeOpacity={0.8} strokeWidth={6} strokeLinecap="round" />
          <line
            x1={n.x}
            y1={n.y}
            x2={C.x}
            y2={C.y}
            className="anim-flow stroke-accent-500"
            strokeOpacity={0.7}
            strokeWidth={1.6}
            strokeDasharray="4 8"
            style={{ animationDelay: `${i * -0.2}s` }}
          />
          {/* contribution travelling in */}
          <circle r={4} className="smil fill-accent-500">
            <animateMotion dur="3.2s" begin={`${i * 0.55}s`} repeatCount="indefinite" path={`M${n.x} ${n.y} L${C.x} ${C.y}`} />
          </circle>
          {/* shared result travelling out */}
          <circle r={3.5} fill="#f59e7a" className="smil">
            <animateMotion dur="3.2s" begin={`${1.6 + i * 0.55}s`} repeatCount="indefinite" path={`M${C.x} ${C.y} L${n.x} ${n.y}`} />
          </circle>
        </g>
      ))}

      {/* Shared project hub */}
      <g>
        <circle cx={C.x} cy={C.y} r={54} className="anim-ring stroke-accent-500" fill="none" strokeWidth={1.5} />
        <circle cx={C.x} cy={C.y} r={54} className="anim-ring stroke-accent-500" fill="none" strokeWidth={1.5} style={{ animationDelay: "1.2s" }} />
        <circle cx={C.x} cy={C.y} r={56} className="fill-white stroke-accent-400" strokeWidth={2.5} />
        <circle cx={C.x} cy={C.y} r={46} className="fill-accent-50" />
        <Glyph name="briefcase" x={C.x} y={C.y - 14} size={30} className="stroke-accent-700" strokeWidth={1.8} />
        <text x={C.x} y={C.y + 16} textAnchor="middle" className="fill-ink-900" fontSize={12} fontWeight={600}>
          Shared
        </text>
        <text x={C.x} y={C.y + 31} textAnchor="middle" className="fill-ink-900" fontSize={12} fontWeight={600}>
          project
        </text>
      </g>

      {/* Contributors */}
      {NODES.map((n, i) => (
        <g key={`n-${i}`} transform={`translate(${n.x} ${n.y})`}>
          <g className="anim-float" style={{ animationDelay: `${i * -1.1}s` }}>
            <circle r={34} fill="white" stroke="#dde2ea" />
            <Avatar skin={n.skin} shirt={n.shirt} bg={n.bg} />
            <circle cx={22} cy={-22} r={12} className="fill-accent-600 stroke-white" strokeWidth={2.5} />
            <Glyph name={n.glyph} x={22} y={-22} size={14} className="stroke-white" strokeWidth={1.6} />
            <text y={50} textAnchor="middle" fontSize={12} className="fill-ink-600" fontWeight={500}>
              {n.label}
            </text>
          </g>
        </g>
      ))}
    </svg>
  );
}
