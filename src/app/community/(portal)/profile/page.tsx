import Link from "next/link";
import { ActionForm } from "@/components/forms/action-form";
import { FileUpload } from "@/components/community/file-upload";
import { ProfileFields } from "@/components/community/profile-fields";
import { MemberAvatar, PageTitle, Panel } from "@/components/community/ui";
import { Button } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth/guard";
import { removeProfilePhotoAction, saveProfileAction } from "../../actions";

export const metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const user = await requireMember();
  const profile = await db.memberProfile.findUniqueOrThrow({ where: { userId: user.id } });
  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle
        title="My profile"
        description="Visible to approved members only, never to the public."
        actions={
          <Link href={`/community/members/${user.id}`} className="text-sm font-medium text-accent-700 hover:underline">
            See how others see it
          </Link>
        }
      />
      <Panel title="Profile photo (optional)">
        <div className="flex flex-wrap items-center gap-5">
          <MemberAvatar name={profile.displayName} photoId={profile.photoFileId} size={72} />
          <div className="space-y-2">
            <FileUpload scope="PROFILE_PHOTO" label={profile.photoFileId ? "Change photo" : "Upload a photo"} accept="image/png,image/jpeg,image/webp,image/gif" />
            {profile.photoFileId && (
              <form action={removeProfilePhotoAction}>
                <Button type="submit" variant="ghost" size="sm">
                  Remove photo
                </Button>
              </form>
            )}
            <p className="text-xs text-ink-500">PNG, JPG, GIF or WebP up to 5 MB. Photos are cropped to a square and saved without location data.</p>
          </div>
        </div>
      </Panel>
      <Panel>
        <ActionForm action={saveProfileAction} submitLabel="Save profile">
          <ProfileFields p={profile} />
        </ActionForm>
      </Panel>
    </div>
  );
}
