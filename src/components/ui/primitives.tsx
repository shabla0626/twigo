import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

export function Section({
  id,
  className,
  children,
  tone = "white",
  labelledBy,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
  /** white, light gray, soft blue, or a soft teal gradient (bright palette only; no dark sections). */
  tone?: "white" | "gray" | "blue" | "soft";
  labelledBy?: string;
}) {
  const toneClass = {
    white: "bg-white",
    gray: "bg-ink-50",
    blue: "bg-sky-50",
    soft: "bg-gradient-to-br from-accent-50 via-white to-sky-50",
  }[tone];
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn("py-16 sm:py-24", toneClass, className)}>
      <Container>{children}</Container>
    </section>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-sm font-semibold uppercase tracking-wider text-accent-700", className)}>{children}</p>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  intro,
  align = "left",
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  intro?: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 id={id} className="mt-2 text-3xl font-semibold sm:text-4xl">
        {title}
      </h2>
      {intro && <div className="mt-4 text-lg leading-8 text-ink-600">{intro}</div>}
    </div>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
const variants: Record<Variant, string> = {
  primary: "bg-accent-700 text-white shadow-md shadow-accent-700/20 hover:bg-accent-800 hover:shadow-lg hover:shadow-accent-700/25",
  secondary: "bg-white text-ink-900 ring-1 ring-inset ring-ink-200 shadow-sm hover:bg-accent-50 hover:ring-accent-200",
  ghost: "text-ink-700 hover:bg-ink-100",
  danger: "bg-red-700 text-white hover:bg-red-800",
  soft: "bg-accent-100 text-accent-800 hover:bg-accent-200",
};
const sizes = { sm: "px-3.5 py-1.5 text-sm", md: "px-5 py-2.5 text-sm", lg: "px-7 py-3 text-base" };

export function buttonClass(variant: Variant = "primary", size: keyof typeof sizes = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-ink-100 bg-white p-6 shadow-soft transition duration-300 hover:-translate-y-1 hover:border-accent-200 hover:shadow-soft-lg",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "warn" | "success" | "danger" }) {
  const tones = {
    neutral: "bg-ink-100 text-ink-700",
    accent: "bg-accent-100 text-accent-800",
    warn: "bg-amber-100 text-amber-900",
    success: "bg-emerald-100 text-emerald-800",
    danger: "bg-red-100 text-red-800",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>
  );
}

/** Inline marker for information that must be confirmed before launch. */
export function Placeholder({ children }: { children: ReactNode }) {
  return <span className="placeholder-tag">[{children}]</span>;
}

export function PageHeader({
  eyebrow,
  title,
  intro,
  visual,
  visualSize = "lg",
  actions,
}: {
  eyebrow?: string;
  title: string;
  intro?: ReactNode;
  /** Usually a <Photo />. Shown beside the text on large screens, below it on mobile. */
  visual?: ReactNode;
  /** "sm" keeps the image restrained (FAQ, Apply, Contact). */
  visualSize?: "lg" | "sm";
  actions?: ReactNode;
}) {
  return (
    <header className="relative overflow-hidden border-b border-ink-100 bg-gradient-to-br from-sky-50 via-white to-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="anim-drift absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent-100 opacity-80 blur-3xl" />
        <div
          className="anim-drift absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-violet-100 opacity-70 blur-3xl"
          style={{ animationDelay: "-9s" }}
        />
        <div
          className="absolute inset-0 opacity-[0.25]"
          style={{
            backgroundImage: "radial-gradient(var(--color-ink-300) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            maskImage: "linear-gradient(to right, transparent, black 60%)",
          }}
        />
      </div>
      <Container
        className={cn(
          "relative py-12 sm:py-16 lg:py-20",
          Boolean(visual) && "grid items-center gap-10",
          Boolean(visual) && (visualSize === "lg" ? "lg:grid-cols-[1.1fr_1fr] lg:gap-14" : "lg:grid-cols-[1.6fr_1fr] lg:gap-14"),
        )}
      >
        <div>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h1 className="mt-2 max-w-3xl text-4xl font-semibold text-ink-950 sm:text-5xl">{title}</h1>
          {intro && <div className="mt-5 max-w-3xl text-lg leading-8 text-ink-700">{intro}</div>}
          {actions && <div className="mt-8 flex flex-col gap-3 sm:flex-row">{actions}</div>}
        </div>
        {visual && <div className={cn("w-full", visualSize === "sm" && "mx-auto max-w-md lg:max-w-sm")}>{visual}</div>}
      </Container>
    </header>
  );
}

export function Notice({ children, tone = "info", title }: { children: ReactNode; tone?: "info" | "warn"; title?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 text-sm leading-6",
        tone === "info" ? "border-accent-100 bg-accent-50 text-ink-800" : "border-amber-200 bg-amber-50 text-amber-950",
      )}
    >
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? "mt-1" : undefined}>{children}</div>
    </div>
  );
}
