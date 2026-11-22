import Link from "next/link";
import { AdminHeader, Flash, Panel, Table, fmtDate, smallInput, smallLabel } from "@/components/admin/ui";
import { readFlash } from "@/lib/flash";
import { ActionForm } from "@/components/forms/action-form";
import { buttonClass } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { isRecentlyAuthenticated, requireAdmin } from "@/lib/auth/guard";
import { ROLE_PERMISSIONS } from "@/lib/auth/permissions";
import { inviteAdminAction, setRoleAction } from "../../actions/community";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function AdminsPage({ searchParams }: Props) {
  const owner = await requireAdmin("admins.manage");
  const sp = await searchParams;
  const recent = await isRecentlyAuthenticated();
  const admins = await db.user.findMany({ where: { role: { in: ["OWNER", "ADMIN"] } }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, role: true, status: true, totpEnabledAt: true, lastLoginAt: true } });
  const ownerOnly = ROLE_PERMISSIONS.OWNER.filter((p) => !ROLE_PERMISSIONS.ADMIN.includes(p));
  return (
    <>
      <AdminHeader title="Administrators" description="Only the owner can add administrators or change roles. Role changes sign the person out." />
      <Flash {...readFlash(sp)} />
      {!recent && (
        <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Changes here need a fresh identity confirmation.{" "}
          <Link href="/account/confirm?next=/admin/admins" className="font-medium underline">
            Confirm now
          </Link>
        </p>
      )}
      <div className="mt-6">
        <Table head={["Name", "Email", "Role", "Status", "2FA", "Last sign-in", "Change role"]}>
          {admins.map((a) => (
            <tr key={a.id}>
              <td className="px-4 py-3">{a.name}</td>
              <td className="px-4 py-3">{a.email}</td>
              <td className="px-4 py-3">{a.role === "OWNER" ? "Owner" : "Administrator"}</td>
              <td className="px-4 py-3">{a.status.toLowerCase()}</td>
              <td className="px-4 py-3">{a.totpEnabledAt ? "On" : <span className="text-amber-700">Not set up</span>}</td>
              <td className="px-4 py-3">{fmtDate(a.lastLoginAt)}</td>
              <td className="px-4 py-3">
                {a.id !== owner.id && (
                  <form action={setRoleAction} className="flex gap-1">
                    <input type="hidden" name="id" value={a.id} />
                    <label htmlFor={`role-${a.id}`} className="sr-only">
                      Role
                    </label>
                    <select id={`role-${a.id}`} name="role" defaultValue={a.role} className={`${smallInput} w-auto py-1`}>
                      <option value="OWNER">Owner</option>
                      <option value="ADMIN">Administrator</option>
                      <option value="MEMBER">Member (remove admin rights)</option>
                    </select>
                    <button className={buttonClass("secondary", "sm")}>Set</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Invite an administrator">
          <ActionForm action={inviteAdminAction} submitLabel="Send invitation" resetOnSuccess>
            <div>
              <label htmlFor="name" className={smallLabel}>
                Name
              </label>
              <input id="name" name="name" required maxLength={100} className={smallInput} />
            </div>
            <div>
              <label htmlFor="email" className={smallLabel}>
                Email
              </label>
              <input id="email" name="email" type="email" required className={smallInput} />
            </div>
            <div>
              <label htmlFor="role" className={smallLabel}>
                Role
              </label>
              <select id="role" name="role" defaultValue="ADMIN" className={smallInput}>
                <option value="ADMIN">Administrator</option>
                <option value="OWNER">Owner</option>
              </select>
            </div>
          </ActionForm>
        </Panel>
        <Panel title="What only the owner can do">
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-ink-700">
            {ownerOnly.map((p) => (
              <li key={p}>
                <code>{p}</code>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-500">Defined in src/lib/auth/permissions.ts. Administrators must use two-step verification.</p>
        </Panel>
      </div>
    </>
  );
}
