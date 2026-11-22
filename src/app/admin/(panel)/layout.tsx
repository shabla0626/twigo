import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guard";
import { logoutAction } from "../../(auth)/actions";
import { can, type Permission } from "@/lib/auth/permissions";
import { AdminNav, type NavItem } from "./admin-nav";

const NAV: (NavItem & { perm: Permission })[] = [
  { href: "/admin", label: "Overview", exact: true, perm: "admin.access", section: "" },
  { href: "/admin/applications", label: "Applications", perm: "applications.view", section: "People" },
  { href: "/admin/members", label: "Members", perm: "members.view", section: "People" },
  { href: "/admin/participants", label: "Participants", perm: "participants.manage", section: "People" },
  { href: "/admin/admins", label: "Administrators", perm: "admins.manage", section: "People" },
  { href: "/admin/reports", label: "Reports & moderation", perm: "moderation.act", section: "Community" },
  { href: "/admin/ideas", label: "Ideas", perm: "moderation.act", section: "Community" },
  { href: "/admin/groups", label: "Research groups", perm: "groups.manage", section: "Community" },
  { href: "/admin/projects", label: "Projects", perm: "projects.manage", section: "Business" },
  { href: "/admin/inquiries", label: "Customer inquiries", perm: "inquiries.manage", section: "Business" },
  { href: "/admin/email", label: "Email", perm: "email.send", section: "Website & email" },
  { href: "/admin/content", label: "Website content", perm: "content.edit", section: "Website & email" },
  { href: "/admin/settings", label: "Settings", perm: "settings.manage", section: "System" },
  { href: "/admin/privacy", label: "Privacy & retention", perm: "retention.preview", section: "System" },
  { href: "/admin/backups", label: "Backups", perm: "backups.manage", section: "System" },
  { href: "/admin/audit", label: "Audit log", perm: "audit.view", section: "System" },
];

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="min-h-dvh bg-ink-50 lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="border-b border-ink-200 bg-ink-950 text-ink-200 lg:min-h-dvh lg:border-b-0">
        <div className="flex items-center justify-between px-5 py-4 lg:block">
          <Link href="/admin" className="text-base font-semibold text-white">
            Admin dashboard
          </Link>
          <p className="hidden text-xs text-ink-400 lg:mt-1 lg:block">
            {admin.email} · {admin.role === "OWNER" ? "Owner" : "Administrator"}
          </p>
        </div>
        <AdminNav items={NAV.filter((n) => can(admin.role, n.perm)).map((n) => ({ href: n.href, label: n.label, exact: n.exact, section: n.section }))} />
        <div className="border-t border-white/10 px-5 py-4 lg:mt-6">
          <form action={logoutAction}>
            <button type="submit" className="text-sm text-ink-300 hover:text-white">
              Sign out
            </button>
          </form>
          <Link href="/account/security" className="mt-2 block text-sm text-ink-400 hover:text-white">
            My security settings
          </Link>
          <Link href="/community" className="mt-2 block text-sm text-ink-400 hover:text-white">
            Member community
          </Link>
          <Link href="/" className="mt-2 block text-sm text-ink-400 hover:text-white">
            View public site ↗
          </Link>
        </div>
      </aside>
      <main id="main" className="min-w-0 px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
