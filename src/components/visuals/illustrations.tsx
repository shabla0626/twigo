// Original animated illustrations drawn for this site. No stock imagery.
// Every moving SMIL element carries the `smil` class so it is hidden for
// visitors who prefer reduced motion; CSS animations are neutralized globally.
import { Avatar, Glyph, CATEGORY_GLYPHS } from "./glyphs";

type P = { className?: string };
const frame = (label: string, className?: string) => ({
  role: "img" as const,
  "aria-label": label,
  className: className ?? "w-full max-w-sm",
});

/** About: different abilities overlapping to create value. */
export function AbilitiesVisual({ className }: P) {
  const circles = [
    { cx: 130, cy: 100, fill: "#22a9b8", label: "Skills", lx: 62, ly: 48 },
    { cx: 190, cy: 100, fill: "#8b7cf6", label: "Time", lx: 258, ly: 48 },
    { cx: 130, cy: 150, fill: "#f59e0b", label: "Effort", lx: 62, ly: 212 },
    { cx: 190, cy: 150, fill: "#34c38f", label: "Cooperation", lx: 258, ly: 212 },
  ];
  return (
    <svg viewBox="0 0 320 250" {...frame("Illustration: skills, time, effort and cooperation overlapping to create value", className)}>
      {circles.map((c, i) => (
        <g key={c.label} className="anim-float" style={{ animationDelay: `${i * -1.5}s`, animationDuration: "7s" }}>
          <circle cx={c.cx} cy={c.cy} r={60} fill={c.fill} fillOpacity={0.2} stroke={c.fill} strokeOpacity={0.55} strokeWidth={1.5} />
        </g>
      ))}
      {circles.map((c) => (
        <text key={`t-${c.label}`} x={c.lx} y={c.ly} textAnchor="middle" fontSize={13} fontWeight={600} className="fill-ink-800">
          {c.label}
        </text>
      ))}
      <circle cx={160} cy={125} r={24} className="anim-ring stroke-accent-600" fill="none" strokeWidth={1.5} />
      <circle cx={160} cy={125} r={25} className="fill-accent-600" />
      <text x={160} y={129} textAnchor="middle" fontSize={11} fontWeight={700} className="fill-white">
        Value
      </text>
    </svg>
  );
}

/** How it works: a path with milestones and a traveller moving along it. */
export function JourneyVisual({ className }: P) {
  const d = "M30 205 H110 Q130 205 130 185 V165 Q130 145 150 145 H190 Q210 145 210 125 V105 Q210 85 230 85 H250 Q270 85 270 65 V52";
  const stops = [
    { x: 30, y: 205, label: "Apply", tx: 30, ty: 232 },
    { x: 130, y: 175, label: "Discuss", tx: 92, ty: 178 },
    { x: 190, y: 145, label: "Agree", tx: 186, ty: 170 },
    { x: 240, y: 85, label: "Deliver", tx: 236, ty: 110 },
  ];
  return (
    <svg viewBox="0 0 320 250" {...frame("Illustration: the path from application to agreed, delivered work", className)}>
      <path d={d} fill="none" className="stroke-accent-100" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" className="anim-flow stroke-accent-500" strokeWidth={2} strokeDasharray="4 8" strokeLinecap="round" />
      {stops.map((s, i) => (
        <g key={s.label}>
          <circle cx={s.x} cy={s.y} r={11} className="fill-white stroke-accent-600" strokeWidth={2} />
          <text x={s.x} y={s.y + 4} textAnchor="middle" fontSize={11} fontWeight={700} className="fill-ink-900">
            {i + 1}
          </text>
          <text x={s.tx} y={s.ty} textAnchor="middle" fontSize={11} fontWeight={500} className="fill-ink-600">
            {s.label}
          </text>
        </g>
      ))}
      {/* Destination flag */}
      <line x1={270} y1={52} x2={270} y2={14} className="stroke-ink-500" strokeWidth={2.5} strokeLinecap="round" />
      <g className="anim-sway" style={{ transformOrigin: "270px 16px", animationDuration: "3s" }}>
        <path d="M270 15 L302 24 L270 33 Z" className="fill-accent-600" />
      </g>
      <text x={240} y={30} textAnchor="end" fontSize={11} fontWeight={600} className="fill-ink-800">
        Settle
      </text>
      <circle r={7} className="smil fill-accent-600 stroke-white" strokeWidth={2}>
        <animateMotion dur="7s" repeatCount="indefinite" path={d} />
      </circle>
    </svg>
  );
}

