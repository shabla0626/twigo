import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/forms/action-form";
import { FormAlert } from "@/components/forms/fields";
import { buttonClass } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { inspectToken } from "@/lib/auth/tokens";
import { verifyEmailAction } from "../../actions";

export const metadata: Metadata = { title: "Confirm your email address" };

// The link is only used up by pressing the button (a POST), so automatic link
// scanners in email programs cannot confirm an address just by opening the page.
export default async function VerifyEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const check = await inspectToken(token, "VERIFY_EMAIL");
  if (!check.ok) {
    return (
      <>
        <h1 className="text-2xl font-semibold text-ink-950">This link can’t be used</h1>
        <div className="mt-5 space-y-4">
          <FormAlert tone="error">
            {check.reason === "expired"
              ? "This confirmation link has expired."
              : check.reason === "used"
                ? "This confirmation link was already used. If your email is confirmed, you can simply sign in."
                : "This confirmation link is not valid. It may have been replaced by a newer email."}
          </FormAlert>
          <p className="text-sm leading-6 text-ink-600">Sign in to continue. If your email is not confirmed yet, you can ask for a new link there.</p>
          <Link href="/login" className={buttonClass("primary", "md", "w-full")}>
            Sign In
          </Link>
        </div>
      </>
    );
  }
  const account = await db.user.findUnique({ where: { id: check.userId }, select: { email: true } });
  const isChange = Boolean(check.email && account && check.email !== account.email);
  return (
    <>
      <h1 className="text-2xl font-semibold text-ink-950">Confirm your email address</h1>
      <p className="mt-2 text-[15px] leading-7 text-ink-700">
        {isChange ? "Confirm that " : "Confirm that you own "}
        <strong className="break-all text-ink-950">{check.email}</strong>
        {isChange ? " should become the email address of your account." : "."}
      </p>
      <ActionForm action={verifyEmailAction} submitLabel={isChange ? "Confirm new email" : "Confirm my email"} pendingLabel="Confirming…" fullWidth className="mt-6">
        <input type="hidden" name="token" value={token} />
      </ActionForm>
    </>
  );
}
