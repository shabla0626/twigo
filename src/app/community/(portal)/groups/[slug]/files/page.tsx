import { redirect } from "next/navigation";

/** Files and links now live on the group's Research tab; keep old links working. */
export default async function FilesRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/community/groups/${slug}/research#files`);
}
