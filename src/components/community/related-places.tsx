const PLACES = [
  { name: "X", href: "https://x.com", note: "Public conversation" },
  { name: "OpenAI", href: "https://openai.com", note: "AI models and research" },
  { name: "LinkedIn", href: "https://www.linkedin.com", note: "Professional profiles" },
  { name: "Freelancer", href: "https://www.freelancer.com", note: "Freelance projects" },
  { name: "Hugging Face", href: "https://huggingface.co", note: "Models, datasets, and demos" },
  { name: "GitHub", href: "https://github.com", note: "Code and projects" },
] as const;

/** External communities and project sites. Independent of Twigo; opening one leaves this page. */
export function RelatedPlaces() {
  return (
    <section aria-labelledby="related-places" className="rounded-2xl border border-ink-100 bg-white p-5">
      <h2 id="related-places" className="text-base font-semibold text-ink-950">
        Related places
      </h2>
      <p className="mt-2 text-sm leading-6 text-ink-600">
        Communities, projects, and work sites that sit alongside a discussion here. Each link opens that site in a new tab. Twigo does not run them, and a visit does not open a project group on this site.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {PLACES.map((place) => (
          <li key={place.href}>
            <a
              href={place.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-baseline justify-between gap-3 rounded-xl bg-ink-50 px-3 py-2.5 ring-1 ring-ink-100 transition hover:bg-accent-50"
            >
              <span className="font-medium text-ink-950">{place.name}</span>
              <span className="text-right text-xs text-ink-500">{place.note}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
