import Link from "next/link";
import { ActionForm } from "@/components/forms/action-form";
import { Field, Input } from "@/components/forms/fields";
import { buttonClass } from "@/components/ui/primitives";
import { SettingsCard } from "@/components/ui/settings-card";
import { getSession, requireUser } from "@/lib/auth/guard";
import { issueStepToken } from "@/lib/security";
import { DELETION_PHRASE, DELETION_PURPOSE, DELETION_SCOPE, backupNote, deletionStepVerified } from "@/server/privacy-deletion";
import { requestDeletionAction } from "../../actions";

type Props = { searchParams: Promise<Record<string, string | undefined>> };
export const dynamic = "force-dynamic";

/**
 * Request deletion of the account and personal data, in three steps. The order is enforced on the server
 * (src/server/privacy-deletion.ts): step 2 issues a signed token; step 3 is shown only after an identity
 * check made after that token; the final submission checks all of it again. Nothing is deleted here.
 */
export default async function RequestDeletionPage({ searchParams }: Props) {
  const user = await requireUser("/account/data/delete");
  const sp = await searchParams;
  const step = sp.step === "2" || sp.step === "3" ? sp.step : "1";
  const subject = `${user.id}:${DELETION_SCOPE}`;
  return (
    <>
      <p className="mb-4 text-sm">
        <Link href="/account/data" className="text-accent-700 hover:underline">
          ← Privacy & data
        </Link>
      </p>
      <h1 className="text-2xl font-semibold text-ink-950">Request deletion of your account and personal data</h1>
      <ol className="mt-3 flex flex-wrap gap-x-4 text-xs font-medium text-ink-500" aria-label="Steps">
        <li className={step === "1" ? "text-accent-800" : ""}>1. Choose</li>
        <li className={step === "2" ? "text-accent-800" : ""}>2. What it means</li>
        <li className={step === "3" ? "text-accent-800" : ""}>3. Confirm</li>
      </ol>
      {step === "1" && (
        <SettingsCard title="What would you like?" description="Nothing is deleted on this page. You can stop at any step.">
          <form method="get" className="space-y-4 text-sm">
            <input type="hidden" name="step" value="2" />
            <label className="flex items-start gap-3">
              <input type="radio" name="scope" value={DELETION_SCOPE} required defaultChecked className="mt-1" />
              <span>
                <strong>Delete my account and my personal data.</strong> My account is closed for good and my personal information is removed, except what has
                to be kept (explained on the next page).
              </span>
            </label>
            <p className="text-ink-600">
              Something else, for example correcting information or only closing the account? Use the other options on the{" "}
              <Link href="/account/data" className="text-accent-700 underline">
                Privacy & data
              </Link>{" "}
              page.
            </p>
            <button className={buttonClass("primary")}>Continue</button>
          </form>
        </SettingsCard>
      )}
      {step === "2" && <Consequences next={`/account/data/delete?step=3&t=${encodeURIComponent(issueStepToken(DELETION_PURPOSE, subject))}`} />}
      {step === "3" && <FinalStep token={sp.t ?? ""} userId={user.id} />}
    </>
  );
}

function Consequences({ next }: { next: string }) {
  return (
    <SettingsCard title="What deletion means" description="Please read this before you continue.">
      <div className="space-y-4 text-sm leading-6 text-ink-800">
        <div>
          <p className="font-semibold text-ink-950">What happens first</p>
          <p>
            Nothing is deleted immediately. Your request goes to the owner of the community, who checks it and then carries it out. You can follow it on the
            Privacy & data page, and you receive an email when it is done.
          </p>
        </div>
        <div>
          <p className="font-semibold text-ink-950">What is deleted</p>
          <ul className="list-disc pl-5">
            <li>your profile and profile photo;</li>
            <li>your membership application;</li>
            <li>your notifications, settings and sign-in records.</li>
          </ul>
          <p>Your account is closed for good: your name and email address are removed from it and it can no longer be used to sign in.</p>
        </div>
        <div>
          <p className="font-semibold text-ink-950">What is kept, and why</p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Things you shared with others</strong>, such as your contributions in group chats, notes, tasks, decisions and files, and ideas that
              started a group. Other members rely on them. They stay, shown without your name. The owner may also remove your ideas, comments, discussions and
              chat messages; you will be told which.
            </li>
            <li>
              <strong>Project agreements you accepted.</strong> They are the record of what the participants agreed; the text, including participants’ names,
              cannot be changed.
            </li>
            <li>
              <strong>The record of the policies you accepted</strong>, this request, and the log of administrative actions, as evidence.
            </li>
            <li>Email records are kept until the email-log period ends; then they are deleted automatically.</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-ink-950">Backups</p>
          <p>{backupNote()}</p>
        </div>
        <p>
          You will leave all your groups. If you coordinate a group, another member takes over. This cannot be undone: if you want to come back later, you
          create a new account and apply again.
        </p>
        <div className="rounded-xl bg-ink-50 p-4">
          <p className="font-semibold text-ink-950">Next: confirm it is you</p>
          <p>Enter your password (and your two-step code if you use one). Then you confirm the request.</p>
          <Link href={`/account/confirm?next=${encodeURIComponent(next)}`} className={`${buttonClass("primary")} mt-3`}>
            Confirm my identity
          </Link>
        </div>
      </div>
    </SettingsCard>
  );
}

async function FinalStep({ token, userId }: { token: string; userId: string }) {
  const s = await getSession();
  const verified = deletionStepVerified(token, userId, s?.reauthAt);
  if (!verified)
    return (
      <SettingsCard title="Confirm your identity first" description="This step is available only right after you read what deletion means and confirmed your identity.">
        <Link href="/account/data/delete?step=2" className={buttonClass("secondary")}>
          Back to “What it means”
        </Link>
      </SettingsCard>
    );
  return (
    <SettingsCard title="Final confirmation" description="Your request goes to the owner for review. Nothing is deleted until then.">
      <ActionForm action={requestDeletionAction} submitLabel="Send my deletion request" pendingLabel="Sending…" variant="danger">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="scope" value={DELETION_SCOPE} />
        <label className="flex items-start gap-3 text-sm leading-6 text-ink-800">
          <input type="checkbox" name="confirm" required className="mt-1 h-4 w-4" />
          <span>I request the deletion of my account and my personal data, as explained on the previous page.</span>
        </label>
        <Field id="phrase" label={`Type ${DELETION_PHRASE} to confirm`}>
          <Input id="phrase" name="phrase" autoComplete="off" required className="max-w-64" />
        </Field>
        <Field id="details" label="Anything the owner should know (optional)">
          <textarea id="details" name="details" rows={3} maxLength={2000} className="block w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm" />
        </Field>
      </ActionForm>
    </SettingsCard>
  );
}
