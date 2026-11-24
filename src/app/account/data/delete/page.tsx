import Link from "next/link";
import { ActionForm } from "@/components/forms/action-form";
import { Field, Input } from "@/components/forms/fields";
import { buttonClass } from "@/components/ui/primitives";
import { SettingsCard } from "@/components/ui/settings-card";
import { getSession, requireUser } from "@/lib/auth/guard";
import { issueStepToken } from "@/lib/security";
import type { ErasureChoices } from "@/ops/erasure";
import { DELETION_PHRASE, DELETION_PURPOSE, DELETION_SCOPE, backupNote, deletionStepVerified, stepSubject } from "@/server/privacy-deletion";
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
  // The member's own choices about content they wrote (bound into the step token, so they cannot change later).
  const choices = { removeIdeas: sp.i === "1", removeComments: sp.c === "1", removeChat: sp.m === "1" };
  const q = `i=${choices.removeIdeas ? 1 : 0}&c=${choices.removeComments ? 1 : 0}&m=${choices.removeChat ? 1 : 0}`;
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
            <fieldset className="space-y-2 rounded-xl bg-ink-50 p-4">
              <legend className="font-medium text-ink-900">What you wrote for others</legend>
              <p className="text-ink-700">
                By default, what you contributed to the community stays, shown without your name, because other members rely on it. You can ask for these to
                be removed as well:
              </p>
              <label className="flex items-start gap-3">
                <input type="checkbox" name="i" value="1" className="mt-1" /> <span>Remove my ideas that did not start a group</span>
              </label>
              <label className="flex items-start gap-3">
                <input type="checkbox" name="c" value="1" className="mt-1" /> <span>Remove my comments and group discussions</span>
              </label>
              <label className="flex items-start gap-3">
                <input type="checkbox" name="m" value="1" className="mt-1" /> <span>Remove my chat messages</span>
              </label>
              <p className="text-xs text-ink-600">Research notes, tasks, decisions, links, files and ideas that started a group are shared group records and always stay, without your name.</p>
            </fieldset>
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
      {step === "2" && <Consequences choices={choices} next={`/account/data/delete?step=3&${q}&t=${encodeURIComponent(issueStepToken(DELETION_PURPOSE, stepSubject(user.id, choices)))}`} />}
      {step === "3" && <FinalStep token={sp.t ?? ""} userId={user.id} choices={choices} />}
    </>
  );
}

function Consequences({ next, choices }: { next: string; choices: ErasureChoices }) {
  return (
    <SettingsCard title="What deletion means" description="Please read this before you continue.">
      <div className="space-y-4 text-sm leading-6 text-ink-800">
        <div>
          <p className="font-semibold text-ink-950">What happens first</p>
          <p>
            Nothing is deleted immediately. Your request goes to the community’s management team, who check it and then carry it out (the owner
            decides where something must be kept, for example for a legal obligation or a dispute). You can follow it on the Privacy & data page, and
            you receive an email when it is done.
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
              started a group. Other members rely on them. They stay, shown without your name. Your ideas, comments, discussions and chat
              messages are removed too if you asked for it in step 1. You asked to remove:{" "}
              {[choices.removeIdeas && "your ideas without a group", choices.removeComments && "your comments and discussions", choices.removeChat && "your chat messages"].filter(Boolean).join(", ") || "nothing (go back to change this)"}.
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

async function FinalStep({ token, userId, choices }: { token: string; userId: string; choices: ErasureChoices }) {
  const s = await getSession();
  const verified = deletionStepVerified(token, userId, choices, s?.reauthAt);
  if (!verified)
    return (
      <SettingsCard title="Confirm your identity first" description="This step is available only right after you read what deletion means and confirmed your identity.">
        <Link href="/account/data/delete?step=2" className={buttonClass("secondary")}>
          Back to “What it means”
        </Link>
      </SettingsCard>
    );
  return (
    <SettingsCard title="Final confirmation" description="Your request goes to the management team for review. Nothing is deleted until then.">
      <ActionForm action={requestDeletionAction} submitLabel="Send my deletion request" pendingLabel="Sending…" variant="danger">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="scope" value={DELETION_SCOPE} />
        {choices.removeIdeas && <input type="hidden" name="removeIdeas" value="on" />}
        {choices.removeComments && <input type="hidden" name="removeComments" value="on" />}
        {choices.removeChat && <input type="hidden" name="removeChat" value="on" />}
        <label className="flex items-start gap-3 text-sm leading-6 text-ink-800">
          <input type="checkbox" name="confirm" required className="mt-1 h-4 w-4" />
          <span>I request the deletion of my account and my personal data, as explained on the previous page.</span>
        </label>
        <Field id="phrase" label={`Type ${DELETION_PHRASE} to confirm`}>
          <Input id="phrase" name="phrase" autoComplete="off" required className="max-w-64" />
        </Field>
        <Field id="details" label="Anything we should know (optional)">
          <textarea id="details" name="details" rows={3} maxLength={2000} className="block w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm" />
        </Field>
      </ActionForm>
    </SettingsCard>
  );
}
