import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/forms/action-form";
import { PageHeader, Section } from "@/components/ui/primitives";
import { getCurrentUser } from "@/lib/auth/guard";
import { pendingReacceptance } from "@/server/legal";
import { acceptUpdatedDocumentsAction } from "./actions";

export const metadata = { title: "Updated documents", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Shown when a reviewed version of a document you accepted changed materially. */
export default async function ReviewUpdatedDocumentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/legal/review");
  const pending = await pendingReacceptance(user.id);
  if (!pending.length) redirect("/continue");
  return (
    <>
      <PageHeader eyebrow="Legal" title="Please review the updated documents" intro="A document you accepted has changed materially. Read the new version; you can continue after accepting it. Earlier versions stay available." />
      <Section tone="gray">
        <div className="mx-auto max-w-2xl rounded-3xl border border-ink-100 bg-white p-6 shadow-soft sm:p-8">
          <ActionForm action={acceptUpdatedDocumentsAction} submitLabel="Accept and continue">
            {pending.map((p) => (
              <label key={p.versionId} className="flex items-start gap-3 text-sm leading-6 text-ink-700">
                <input type="checkbox" name="versionId" value={p.versionId} required className="mt-1 h-4 w-4 rounded border-ink-300 text-accent-700" />
                <span>
                  {p.kind === "ACKNOWLEDGED" ? "I have read the " : "I accept the "}
                  <Link href={`/legal/${p.key}/v/${p.version}`} target="_blank" className="font-medium text-accent-700 underline">
                    {p.title}, version {p.version}
                  </Link>
                  .
                </span>
              </label>
            ))}
          </ActionForm>
          <p className="mt-6 text-sm leading-6 text-ink-600">
            If you do not want to accept, you can stop using the community and close your account under Account settings, or contact us first.
          </p>
        </div>
      </Section>
    </>
  );
}
