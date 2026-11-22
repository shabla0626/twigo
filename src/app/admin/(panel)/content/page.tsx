import Link from "next/link";
import { AdminHeader, Flash, Panel, smallInput, smallLabel } from "@/components/admin/ui";
import { buttonClass, cn } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { getSiteContent } from "@/lib/content";
import { CONTENT_KEYS, type ContentKey, type SiteContentMap } from "@/lib/content/schema";
import { resetContentAction, saveContentAction } from "../../actions/content";

const TITLES: Record<ContentKey, string> = {
  company: "Company information",
  hero: "Home page hero",
  announcement: "Recruitment announcement",
  contact: "Contact information",
  faq: "FAQ",
  categories: "Participation categories",
};

function TextField({ name, label, value, rows, max }: { name: string; label: string; value: string; rows?: number; max: number }) {
  const id = `f-${name.replace(/\./g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className={smallLabel}>
        {label}
      </label>
      {rows ? (
        <textarea id={id} name={name} rows={rows} maxLength={max} defaultValue={value} className={smallInput} />
      ) : (
        <input id={id} name={name} maxLength={max} defaultValue={value} className={smallInput} />
      )}
    </div>
  );
}

function Editor({ k, c }: { k: ContentKey; c: SiteContentMap }) {
  switch (k) {
    case "company":
      return (
        <>
          <TextField name="name" label="Organization display name" value={c.company.name} max={80} />
          <TextField name="tagline" label="Tagline" value={c.company.tagline} max={160} />
          <TextField name="mission" label="Mission statement" value={c.company.mission} rows={4} max={600} />
        </>
      );
    case "hero":
      return (
        <>
          <TextField name="eyebrow" label="Small label above headline" value={c.hero.eyebrow} max={80} />
          <TextField name="headline" label="Headline" value={c.hero.headline} max={120} />
          <TextField name="subheadline" label="Sub-headline" value={c.hero.subheadline} rows={3} max={400} />
        </>
      );
    case "announcement":
      return (
        <>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="enabled" defaultChecked={c.announcement.enabled} className="accent-accent-700" />
            Show announcement on home page
          </label>
          <TextField name="title" label="Title" value={c.announcement.title} max={120} />
          <TextField name="body" label="Body" value={c.announcement.body} rows={4} max={800} />
        </>
      );
    case "contact":
      return (
        <>
          <TextField name="email" label="Official contact email (leave empty to show a placeholder)" value={c.contact.email} max={200} />
          <TextField name="responseNote" label="Response-time note" value={c.contact.responseNote} rows={2} max={300} />
        </>
      );
    case "faq":
      return (
        <>
          <p className="text-xs text-ink-600">Clear both fields of an item to remove it. Two blank rows are provided for new questions.</p>
          {[...c.faq.items, { q: "", a: "" }, { q: "", a: "" }].map((item, i) => (
            <div key={i} className="space-y-2 rounded-md border border-ink-200 p-3">
              <TextField name={`items.${i}.q`} label={`Question ${i + 1}`} value={item.q} max={200} />
              <TextField name={`items.${i}.a`} label="Answer" value={item.a} rows={3} max={1500} />
            </div>
          ))}
        </>
      );
    case "categories":
      return (
        <>
          <p className="text-xs text-ink-600">Clear all fields of an item to remove it.</p>
          {[...c.categories.items, { title: "", description: "", examples: "" }].map((item, i) => (
            <div key={i} className="space-y-2 rounded-md border border-ink-200 p-3">
              <TextField name={`items.${i}.title`} label={`Category ${i + 1} title`} value={item.title} max={80} />
              <TextField name={`items.${i}.description`} label="Description" value={item.description} rows={2} max={400} />
              <TextField name={`items.${i}.examples`} label="Examples" value={item.examples} max={300} />
            </div>
          ))}
        </>
      );
  }
}

export default async function ContentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("content.edit");
  const sp = await searchParams;
  const section = (CONTENT_KEYS as string[]).includes(sp.section ?? "") ? (sp.section as ContentKey) : "company";
  const content = await getSiteContent();

  return (
    <>
      <AdminHeader
        title="Website content"
        description="Edit public website text. Changes are published immediately. Project opportunities are published from the Projects page."
      />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Content sections">
          <ul className="flex gap-1 overflow-x-auto lg:block lg:space-y-1">
            {CONTENT_KEYS.map((k) => (
              <li key={k} className="shrink-0">
                <Link
                  href={`/admin/content?section=${k}`}
                  aria-current={k === section ? "page" : undefined}
                  className={cn(
                    "block whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium",
                    k === section ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-white",
                  )}
                >
                  {TITLES[k]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <Panel title={TITLES[section]}>
          <form action={saveContentAction} className="space-y-4">
            <input type="hidden" name="key" value={section} />
            <Editor k={section} c={content} />
            <button type="submit" className={buttonClass("primary", "sm")}>
              Save and publish
            </button>
          </form>
          <form action={resetContentAction} className="mt-6 border-t border-ink-200 pt-4">
            <input type="hidden" name="key" value={section} />
            <button type="submit" className="text-sm text-ink-600 hover:underline">
              Reset this section to default text
            </button>
          </form>
        </Panel>
      </div>
    </>
  );
}
