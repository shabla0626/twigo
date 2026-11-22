import Link from "next/link";
import { EmptyState, PageTitle, Time } from "@/components/community/ui";
import { Button, buttonClass, cn } from "@/components/ui/primitives";
import { requireMember } from "@/lib/auth/guard";
import { listNotifications } from "@/server/community/notifications";
import { markAllReadAction, openNotificationAction } from "../../actions";

export const metadata = { title: "Notifications" };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function NotificationsPage({ searchParams }: Props) {
  const user = await requireMember();
  const sp = await searchParams;
  const unreadOnly = sp.filter === "unread";
  const { items, nextCursor } = await listNotifications(user.id, { cursor: sp.cursor, unreadOnly });
  return (
    <div className="max-w-3xl">
      <PageTitle
        title="Notifications"
        actions={
          <>
            <Link href={unreadOnly ? "/community/notifications" : "/community/notifications?filter=unread"} className={buttonClass("secondary", "sm")}>
              {unreadOnly ? "Show all" : "Unread only"}
            </Link>
            <form action={markAllReadAction}>
              <Button type="submit" variant="secondary" size="sm">
                Mark all as read
              </Button>
            </form>
            <Link href="/account/notifications" className={buttonClass("ghost", "sm")}>
              Preferences
            </Link>
          </>
        }
      />
      {items.length ? (
        <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-soft">
          {items.map((n) => (
            <li key={n.id} className={cn(!n.readAt && "bg-accent-50/60")}>
              <form action={openNotificationAction}>
                <input type="hidden" name="id" value={n.id} />
                <button type="submit" className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-ink-50">
                  <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent-600")} aria-label={n.readAt ? undefined : "Unread"} />
                  <span className="min-w-0">
                    <span className="block font-medium text-ink-950">
                      {n.title}
                      {n.count > 1 && <span className="font-normal text-ink-500"> · {n.count} times</span>}
                    </span>
                    {n.body && <span className="mt-0.5 block text-sm text-ink-600">{n.body}</span>}
                    <span className="mt-0.5 block text-xs text-ink-500">
                      <Time date={n.updatedAt} />
                    </span>
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={unreadOnly ? "No unread notifications" : "No notifications yet"} body="You will hear about replies, endorsements, new groups, announcements and meetings here." />
      )}
      {nextCursor && (
        <Link href={`/community/notifications?cursor=${nextCursor}${unreadOnly ? "&filter=unread" : ""}`} className={cn(buttonClass("secondary"), "mt-6")}>
          Older notifications
        </Link>
      )}
    </div>
  );
}
