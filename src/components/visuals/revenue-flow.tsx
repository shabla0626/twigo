import { Fragment } from "react";
import { GlyphIcon, type GlyphName } from "./glyphs";
import { Reveal } from "./reveal";

const STAGES: { glyph: GlyphName; title: string; body: string; tone: string }[] = [
  { glyph: "briefcase", title: "Actual customer revenue", body: "A customer pays for work that was delivered and accepted.", tone: "bg-sky-100 text-sky-800" },
  { glyph: "clipboard", title: "Agreed expenses and fees", body: "Project expenses and any organizational fee, as agreed in writing before the work began. Nothing else is deducted.", tone: "bg-amber-100 text-amber-800" },
  { glyph: "chart", title: "Agreed arrangements", body: "What remains is shared under the written agreement made before work began.", tone: "bg-violet-100 text-violet-800" },
  { glyph: "search", title: "Individual contributions", body: "Work performed, time, complexity, responsibility and quality.", tone: "bg-emerald-100 text-emerald-800" },
  { glyph: "globe", title: "Fair distribution", body: "Each participant is paid according to their agreed terms.", tone: "bg-accent-100 text-accent-800" },
];

/** Five-stage explanation of how project revenue becomes compensation. No figures. */
export function RevenueFlow() {
  return (
    <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft sm:p-10">
      <ol className="grid gap-4 lg:grid-cols-[repeat(5,minmax(0,1fr))] lg:gap-0">
        {STAGES.map((s, i) => (
          <Fragment key={s.title}>
            <Reveal as="li" delay={i * 100} className="relative flex gap-4 lg:flex-col lg:items-center lg:px-3 lg:text-center">
              <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${s.tone}`}>
                <GlyphIcon name={s.glyph} className="h-7 w-7" />
              </span>
              <span>
                <span className="block font-semibold text-ink-950 lg:mt-4">
                  <span className="sr-only">Stage {i + 1}: </span>
                  {s.title}
                </span>
                <span className="mt-1 block text-sm leading-6 text-ink-600">{s.body}</span>
              </span>
              {i < STAGES.length - 1 && (
                <span aria-hidden="true" className="absolute left-7 top-16 h-4 w-0.5 bg-ink-200 lg:left-auto lg:right-0 lg:top-7 lg:h-0.5 lg:w-6 lg:translate-x-1/2" />
              )}
            </Reveal>
          </Fragment>
        ))}
      </ol>

      {/* Illustrative split, deliberately without numbers */}
      <div className="mt-10 border-t border-ink-100 pt-8" aria-hidden="true">
        <div className="flex h-4 overflow-hidden rounded-full">
          <div className="w-[22%] bg-amber-200" />
          <div className="flex-1 bg-accent-300" />
        </div>
        <div className="mt-2 flex justify-between text-xs font-medium text-ink-600">
          <span>Agreed expenses and fees</span>
          <span>Available for agreed compensation</span>
        </div>
        <div className="ml-[22%] mt-3 flex h-3 gap-1">
          <div className="w-[40%] rounded-full bg-emerald-300" />
          <div className="w-[35%] rounded-full bg-sky-300" />
          <div className="flex-1 rounded-full bg-violet-300" />
        </div>
        <p className="ml-[22%] mt-2 text-xs text-ink-600">Shared between contributors according to each written agreement</p>
      </div>
      <p className="mt-6 text-sm leading-6 text-ink-600">
        Illustration only: the proportions are not real figures, percentages or a promise of any amount. Actual terms are
        set per project, in writing, before work begins.
      </p>
    </div>
  );
}
