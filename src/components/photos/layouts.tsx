import type { ReactNode } from "react";
import { cn, Container, Eyebrow } from "../ui/primitives";

export type Tone = "white" | "gray" | "blue" | "soft";

export const TONE_CLASS: Record<Tone, string> = {
  white: "bg-white",
  gray: "bg-ink-50",
  blue: "bg-sky-50",
  soft: "bg-gradient-to-br from-accent-50 via-white to-sky-50",
};

/**
 * Two-column image-and-text section. `media` is usually a <Photo />.
 * Text always comes first on mobile so the message is read before the image.
 */
export function SplitSection({
  id,
  tone = "white",
  eyebrow,
  title,
  children,
  media,
  mediaSide = "right",
  className,
}: {
  id?: string;
  tone?: Tone;
  eyebrow?: string;
  title: string;
  children: ReactNode;
  media: ReactNode;
  mediaSide?: "left" | "right";
  className?: string;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("py-16 sm:py-24", TONE_CLASS[tone], className)}>
      <Container className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className={cn(mediaSide === "left" && "lg:order-2")}>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h2 id={headingId} className="mt-2 text-3xl font-semibold sm:text-4xl">
            {title}
          </h2>
          <div className="mt-5 space-y-4 text-lg leading-8 text-ink-700">{children}</div>
        </div>
        <div className={cn(mediaSide === "left" && "lg:order-1")}>{media}</div>
      </Container>
    </section>
  );
}
