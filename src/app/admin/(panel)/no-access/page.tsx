import Link from "next/link";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/guard";

export const metadata = { title: "No permission" };

/**
 * Shown to an administrator who opened a page, or used an action, that their
 * role does not include. (Before, this ended in a generic "Something went
 * wrong" page.) Nothing was changed by the attempt.
 */
export default async function NoAccessPage() {
  await requireAdmin();
  return (
    <>
      <AdminHeader title="You don’t have permission for this" description="Your administrator role does not include this page or action. Nothing was changed." />
      <Panel title="What you can do">
        <ul className="space-y-2 text-sm leading-6 text-ink-700">
          <li>• Some areas are reserved for the owner: settings, administrators, compensation, backups, data exports and permanent deletions.</li>
          <li>• If you need something from one of these areas, ask the owner.</li>
        </ul>
        <p className="mt-4 text-sm">
          <Link href="/admin" className="font-medium text-accent-700 hover:underline">
            ← Back to the overview
          </Link>
        </p>
      </Panel>
    </>
  );
}