/** Participation: a contributor surrounded by collaboration areas. */
export function OrbitVisual({ className }: P) {
  const cx = 160;
  const cy = 125;
  const pts = CATEGORY_GLYPHS.slice(0, 6).map((g, i) => {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    return { g, x: cx + Math.cos(a) * 112, y: cy + Math.sin(a) * 92 };
  });
  return (
    <svg viewBox="0 0 320 250" {...frame("Illustration: one contributor connected to several areas of work", className)}>
      <ellipse cx={cx} cy={cy} rx={112} ry={92} fill="none" className="stroke-ink-200" strokeDasharray="3 7" />
      <g className="anim-spin-slow" style={{ animationDuration: "40s" }}>
        <circle cx={cx} cy={cy} r={70} fill="none" className="stroke-accent-500" strokeOpacity={0.35} strokeDasharray="1 9" strokeWidth={2} />
        <circle cx={cx + 70} cy={cy} r={4} className="fill-accent-500" />
      </g>
      {pts.map((p, i) => (
        <g key={p.g}>
          <line x1={cx} y1={cy} x2={p.x} y2={p.y} className="stroke-ink-200" />
          <g transform={`translate(${p.x} ${p.y})`}>
            <g className="anim-float" style={{ animationDelay: `${i * -0.9}s` }}>
              <rect x={-21} y={-21} width={42} height={42} rx={11} className="fill-white stroke-ink-200" strokeWidth={1.5} />
              <Glyph name={p.g} size={22} className="stroke-accent-700" />
            </g>
          </g>
        </g>
      ))}
      <g transform={`translate(${cx} ${cy})`}>
        <circle r={34} className="anim-ring stroke-accent-600" fill="none" strokeWidth={1.5} />
        <Avatar skin="#e0ac83" shirt="#5fb7c2" r={32} />
      </g>
    </svg>
  );
}

/** Compensation: a balance between work contributed and agreed terms. */
export function BalanceVisual({ className }: P) {
  return (
    <svg viewBox="0 0 320 250" {...frame("Illustration: a balance between work contributed and agreed compensation terms", className)}>
      <rect x={110} y={222} width={100} height={10} rx={5} className="fill-accent-200" />
      <rect x={155} y={78} width={10} height={146} rx={4} className="fill-accent-300" />
      {/* Beam tilts; pans stay level and rise/fall in step with the beam ends. */}
      <g className="anim-sway" style={{ transformOrigin: "160px 78px", animationDuration: "6s" }}>
        <rect x={40} y={74} width={240} height={8} rx={4} className="fill-accent-600" />
      </g>
      <g className="anim-pan-left">
        {/* left pan: completed work */}
        <path d="M60 82 L38 150 M60 82 L82 150" className="stroke-ink-300" strokeWidth={1.5} />
        <path d="M28 150 H92 Q90 170 60 170 Q30 170 28 150 Z" className="fill-sky-100 stroke-sky-300" />
        <rect x={42} y={124} width={36} height={10} rx={2} className="fill-amber-300" />
        <rect x={46} y={113} width={28} height={10} rx={2} className="fill-rose-300" />
        <rect x={50} y={135} width={32} height={14} rx={2} className="fill-accent-400" />
        <text x={60} y={190} textAnchor="middle" fontSize={11} fontWeight={600} className="fill-ink-700">
          Work done
        </text>
      </g>
      <g className="anim-pan-right">
        {/* right pan: written agreement */}
        <path d="M260 82 L238 150 M260 82 L282 150" className="stroke-ink-300" strokeWidth={1.5} />
        <path d="M228 150 H292 Q290 170 260 170 Q230 170 228 150 Z" className="fill-sky-100 stroke-sky-300" />
        <rect x={246} y={108} width={28} height={40} rx={3} className="fill-white stroke-ink-500" />
        <path d="M252 118 H268 M252 125 H268 M252 132 H262" className="stroke-ink-300" strokeWidth={1.5} />
        <path d="M252 141 L256 144 L264 137" fill="none" className="stroke-accent-600" strokeWidth={2} strokeLinecap="round" />
        <text x={260} y={190} textAnchor="middle" fontSize={11} fontWeight={600} className="fill-ink-700">
          Agreed terms
        </text>
      </g>
      <circle cx={160} cy={78} r={9} className="fill-accent-600 stroke-white" strokeWidth={2} />
    </svg>
  );
}

