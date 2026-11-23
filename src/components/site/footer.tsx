import Link from "next/link";
import { Container } from "../ui/primitives";
import { Logo } from "./logo";
import { MORE_LINKS } from "./nav";

export function SiteFooter({
  orgName,
  tagline,
  email,
  legalName,
  showPhotoNote = false,
}: {
  orgName: string;
  tagline: string;
  email: string;
  legalName: string;
  showPhotoNote?: boolean;
}) {
  const year = new Date().getFullYear();
  return (
    <footer className="relative overflow-hidden border-t border-ink-100 bg-ink-50 text-ink-600">
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-100/70 blur-3xl" />
      <Container className="relative grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo name={orgName} />
          <p className="mt-3 max-w-sm text-sm leading-6">{tagline}</p>
          <p className="mt-4 max-w-sm rounded-2xl bg-white/70 p-4 text-sm leading-6 text-ink-600 ring-1 ring-ink-100">
            No membership fees. No investment required. No guaranteed earnings. Pay is agreed in writing before any project work begins.
          </p>
          {email && (
            <p className="mt-4 text-sm">
              <a href={`mailto:${email}`} className="transition-colors hover:text-accent-700">
                {email}
              </a>
            </p>
          )}
        </div>
        {MORE_LINKS.map((g) => (
          <nav key={g.title} aria-label={`Footer: ${g.title}`}>
            <p className="text-sm font-semibold text-ink-900">{g.title}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="transition-colors hover:text-accent-700">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>
      <div className="relative border-t border-ink-100">
        <Container className="flex flex-col gap-2 py-6 text-xs text-ink-500 sm:flex-row sm:justify-between">
          <p>
            © {year} {legalName || orgName}. All rights reserved.
          </p>
          <p>
            Voluntary · No fees · No commission · Transparent
            {showPhotoNote && <span className="block sm:inline"> · Photographs are illustrative and do not depict members of the community.</span>}
          </p>
        </Container>
      </div>
    </footer>
  );
}
