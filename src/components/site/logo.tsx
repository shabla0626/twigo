// Logo mark used across the public site, member portal and admin. Change the
// organization name with ORG_NAME (see src/config/brand.ts).
export function Logo({ name, onDark = false }: { name: string; onDark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
        <defs>
          <linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4cc3cf" />
            <stop offset="100%" stopColor="#0f7f8e" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#logo-grad)" />
        <circle cx="12" cy="16" r="6" fill="none" strokeWidth="2.4" stroke="#ffe3cf" />
        <circle cx="20" cy="16" r="6" fill="none" strokeWidth="2.4" stroke="white" />
      </svg>
      <span className={onDark ? "text-lg font-semibold tracking-tight text-white" : "text-lg font-semibold tracking-tight text-ink-950"}>{name}</span>
    </span>
  );
}