/** Founding contributors: building the foundation, with a new block arriving. */
export function FoundationVisual({ className }: P) {
  const block = (x: number, y: number, label: string, cls: string, text = "fill-ink-900") => (
    <g key={label}>
      <rect x={x} y={y} width={76} height={34} rx={6} className={cls} />
      <text x={x + 38} y={y + 22} textAnchor="middle" fontSize={12} fontWeight={600} className={text}>
        {label}
      </text>
    </g>
  );
  return (
    <svg viewBox="0 0 320 250" {...frame("Illustration: foundation blocks of trust, clarity and fairness with a new contributor block arriving", className)}>
      <rect x={30} y={214} width={260} height={8} rx={4} className="fill-ink-100" />
      {block(40, 178, "Trust", "fill-sky-200")}
      {block(122, 178, "Clarity", "fill-emerald-200")}
      {block(204, 178, "Fairness", "fill-violet-200")}
      {block(81, 140, "Skills", "fill-amber-100")}
      {block(163, 140, "Effort", "fill-rose-100")}
      <rect x={122} y={102} width={76} height={34} rx={6} fill="none" className="stroke-ink-300" strokeDasharray="4 4" />
      <g className="anim-drop-in">{block(122, 102, "You", "fill-accent-600", "fill-white")}</g>
      <g className="anim-float">
        <circle cx={160} cy={52} r={14} fill="none" className="stroke-accent-500" strokeDasharray="2 4" />
        <path d="M160 44 V60 M152 52 H168" className="stroke-accent-600" strokeWidth={2} strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** FAQ: a question met with an honest answer. */
export function ConversationVisual({ className }: P) {
  return (
    <svg viewBox="0 0 320 250" {...frame("Illustration: a question and an answer being typed", className)}>
      <g className="anim-float" style={{ animationDuration: "7s" }}>
        <path d="M40 40 H190 Q202 40 202 52 V104 Q202 116 190 116 H86 L64 134 V116 H52 Q40 116 40 104 V52 Q40 40 52 40 Z" className="fill-white stroke-ink-200" strokeWidth={1.5} />
        <circle cx={78} cy={78} r={18} className="fill-ink-100" />
        <text x={78} y={85} textAnchor="middle" fontSize={20} fontWeight={700} className="fill-ink-700">
          ?
        </text>
        <path d="M108 70 H180 M108 86 H160" className="stroke-ink-300" strokeWidth={6} strokeLinecap="round" />
      </g>
      <g className="anim-float" style={{ animationDuration: "7s", animationDelay: "-3s" }}>
        <path d="M130 140 H268 Q280 140 280 152 V196 Q280 208 268 208 H256 V226 L234 208 H142 Q130 208 130 196 V152 Q130 140 142 140 Z" className="fill-accent-600" />
        <circle cx={182} cy={174} r={6} className="anim-blink fill-white" />
        <circle cx={205} cy={174} r={6} className="anim-blink fill-white" style={{ animationDelay: "0.2s" }} />
        <circle cx={228} cy={174} r={6} className="anim-blink fill-white" style={{ animationDelay: "0.4s" }} />
      </g>
    </svg>
  );
}

/** Contact: a paper plane carrying a message. */
export function MessageVisual({ className }: P) {
  const d = "M30 200 C 80 200, 70 120, 130 120 S 190 190, 230 130 S 260 60, 270 60";
  return (
    <svg viewBox="0 0 320 250" {...frame("Illustration: a paper plane carrying a message", className)}>
      <path d={d} fill="none" className="anim-flow stroke-ink-300" strokeWidth={2} strokeDasharray="4 8" strokeLinecap="round" />
      <g className="anim-float">
        <rect x={232} y={30} width={66} height={46} rx={6} className="fill-white stroke-accent-700" strokeWidth={2} />
        <path d="M234 34 L265 58 L296 34" fill="none" className="stroke-accent-700" strokeWidth={2} strokeLinejoin="round" />
        <circle cx={296} cy={32} r={8} fill="#f59e7a" />
        <circle cx={296} cy={32} r={8} className="anim-ring stroke-accent-600" fill="none" strokeWidth={1.5} />
      </g>
      <circle cx={30} cy={200} r={6} className="fill-accent-600" />
      <g className="smil">
        <path d="M-12 -9 L14 0 L-12 9 L-6 0 Z" className="fill-accent-600" />
        <path d="M-6 0 L14 0" className="stroke-accent-800" strokeWidth={1} />
        <animateMotion dur="6s" repeatCount="indefinite" rotate="auto" path={d} />
      </g>
    </svg>
  );
}

export function RemoteTeamVisual({ className }: P) {
  const tiles = [
    { x: 40, y: 64, skin: "#f1c7a3", shirt: "#5fb7c2", day: true, speaking: true },
    { x: 196, y: 64, skin: "#5a3a28", shirt: "#c3b4ee", day: false, speaking: false },
    { x: 40, y: 178, skin: "#b07a52", shirt: "#9fd3a8", day: true, speaking: false },
    { x: 196, y: 178, skin: "#f6d8bd", shirt: "#f3d08a", day: false, speaking: false },
  ];
  return (
    <svg viewBox="0 0 400 330" role="img" aria-label="Illustration: four people collaborating on a video call from different time zones" className={className ?? "w-full"}>
      <rect x={20} y={20} width={360} height={290} rx={18} className="fill-white stroke-ink-100" strokeWidth={2} />
      <circle cx={42} cy={42} r={5} fill="#ef6b5e" />
      <circle cx={58} cy={42} r={5} fill="#f2c14e" />
      <circle cx={74} cy={42} r={5} fill="#5cc78a" />
      <rect x={150} y={35} width={100} height={14} rx={7} className="fill-ink-100" />
      {tiles.map((t, i) => (
        <g key={i}>
          <rect x={t.x} y={t.y} width={146} height={104} rx={10} fill={t.day ? "#e0f2fe" : "#ede9fe"} />
          {t.speaking && (
            <rect x={t.x} y={t.y} width={146} height={104} rx={10} fill="none" className="smil stroke-accent-500" strokeWidth={2.5}>
              <animate attributeName="stroke-opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite" />
            </rect>
          )}
          <g transform={`translate(${t.x + 73} ${t.y + 56})`}>
            <g className="anim-float" style={{ animationDelay: `${i * -1.3}s`, animationDuration: "5s" }}>
              <Avatar skin={t.skin} shirt={t.shirt} r={30} bg="#ffffff" />
            </g>
          </g>
          {t.day ? (
            <g transform={`translate(${t.x + 128} ${t.y + 16})`}>
              <circle r={5} fill="#f2c14e" />
              <path d="M0 -10 V-8 M0 8 V10 M-10 0 H-8 M8 0 H10 M-7 -7 L-5.6 -5.6 M5.6 5.6 L7 7 M-7 7 L-5.6 5.6 M5.6 -5.6 L7 -7" stroke="#f2c14e" strokeWidth={1.5} strokeLinecap="round" />
            </g>
          ) : (
            <path d={`M${t.x + 132} ${t.y + 9} a8 8 0 1 0 6 12 a6.5 6.5 0 1 1 -6 -12 Z`} fill="#a78bfa" />
          )}
          <rect x={t.x + 10} y={t.y + 84} width={44} height={10} rx={5} fill="#ffffff" fillOpacity={0.9} />
          {t.speaking && (
            <g className="smil" transform={`translate(${t.x + 18} ${t.y + 16})`}>
              {[0, 1, 2].map((b) => (
                <rect key={b} x={b * 6 - 6} y={-5} width={3} height={10} rx={1.5} className="fill-accent-500">
                  <animate attributeName="height" values="4;12;4" dur={`${0.7 + b * 0.2}s`} repeatCount="indefinite" />
                  <animate attributeName="y" values="-2;-6;-2" dur={`${0.7 + b * 0.2}s`} repeatCount="indefinite" />
                </rect>
              ))}
            </g>
          )}
        </g>
      ))}
      {/* chat bubble */}
      <g className="anim-float" style={{ animationDelay: "-2.5s" }}>
        <path d="M300 236 H372 Q384 236 384 248 V272 Q384 284 372 284 H316 L302 296 V284 H300 Q288 284 288 272 V248 Q288 236 300 236 Z" className="fill-white stroke-ink-200" strokeWidth={1.5} />
        <circle cx={316} cy={260} r={4.5} className="anim-blink fill-accent-500" />
        <circle cx={334} cy={260} r={4.5} className="anim-blink fill-accent-500" style={{ animationDelay: "0.2s" }} />
        <circle cx={352} cy={260} r={4.5} className="anim-blink fill-accent-500" style={{ animationDelay: "0.4s" }} />
      </g>
    </svg>
  );
}
