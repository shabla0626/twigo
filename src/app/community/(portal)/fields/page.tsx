import Link from "next/link";
import type { FieldPostKind, IdeaCategory } from "@prisma/client";
import { createFieldPostAction, removeFieldPostAction } from "@/app/community/actions";
import { ReportButton } from "@/components/community/report-button";
import { TextBody, Time } from "@/components/community/ui";
import { ActionForm } from "@/components/forms/action-form";
import { CheckboxRow, Field, FormAlert, Input, Select, Textarea } from "@/components/forms/fields";
import { Badge } from "@/components/ui/primitives";
import { FIELD_GUIDES } from "@/content/fields";
import { requireMember } from "@/lib/auth/guard";
import { FIELD_POST_KINDS, IDEA_CATEGORIES } from "@/lib/validation/community";
import { listFieldPosts } from "@/server/community/fields";
import { memberLabel, teammateIds } from "@/server/community/identity";

export const metadata = { title: "Fields" };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

function yardHref(field?: string, kind?: string) {
  const p = new URLSearchParams();
  if (field) p.set("field", field);
  if (kind) p.set("kind", kind);
  const s = p.toString();
  return s ? `/community/fields?${s}#yard` : "/community/fields#yard";
}

export default async function FieldsPage({ searchParams }: Props) {
  const user = await requireMember();
  const sp = await searchParams;
  const field = sp.field && sp.field in IDEA_CATEGORIES ? (sp.field as IdeaCategory) : undefined;
  const kind = sp.kind === "EXPERIENCE" || sp.kind === "COLLABORATION" ? (sp.kind as FieldPostKind) : undefined;
  const [posts, teammates] = await Promise.all([listFieldPosts({ category: field, kind }), teammateIds(user.id)]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-ink-950 sm:text-3xl">Fields</h1>
      <p className="mt-2 text-[15px] leading-7 text-ink-600">
        These are the same areas you choose when you propose a business idea. The notes below are general knowledge, so you can see what each field usually involves. They are not job offers, and they are not a claim that a project already exists.
      </p>
      <p className="mt-3 text-sm leading-6 text-ink-600">
        The yard at the bottom is where members add their own experience, a piece of material, or a request for collaboration. Approved members can read it. It is not confidential. A note here does not create a project group and does not ask anyone for money. A business idea still starts from{" "}
        <Link href="/community/ideas/new" className="font-medium text-accent-700 hover:underline">
          Propose a Business Idea
        </Link>
        .
      </p>

      <nav aria-label="Fields" className="mt-6 flex flex-wrap gap-2">
        {FIELD_GUIDES.map((g) => (
          <a key={g.category} href={`#field-${g.category}`} className="rounded-full bg-white px-3 py-1.5 text-sm text-ink-800 ring-1 ring-ink-200 hover:bg-accent-50">
            {IDEA_CATEGORIES[g.category]}
          </a>
        ))}
      </nav>

      <div className="mt-8 space-y-6">
        {FIELD_GUIDES.map((g) => (
          <section key={g.category} id={`field-${g.category}`} className="scroll-mt-24 rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-ink-950">{IDEA_CATEGORIES[g.category]}</h2>
            <p className="mt-2 leading-7 text-ink-700">{g.about}</p>
            <p className="mt-3 text-sm leading-6 text-ink-600">
              <span className="font-semibold text-ink-800">What you can share. </span>
              {g.share}
            </p>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              <span className="font-semibold text-ink-800">What a request should say. </span>
              {g.ask}
            </p>
            <a href={yardHref(g.category, kind)} className="mt-4 inline-flex text-sm font-semibold text-accent-700 hover:underline">
              Open this field in the yard
            </a>
          </section>
        ))}
      </div>

      <section id="yard" className="mt-12 scroll-mt-24">
        <h2 className="text-xl font-semibold text-ink-950">The yard</h2>
        <p className="mt-1 text-sm leading-6 text-ink-600">Experience, material, and requests for collaboration. Filter them by field.</p>
        {sp.posted === "1" && (
          <div className="mt-4">
            <FormAlert tone="success">Your note is in the yard. Other members can read it.</FormAlert>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2" aria-label="Filter by field">
          <Link href={yardHref(undefined, kind)} className={`rounded-full px-3 py-1.5 text-sm ring-1 ${field ? "bg-white text-ink-700 ring-ink-200" : "bg-accent-700 text-white ring-accent-700"}`}>
            All categories
          </Link>
          {Object.entries(IDEA_CATEGORIES).map(([key, label]) => (
            <Link
              key={key}
              href={yardHref(key, kind)}
              className={`rounded-full px-3 py-1.5 text-sm ring-1 ${field === key ? "bg-accent-700 text-white ring-accent-700" : "bg-white text-ink-700 ring-ink-200"}`}
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Filter by kind">
          <Link href={yardHref(field)} className={`rounded-full px-3 py-1.5 text-sm ring-1 ${kind ? "bg-white text-ink-700 ring-ink-200" : "bg-ink-900 text-white ring-ink-900"}`}>
            Everything
          </Link>
          {(Object.entries(FIELD_POST_KINDS) as [FieldPostKind, string][]).map(([key, label]) => (
            <Link key={key} href={yardHref(field, key)} className={`rounded-full px-3 py-1.5 text-sm ring-1 ${kind === key ? "bg-ink-900 text-white ring-ink-900" : "bg-white text-ink-700 ring-ink-200"}`}>
              {label}
            </Link>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
          <h3 className="text-lg font-semibold text-ink-950">Add to the yard</h3>
          <ActionForm action={createFieldPostAction} submitLabel="Publish note" pendingLabel="Publishing…" className="mt-4">
            <Field id="field-category" label="Field">
              <Select id="field-category" name="category" required defaultValue={field ?? ""}>
                <option value="" disabled>
                  Choose a field
                </option>
                {Object.entries(IDEA_CATEGORIES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="field-kind" label="What this is">
              <Select id="field-kind" name="kind" required defaultValue="EXPERIENCE">
                {Object.entries(FIELD_POST_KINDS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="field-title" label="Title">
              <Input id="field-title" name="title" required minLength={5} maxLength={120} />
            </Field>
            <Field id="field-body" label="Experience, material, or request" hint="Write what you know. A material can be the text itself.">
              <Textarea id="field-body" name="body" required minLength={20} maxLength={5000} rows={6} />
            </Field>
            <Field id="field-links" label="Links to material" optional hint="One web address per line, at most five. Only what you have the right to share.">
              <Textarea id="field-links" name="links" rows={3} className="min-h-20" />
            </Field>
            <CheckboxRow id="field-ack" name="visibilityAck" label="Members can read this. It is not confidential, and I will not ask anyone for fees or investment." />
          </ActionForm>
        </div>

        <div className="mt-6 space-y-4">
          {posts.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-ink-200 bg-white p-6 text-sm leading-6 text-ink-600">Nothing in this view yet. The notes above say what is useful to add.</p>
          ) : (
            posts.map((post) => (
              <article key={post.id} className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">{IDEA_CATEGORIES[post.category]}</Badge>
                  <Badge>{FIELD_POST_KINDS[post.kind]}</Badge>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-ink-950">{post.title}</h3>
                <p className="mt-1 text-sm text-ink-500">
                  {memberLabel(post.author?.id, post.author?.profile?.displayName, teammates)} · <Time date={post.createdAt} />
                </p>
                <TextBody text={post.body} className="mt-3" />
                {post.links.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm">
                    {post.links.map((link) => (
                      <li key={link}>
                        <a href={link} target="_blank" rel="noopener noreferrer nofollow ugc" className="break-all text-accent-700 underline">
                          {link}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 flex items-center justify-between gap-3">
                  {post.author?.id === user.id ? (
                    <ActionForm action={removeFieldPostAction} submitLabel="Remove" pendingLabel="Removing…" variant="ghost" className="space-y-0">
                      <input type="hidden" name="id" value={post.id} />
                      <input type="hidden" name="field" value={field ?? ""} />
                    </ActionForm>
                  ) : (
                    <span />
                  )}
                  {post.author?.id !== user.id && <ReportButton targetType="FIELD_POST" targetId={post.id} label="Report note" />}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
