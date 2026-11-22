import type { ReactNode } from "react";
import { brand } from "@/config/brand";
import { IconArrow, IconCheck, IconX } from "../ui/icons";
import { ButtonLink, Container } from "../ui/primitives";
import { Reveal } from "../visuals/reveal";

export function CtaBand({
  title = "Help build something worthwhile from the beginning.",
  body = "Create a free account and tell us about your skills and availability. Applications are reviewed individually; applying does not guarantee acceptance, project assignment or income.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <section aria-labelledby="cta-heading" className="relative overflow-hidden bg-gradient-to-br from-accent-50 via-sky-50 to-rose-50">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="anim-drift absolute -left-16 -top-24 h-72 w-72 rounded-full bg-accent-200/60 blur-3xl" />
        <div className="anim-drift absolute -bottom-24 right-10 h-72 w-72 rounded-full bg-violet-200/50 blur-3xl" style={{ animationDelay: "-7s" }} />
      </div>
      <Container className="relative flex flex-col items-start gap-8 py-16 sm:py-20 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <h2 id="cta-heading" className="text-3xl font-semibold sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 text-lg leading-8 text-ink-600">{body}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/join" size="lg">
            Join {brand().name} <IconArrow className="h-5 w-5" />
          </ButtonLink>
          <ButtonLink href="/faq" variant="secondary" size="lg">
            Read the FAQ
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}

export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-white shadow-soft">
      {items.map((item, i) => (
        <details key={i} className="group p-5 sm:p-6 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 rounded text-left font-semibold text-ink-950">
            <span>{item.q}</span>
            <span
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-xl leading-none text-accent-600 transition-transform group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <p className="mt-3 max-w-3xl leading-7 text-ink-700">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

export function CheckList({ items, negative = false }: { items: ReactNode[]; negative?: boolean }) {
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 leading-7">
          {negative ? (
            <IconX className="mt-1 h-5 w-5 shrink-0 text-red-700" />
          ) : (
            <IconCheck className="mt-1 h-5 w-5 shrink-0 text-accent-700" />
          )}
          <span className="text-ink-700">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Steps({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className="relative space-y-0">
      {steps.map((s, i) => (
        <Reveal as="li" key={s.title} className="group relative flex gap-5 pb-10 last:pb-0">
          {i < steps.length - 1 && (
            <span aria-hidden="true" className="connector-y absolute left-5 top-11 h-[calc(100%-2.75rem)] w-0.5 -translate-x-1/2 opacity-60" />
          )}
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent-200 bg-accent-50 text-sm font-semibold text-accent-800 transition-colors duration-300 group-hover:border-accent-600 group-hover:bg-accent-600 group-hover:text-white">
            {i + 1}
          </span>
          <div className="pt-1.5">
            <h3 className="font-semibold">{s.title}</h3>
            <p className="mt-1.5 max-w-2xl leading-7 text-ink-600">{s.body}</p>
          </div>
        </Reveal>
      ))}
    </ol>
  );
}
