import { Photo } from "@/components/photos/photo";
import { TONE_CLASS, type Tone } from "@/components/photos/layouts";
import { CtaBand } from "@/components/site/blocks";
import { IconCheck, IconShield } from "@/components/ui/icons";
import { cn, Container, Eyebrow, PageHeader, Section, SectionHeading } from "@/components/ui/primitives";
import { GlyphIcon, type GlyphName } from "@/components/visuals/glyphs";
import { JourneyVisual } from "@/components/visuals/illustrations";
import { Reveal } from "@/components/visuals/reveal";
import type { PhotoId } from "@/content/photos";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "/how-it-works",
  "How It Works",
  "How joining, sharing ideas, research groups and paid projects work, in three simple parts.",
);

type Step = { title: string; body: string };
type Phase = { id: string; label: string; title: string; summary: string; photo: PhotoId; glyph: GlyphName; tone: Tone; steps: Step[] };

const PHASES: Phase[] = [
  {
    id: "phase-1",
    label: "Part 1",
    title: "Apply and join",
    summary: "You tell us what you can do. A person reviews every application.",
    photo: "how-research",
    glyph: "search",
    tone: "white",
    steps: [
      { title: "Create your free account", body: "Enter your name, email and a password, then confirm your email address. No fee or payment information is ever required." },
      { title: "Fill in a short application", body: "Tell us about your skills and the hours you can realistically offer. It takes about 5 minutes, and you can check its status whenever you sign in." },
      { title: "A person reviews your application", body: "We look for reliability and motivation. Sometimes we suggest a short call. If you are accepted, the same account opens the member community." },
    ],
  },
  {
    id: "phase-2",
    label: "Part 2",
    title: "Share ideas and research them together",
    summary: "Opportunities come from members, not only from the founder.",
    photo: "how-discussion",
    glyph: "clipboard",
    tone: "blue",
    steps: [
      { title: "Propose a business idea", body: "Any member can describe an opportunity in a few sentences. A business plan is not needed." },
      { title: "Support the ideas you like", body: "When two members other than the author support an idea, a research group is created automatically. Supporters become its first members." },
      { title: "Research together", body: "Each group has its own chat, shared notes and a to-do list, and holds its meetings through Google Meet. Anyone can join or leave a group at any time." },
      { title: "Ask for a review", body: "When the group has a credible plan, it asks the organization to review it." },
    ],
  },
  {
    id: "phase-3",
    label: "Part 3",
    title: "Agree in writing, deliver and get paid",
    summary: "Paid work only starts after a written agreement. Pay comes from real customers.",
    photo: "how-collaboration",
    glyph: "briefcase",
    tone: "gray",
    steps: [
      { title: "Agree before any work begins", body: "For an approved project, roles, deadlines and pay are agreed in writing. You can accept or decline." },
      { title: "Work together and deliver", body: "The team works remotely and delivers to the customer." },
      { title: "Get paid as agreed", body: "After the customer has paid, pay is settled according to the written agreement for that project." },
    ],
  },
];

// Step numbers continue across phases (1–10).
const PHASE_OFFSETS = PHASES.map((_, i) => PHASES.slice(0, i).reduce((sum, p) => sum + p.steps.length, 0));

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader
        eyebrow="How it works"
        title="Three simple parts, from joining to getting paid"
        intro="You always know what is expected of you, and what you can expect in return, before you commit your time."
        visual={
          <Photo
            id="how-header"
            priority
            sizes="(min-width: 1024px) 45vw, 100vw"
            className="shadow-soft-lg ring-1 ring-ink-100"
            fallback={<JourneyVisual className="w-full max-w-xs" />}
          />
        }
      />

      {/* Overview of the three phases */}
      <nav aria-label="Process phases" className="border-b border-ink-100 bg-white">
        <Container className="grid gap-4 py-8 md:grid-cols-3">
          {PHASES.map((p) => (
            <a
              key={p.id}
              href={`#${p.id}`}
              className="group flex items-start gap-4 rounded-2xl border border-ink-100 bg-ink-50 p-4 transition hover:border-accent-200 hover:bg-accent-50"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-accent-700 shadow-sm">
                <GlyphIcon name={p.glyph} className="h-6 w-6" />
              </span>
              <span>
                <span className="block text-xs font-semibold uppercase tracking-wider text-accent-700">{p.label}</span>
                <span className="mt-0.5 block font-semibold text-ink-950 group-hover:text-accent-800">{p.title}</span>
              </span>
            </a>
          ))}
        </Container>
      </nav>

      {PHASES.map((p, pi) => (
        <section key={p.id} id={p.id} aria-labelledby={`${p.id}-heading`} className={cn("scroll-mt-20 py-16 sm:py-24", TONE_CLASS[p.tone])}>
          <Container className="grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
            <div className={cn("lg:sticky lg:top-24 lg:self-start", pi % 2 === 1 && "lg:order-2")}>
              <Eyebrow>{p.label}</Eyebrow>
              <h2 id={`${p.id}-heading`} className="mt-2 text-3xl font-semibold text-ink-950 sm:text-4xl">
                {p.title}
              </h2>
              <p className="mt-4 text-lg leading-8 text-ink-700">{p.summary}</p>
              <div className="mt-8">
                <Photo
                  id={p.photo}
                  sizes="(min-width: 1024px) 40vw, 100vw"
                  fallback={<GlyphIcon name={p.glyph} className="h-14 w-14 text-accent-500" />}
                />
              </div>
            </div>
            <ol className={cn("space-y-4", pi % 2 === 1 && "lg:order-1")}>
              {p.steps.map((s, si) => {
                const n = PHASE_OFFSETS[pi]! + si + 1;
                return (
                  <Reveal
                    as="li"
                    key={s.title}
                    className="flex gap-5 rounded-2xl border border-ink-100 bg-white p-5 shadow-soft transition duration-300 hover:border-accent-200 hover:shadow-soft-lg sm:p-6"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-700 text-base font-semibold text-white">
                      {n}
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold text-ink-950">{s.title}</h3>
                      <p className="mt-1.5 leading-7 text-ink-600">{s.body}</p>
                    </div>
                  </Reveal>
                );
              })}
            </ol>
          </Container>
        </section>
      ))}

      {/* Commitments */}
      <Section tone="soft" labelledBy="commitments-heading">
        <SectionHeading id="commitments-heading" eyebrow="Before you start" title="Three things that are always true" align="center" />
        <div className="mx-auto mt-10 grid max-w-5xl gap-6 md:grid-cols-3">
          {[
            {
              title: "No guarantees",
              body: "Submitting an application does not guarantee acceptance, project assignment or income. Project availability depends on securing real customer work.",
              tone: "bg-amber-50 border-amber-200",
            },
            {
              title: "Written agreement first",
              body: "No participant begins project work without knowing and agreeing in writing to the scope, responsibilities, compensation and applicable conditions.",
              tone: "bg-white border-ink-100",
            },
            {
              title: "No fees at any stage",
              body: "At no point in this process will you be asked to pay a fee, make a deposit or invest money.",
              tone: "bg-white border-ink-100",
            },
          ].map((c, i) => (
            <div key={c.title} className={cn("rounded-2xl border p-6 shadow-soft", c.tone)}>
              {i === 0 ? <IconShield className="h-6 w-6 text-amber-700" /> : <IconCheck className="h-6 w-6 text-accent-700" />}
              <h3 className="mt-3 text-lg font-semibold text-ink-950">{c.title}</h3>
              <p className="mt-2 leading-7 text-ink-700">{c.body}</p>
            </div>
          ))}
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
