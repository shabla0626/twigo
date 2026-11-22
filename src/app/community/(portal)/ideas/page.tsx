import { redirect } from "next/navigation";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

/** The Business Ideas feed is the community landing page; keep old links working. */
export default async function IdeasRedirect({ searchParams }: Props) {
  const sp = await searchParams;
  const p = new URLSearchParams();
  for (const k of ["q", "category", "sort", "cursor"]) if (sp[k]) p.set(k, sp[k]!);
  redirect(p.size ? `/community?${p.toString()}` : "/community");
}
