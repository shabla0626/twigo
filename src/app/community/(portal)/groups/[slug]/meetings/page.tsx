import { MEETING_MAX_HOURS, isPastLimit, mayEndMeeting } from "@/server/community/meetings";
import { FormAlert } from "@/components/forms/fields";
import { IconVideo } from "@/components/community/icons";
import { MembersOnly } from "@/components/community/members-only";
import { StartMeetingForm } from "@/components/community/start-meeting";
import { Panel, Time } from "@/components/community/ui";
import { Button } from "@/components/ui/primitives";
import { groupMeetingNow, loadGroupPage } from "@/server/community/group-page";
import { meetingHistory } from "@/server/community/meetings";
import { endMeetingAction, joinMeetingAction, startMeetingAction } from "../../../../actions";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

/** Meetings. They are held in Google Meet; this site only shares the link with the group. */
export default async function MeetingsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { user, group, isMember, isCoordinator, isOpen } = await loadGroupPage(slug);
  if (!isMember) return <MembersOnly groupId={group.id} what="Meetings" canJoin={isOpen} />;
  const [current, history] = await Promise.all([groupMeetingNow(group.id), meetingHistory(group.id, user.id)]);
  const Icon = IconVideo;
  // After the first hour anyone in the group may end a meeting its starter forgot.
  const canEnd = current ? mayEndMeeting(current, user.id, isCoordinator) : false;
  return (
    <div className="max-w-3xl space-y-6">
      {error && <FormAlert tone="error">{error}</FormAlert>}
      {current ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6" aria-labelledby="live-h">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
            In progress
          </p>
          <h2 id="live-h" className="mt-1 flex items-center gap-2 text-xl font-semibold text-ink-950">
            <Icon className="h-6 w-6 text-emerald-700" />
            {current.title || "Meeting"}
          </h2>
          <p className="mt-1 text-sm text-ink-700">
            Started by {current.startedBy?.profile?.displayName ?? "a member"} · <Time date={current.startedAt} />
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <form action={joinMeetingAction}>
              <input type="hidden" name="groupId" value={group.id} />
              <input type="hidden" name="meetingId" value={current.id} />
              <Button type="submit" size="lg">
                <Icon className="h-5 w-5" /> Join Meeting
              </Button>
            </form>
            {canEnd && (
              <form action={endMeetingAction}>
                <input type="hidden" name="groupId" value={group.id} />
                <input type="hidden" name="meetingId" value={current.id} />
                <Button type="submit" variant="secondary" size="lg">
                  End meeting
                </Button>
              </form>
            )}
          </div>
          <div className="mt-5 rounded-xl bg-white/80 p-4 text-sm leading-6 text-ink-700">
            <p className="font-medium text-ink-900">The meeting opens in Google Meet.</p>
            <p>
              Use the buttons at the bottom of the Google Meet window to <strong>mute or unmute</strong>, turn your <strong>camera on or off</strong>, and{" "}
              <strong>leave</strong> the call. Joining with voice only is fine.
              {canEnd ? " When everyone has left, press “End meeting” here." : ""} A meeting is shown as in progress for at most {MEETING_MAX_HOURS} hours.
            </p>
          </div>
        </section>
      ) : isOpen ? (
        <Panel title="Start a meeting">
          <StartMeetingForm groupId={group.id} action={startMeetingAction} />
        </Panel>
      ) : (
        <p className="text-sm text-ink-600">This group is read-only, so new meetings cannot be started.</p>
      )}

      <details className="rounded-2xl border border-ink-100 bg-white p-5">
        <summary className="cursor-pointer font-semibold text-ink-950">Past meetings ({history.length})</summary>
        {history.length ? (
          <ul className="mt-3 divide-y divide-ink-100 text-sm">
            {history.map((m) => (
              <li key={m.id} className="flex flex-wrap justify-between gap-2 py-2.5">
                <span className="text-ink-800">
                  {m.title || "Meeting"} · started by {m.startedBy?.profile?.displayName ?? "a member"}
                </span>
                <span className="text-ink-500">
                  <Time date={m.startedAt} /> · {m._count.attendance} joined · {m.endedAt || isPastLimit(m.startedAt) ? "ended" : "in progress"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-600">No meetings yet.</p>
        )}
      </details>

      <details className="rounded-2xl border border-ink-100 bg-white p-5">
        <summary className="cursor-pointer font-semibold text-ink-950">Privacy and safety</summary>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-ink-700">
          <li>• The meeting link is shown only to current group members.</li>
          <li>• Anyone who has a Google Meet link can ask to join, so use a new link for each meeting and keep it within the group.</li>
          <li>• In Google Meet, the person who created the link can admit or remove participants.</li>
          <li>• Meetings are not recorded by this site. It stores only who started a meeting, when, and who pressed Join.</li>
        </ul>
      </details>
    </div>
  );
}
