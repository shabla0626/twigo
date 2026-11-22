import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/forms/action-form";
import { FormAlert } from "@/components/forms/fields";
import { ProfileFields } from "@/components/community/profile-fields";
import { Logo } from "@/components/site/logo";
import { brand } from "@/config/brand";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guard";
import { getSetting } from "@/server/settings";
import { createProfileAction } from "../actions";

export const metadata: Metadata = { title: "Welcome", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function WelcomePage({ searchParams }: Props) {
  const user = await requireUser("/community/welcome");
  if (!user.communityAccess) redirect("/continue");
  const sp = await searchParams;
  const [profile, threshold] = await Promise.all([db.memberProfile.findUnique({ where: { userId: user.id } }), getSetting("community.endorsementThreshold")]);
  if (profile && !sp.activated) redirect("/community");
  return (
    <div className="min-h-dvh bg-gradient-to-b from-accent-50 via-white to-sky-50 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <Logo name={brand().name} />
        <div className="mt-8 rounded-3xl border border-ink-100 bg-white p-7 shadow-soft-lg sm:p-9">
          {sp.activated && <FormAlert tone="success">Your account is active. Welcome!</FormAlert>}
          <h1 className="mt-4 text-2xl font-semibold text-ink-950">Set up your member profile</h1>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            Other members see this when you propose ideas, comment or join groups. Only your display name is required; add more whenever you like.
          </p>
          <ul className="mt-5 space-y-2 rounded-2xl bg-ink-50 p-4 text-sm leading-6 text-ink-700">
            <li>• Any member can propose a business idea. When {threshold} other members support it, a research group is created automatically.</li>
            <li>• Groups research opportunities together with chat, meetings and shared notes.</li>
            <li>• Paid work only begins after the organization approves a project and everyone signs a written agreement.</li>
            <li>
              • Nobody may ask you for fees or investments. Report it if it happens.{" "}
              <Link href="/community-rules" className="font-medium text-accent-700 underline">
                Read the community rules
              </Link>
            </li>
          </ul>
          <ActionForm action={createProfileAction} submitLabel="Save and enter the community" className="mt-6">
            <ProfileFields p={profile} fallbackName={user.name.split(" ")[0]} />
          </ActionForm>
        </div>
      </div>
    </div>
  );
}
