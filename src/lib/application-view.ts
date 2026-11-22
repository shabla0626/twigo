import type { ApplicationStatus } from "@prisma/client";
import { APPLICANT_STATUS_LABELS } from "@/lib/labels";

/** What the status means and what happens next, in plain words. No decision dates are promised. */
export const NEXT_STEPS: Record<ApplicationStatus, { action: boolean; text: string }> = {
  DRAFT: { action: true, text: "Your application is not finished yet. Continue where you stopped; your earlier answers are saved." },
  SUBMITTED: { action: false, text: "We received your application. A person will review it. You don’t need to do anything right now; any update will appear on this page." },
  UNDER_REVIEW: { action: false, text: "Your application is being reviewed by a person. You don’t need to do anything right now." },
  INTERVIEW_REQUESTED: { action: true, text: "We would like to have a short, informal conversation with you. Please see the details below and reply with a time that works for you. There is no cost of any kind." },
  WAITLISTED: { action: false, text: "Your application is on our waiting list for now. This usually means there is not yet enough activity that matches your skills or time. We will update this page if that changes." },
  ACCEPTED: { action: false, text: "Your application was accepted. Welcome! You can enter the member community with the email and password you already use." },
  DECLINED: { action: false, text: "After careful review, we are not able to offer you a place at this stage. This reflects our current, very early needs and is not a judgment of your abilities. You are welcome to apply again later." },
  WITHDRAWN: { action: false, text: "You withdrew your application. You can start a new one whenever you like." },
};

export type ApplicationView = {
  /** The one headline of the status page. */
  label: string;
  /** The one explanation under it. */
  text: string;
  /** "Your action is needed" / "No action needed from you", or nothing. */
  badge: string | null;
  /** Shown as a notice (amber) instead of ordinary text. */
  notice: boolean;
  /** Whether "Start / Continue my application" is offered. */
  mayStart: boolean;
};

/**
 * What a signed-in person sees on "Your application": ONE headline and ONE explanation,
 * chosen in a fixed order, so the page can never say two things that contradict each other
 * (for example "accepted, you can enter" under "access paused").
 *
 * 1. Access paused or removed: only that is said.
 * 2. A member without an application of their own (an account created by an administrator):
 *    "You Are a Member", and no offer to apply.
 * 3. Accepted but access not yet in place: said honestly, with whom to ask.
 * 4. Otherwise the status of the application, or "not started".
 */
export function applicationView(p: { membership: "NONE" | "ACTIVE" | "SUSPENDED" | "REVOKED"; communityAccess: boolean; status: ApplicationStatus | null; contact?: string | null }): ApplicationView {
  const contactLine = p.contact ? `If you have questions, write to ${p.contact}.` : "If you have questions, reply to any email you received from us.";
  if (p.membership === "SUSPENDED" || p.membership === "REVOKED") {
    const paused = p.membership === "SUSPENDED";
    return {
      label: paused ? "Community Access Paused" : "Community Access Removed",
      text: `${paused ? "Your access to the member community is paused at the moment." : "Your access to the member community has been removed."} You can still sign in and see this page. ${contactLine}`,
      badge: null,
      notice: true,
      mayStart: false,
    };
  }
  if (p.communityAccess && (!p.status || p.status === "DRAFT")) {
    return { label: "You Are a Member", text: "You have access to the member community with the email and password you already use.", badge: null, notice: false, mayStart: false };
  }
  if (p.status === "ACCEPTED" && !p.communityAccess) {
    return {
      label: APPLICANT_STATUS_LABELS.ACCEPTED,
      text: `Your application was accepted. Your access to the member community is being set up. If you cannot enter by tomorrow, please tell us. ${contactLine}`,
      badge: null,
      notice: false,
      mayStart: false,
    };
  }
  if (p.status) {
    const info = NEXT_STEPS[p.status];
    return { label: APPLICANT_STATUS_LABELS[p.status], text: info.text, badge: info.action ? "Your action is needed" : "No action needed from you", notice: false, mayStart: p.status === "DRAFT" };
  }
  return { label: "Application Not Started", text: "You have not started your application yet. It takes about 5 minutes, and it is free.", badge: null, notice: false, mayStart: true };
}
