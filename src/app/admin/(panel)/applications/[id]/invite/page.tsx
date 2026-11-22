import { redirect } from "next/navigation";

/**
 * Invitations are no longer needed: people create their own account, and
 * approving an application gives that account access to the community.
 */
export default async function InviteRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/applications/${id}`);
}
