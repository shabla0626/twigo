import Link from "next/link";
import { buttonClass, Container } from "../ui/primitives";
import { MobileNav } from "./mobile-nav";
import { NAV_LINKS } from "./nav";
import { Logo } from "./logo";

export { Logo };

export function SiteHeader({ orgName }: { orgName: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <Container className="relative flex h-16 items-center justify-between gap-6">
        <Link href="/" className="shrink-0 rounded-md" aria-label={`${orgName} home`}>
          <Logo name={orgName} />
        </Link>
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-accent-50 hover:text-accent-800"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          {/* On phones, Sign in is in the menu. */}
          <span className="hidden sm:block">
            <Link href="/login" className={buttonClass("ghost", "sm")}>
              Sign In
            </Link>
          </span>
          <Link href="/join" className={buttonClass("primary", "sm")}>
            Join {orgName}
          </Link>
          <MobileNav orgName={orgName} />
        </div>
      </Container>
    </header>
  );
}
