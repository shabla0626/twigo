/**
 * STAGE 4 RETEST of the 59 audit findings.
 *
 * Each finding is mapped to the evidence that proves its acceptance criterion. Automated evidence is
 * not taken on trust: every cited test must exist in the given result files and must have passed.
 *
 *   npx vitest run --reporter=json --outputFile=.retest/vitest.json
 *   PLAYWRIGHT_JSON_OUTPUT_NAME=.retest/e2e.json npx playwright test --reporter=list,json
 *   npx tsx scripts/audit/retest.ts .retest/vitest.json .retest/e2e.json docs/walkthrough-screenshots/walkthrough-results.md > .retest/table.md
 *
 * Kinds of evidence:
 *   T  automated test (file, part of its title)          checked against the Vitest results
 *   E  browser test on a production build (title start)  checked against the Playwright results
 *   W  walkthrough step (part of its name)               checked against the walkthrough result table
 *   M  a check made by hand or by a diagnostic script    stated as recorded in the Stage 4 report
 */
import { readFileSync } from "node:fs";

type Ev = ["T", string, string] | ["E", string] | ["W", string] | ["M", string];
type Finding = { id: string; title: string; criterion: string; evidence: Ev[]; status?: "deferred" | "decision" };

const T = (file: string, title: string): Ev => ["T", file, title];
const E = (title: string): Ev => ["E", title];
const W = (step: string): Ev => ["W", step];
const M = (text: string): Ev => ["M", text];

const FINDINGS: Finding[] = [
  { id: "P0-1", title: "Placeholder owner without two-step verification", criterion: "A production start with a test-domain administrator stops with a clear message; a fresh production database holds exactly one account.", evidence: [T("corrective-launch", "an active owner or administrator with a test address stops the start"), T("corrective-launch", "the clean production start (one real owner created from the command line) passes"), T("corrective-launch", "an empty database is refused until the owner has been created"), M("Development database unchanged by decision 4: the placeholder owner is still there (integrity check), and a production start against it was refused in Stage 1")] },
  { id: "P1-1", title: "Administrators could read group chats unseen", criterion: "No administrator reads a message from before joining; every membership change is visible in the chat and audited.", evidence: [T("corrective-chat", "an owner who joins sees the chat only from that moment"), T("corrective-chat", "joining and leaving each write a line into the chat and an audit entry"), T("corrective-chat", "an owner or administrator is named as such"), T("regression-probes", "11. an owner joins a group"), W("joins a group as an ordinary member and sees no earlier chat")] },
  { id: "P1-2", title: "Chat connection outlived its session", criterion: "Within 5 seconds of a session ending, its chat connection closes and sending is refused.", evidence: [T("corrective-realtime", "signing out closes the connection"), T("corrective-realtime", "changing the password closes the connections"), T("corrective-realtime", "safety net"), T("regression-probes", "12. a session signed out elsewhere")] },
  { id: "P1-3", title: "Sign-in limit could be bypassed or abused", criterion: "A made-up forwarding header does not change the counter; two networks never share a counter.", evidence: [T("corrective-unit", "without a trusted proxy the network connection is used"), T("corrective-unit", "behind one proxy the entry written by that proxy is used"), T("corrective-unit", "application code reads only the internal header"), T("corrective-stage2c", "a locked sign-in answers exactly like a wrong password"), M("scripts/audit/checks.ts section B rerun in Stage 4: 25 wrong sign-ins with 25 different made-up forwarding headers were counted as one network and blocked after 20")] },
  { id: "P1-4", title: "Administrator could act on owner accounts", criterion: "Every refused case answers \"Only the owner can…\" and changes nothing.", evidence: [T("corrective", "refuses an administrator who tries to suspend, deactivate or reactivate"), T("corrective", "refuses an administrator who tries to change an owner's community access"), T("corrective", "still lets administrators manage ordinary members")] },
  { id: "P1-5", title: "Two-step setup without password; old sessions stayed", criterion: "An old session cannot attach an authenticator without the password; no older session survives setup.", evidence: [T("corrective-accounts", "a session whose password confirmation is old is sent to confirm identity"), T("corrective-accounts", "right after signing in it works, and every other session of the account is ended"), W("must set up two-step verification before the admin area opens")] },
  { id: "P1-6", title: "Administrator could delete compensation records", criterion: "No agreement disappears except through an explicit, audited owner action.", evidence: [T("corrective-projects", "an administrator is refused by the delete actions"), T("corrective-projects", "the database itself refuses"), T("corrective-projects", "the owner removes the agreement in its own audited step"), W("deleting the project is refused while an agreement exists")] },
  { id: "P1-7", title: "\"Back up now\" reported failure after success", criterion: "A successful manual backup says \"Backup written\" and the job history shows success.", evidence: [T("corrective", "shows success and records a successful job"), T("corrective", "shows failure and records a failed job"), T("regression-probes", "10. the owner presses Back up now"), W("Back up now writes a backup")] },
  { id: "P1-8", title: "Production settings not checked at startup", criterion: "A production start with a missing value exits and names the value.", evidence: [T("corrective-launch", "names every missing or wrong value in plain words"), T("corrective-launch", "lists all problems at once"), T("corrective-launch", "the local test switch works only with a local site address")] },
  { id: "P1-9", title: "Suspended coordinator never replaced", criterion: "Right after suspension every group has exactly one eligible coordinator or is flagged; never two.", evidence: [T("corrective", "suspending the coordinator account promotes the longest-standing eligible member"), T("corrective", "with nobody eligible the group is flagged"), T("corrective", "a later leave never creates a second coordinator"), T("regression-probes", "1. the only coordinator's account is suspended"), T("regression-probes", "2. the only coordinator's community access is removed"), W("the coordinator's account is suspended: another member takes over at once")] },
  { id: "P1-10", title: "No version control, no copy outside the project folder", criterion: "Local git history with tags per stage; verified code bundle and database backup.", evidence: [M("git repository on main with tags audit-baseline-2026-11-22, stage-1-complete, stage-2-complete, stage-3-complete, stage-3-final and stage-4-complete; code bundle verified with git bundle verify; database backup restored into a scratch database and compared (Stage 0, repeated before every migration). The second copy outside this computer still needs the founder's choice")] },

  { id: "P2-1", title: "Redirect to an outside site after confirming identity", criterion: "A crafted address lands on /account; no outside request.", evidence: [T("corrective-stage2", "refuses everything that could leave the site"), T("corrective-stage2", "after confirming identity, a crafted address lands on the account page"), M("scripts/audit/checks.ts section A rerun in Stage 4: the crafted address landed on /account, no outside request")] },
  { id: "P2-2", title: "\"Something went wrong\" for a permission refusal", criterion: "No permission refusal produces an error page.", evidence: [E("D. waitlisted and declined applicants"), E("security: unauthenticated and member access"), T("corrective-projects", "an administrator is refused by the delete actions"), W("owner-only areas are refused with a plain message")] },
  { id: "P2-3", title: "Accepted but never given access; false message", criterion: "Nobody with an accepted application and an active, confirmed account is left without access; the message matches.", evidence: [T("corrective-stage2b", "accepted while the account was suspended"), T("corrective-stage2b", "approving again gives access when it was missing"), T("corrective-stage2b", "accepted before the email address was confirmed"), T("corrective-stage2b", "every situation has its own message"), W("Omar's application is approved")] },
  { id: "P2-4", title: "Re-opening a declined application crashed", criterion: "No error page in that sequence.", evidence: [T("corrective-stage2", "gives a clear answer instead of failing"), T("corrective-stage2", "re-opening still works when there is no newer application"), W("re-applies after the decline")] },
  { id: "P2-5", title: "Simultaneous leaves: database error", criterion: "No deadlock error in the scenarios.", evidence: [T("corrective", "the last two members can leave at the same moment"), T("corrective", "the coordinator and a member can leave at the same moment"), T("regression-probes", "3. the last two members leave at the same moment"), T("regression-probes", "4. coordinator and one member leave at the same moment")] },
  { id: "P2-6", title: "Reopened empty group was a dead end", criterion: "A reopened empty group can be joined and gets a coordinator.", evidence: [T("corrective-stage2b", "reopening keeps it open"), T("regression-probes", "8. an archived group with no members is reopened")] },
  { id: "P2-7", title: "People without access counted as active group members", criterion: "Integrity check \"active group memberships of people without community access\" stays empty.", evidence: [T("corrective-stage2", "is not counted and not notified while paused"), T("corrective-stage2", "the same applies to a suspended account"), T("corrective-stage2", "cannot be given new project work"), M("integrity check on the development database in Stage 4: 0 rows")] },
  { id: "P2-8", title: "Supporter counter counted ineligible people", criterion: "The number shown is the number used for the decision.", evidence: [T("corrective-stage2", "a suspended supporter is not counted"), T("corrective-stage2", "pausing community access and withdrawing support lower the number"), T("corrective-stage2", "lowering the threshold creates groups")] },
  { id: "P2-9", title: "Ideas could be rewritten after support", criterion: "Every change is recorded and visible; a material change never keeps support; a group's purpose changes only with a recorded, announced decision.", evidence: [T("corrective-ideas", "a minor correction keeps the support"), T("corrective-ideas", "a material change resets the support"), T("corrective-ideas", "a change of direction is recorded as a decision"), W("a minor correction keeps support"), W("a material change resets support"), W("changes the group's purpose with a reason")] },
  { id: "P2-10", title: "Meetings: wording and behaviour", criterion: "No text promises built-in voice or video; no meeting shows as in progress after four hours.", evidence: [T("corrective-stage2-unit", "no page promises voice or video built into the site"), T("corrective-meetings", "a meeting nobody ended stops being 'in progress' after the limit"), T("corrective-meetings", "a group has one meeting at a time"), E("16–18. members start and join meetings"), W("meetings are described as Google Meet"), W("starts a meeting, a member sees it")] },
  { id: "P2-11", title: "Chat attachments visible and kept when they should not be", criterion: "Unsent files are private and cleaned up; removed messages take their files.", evidence: [T("corrective-stage2c", "a file that was chosen but never sent"), T("corrective-stage2c", "uploads that were never sent are deleted after a day"), T("corrective-stage2c", "a message removed by moderation takes its attachments"), W("sends a file in the chat")] },
  { id: "P2-12", title: "Notification clash after simultaneous support", criterion: "The stress test passes repeatedly (closed as \"not reproduced, hardened\" if the fault never appears).", evidence: [T("corrective-stage2", "12 rounds of eight members supporting one idea"), T("corrective-stage2", "two notices with the same subject")] },
  { id: "P2-13", title: "Administrator role too powerful", criterion: "The owner-only table is true in code and documentation.", evidence: [T("corrective-stage2", "downloading all applications is owner-only"), T("corrective-projects", "deleting projects and participant records is an owner-only permission"), W("owner-only areas are refused with a plain message")] },
  { id: "P2-14", title: "Data exports incomplete or too broad", criterion: "Own export includes the application and own agreements; no drafts in the applications file.", evidence: [T("corrective-stage2", "a person who was not accepted still gets their application"), T("corrective-stage2", "an accepted person's export includes their own compensation agreements"), T("corrective-stage2", "the applications file never contains unfinished drafts")] },
  { id: "P2-15", title: "Email change confirmed on screen but rolled back", criterion: "The screen never claims a change that was not saved.", evidence: [T("corrective-stage2", "is refused with a clear answer; the account is unchanged"), T("corrective-stage2", "a normal change updates the account and its application record together")] },
  { id: "P2-16", title: "Sign-in revealed accounts; anyone could lock anyone", criterion: "checks.ts sections C and D show no distinguishable difference.", evidence: [T("corrective-stage2c", "forgot password: the same answer for every address"), T("corrective-stage2c", "a locked sign-in answers exactly like a wrong password"), M("scripts/audit/checks.ts sections C and D rerun in Stage 4: reset-request times 129–132 ms for both kinds of address; six wrong sign-ins answer identically for a real and an unknown address, including at the lock")] },
  { id: "P2-17", title: "Admin area described people in three overlapping places", criterion: "One person's state on one page; counters equal their lists; no contradictory label.", evidence: [T("corrective-admin", "every account is in exactly one of the three lists"), T("corrective-admin", "the overview counter 'Members with community access' equals the list"), T("corrective-admin", "has twelve entries instead of sixteen")] },
  { id: "P2-18", title: "Organization name came from two places", criterion: "One change, one place, everywhere.", evidence: [T("corrective-stage2-unit", "no source file outside the defaults contains the name")] },
  { id: "P2-19", title: "Revenue explanation left out what the organization keeps", criterion: "Public wording matches decision 3.", evidence: [T("corrective-stage2-unit", "states disclosure, prior written agreement"), T("corrective-stage2-unit", "publishes no percentage and no amount"), W("revenue wording matches the founder's decision")] },
  { id: "P2-20", title: "Placeholders and unreviewed legal drafts public", criterion: "Every placeholder is listed for the owner; production refuses to start without legal name and jurisdiction.", evidence: [T("corrective-stage2-unit", "the list matches the placeholders that are really in the public pages"), T("corrective-launch", "names every missing or wrong value"), M("10 placeholders remain by design until the founder supplies the facts; they are listed on the admin overview under \"Before launch\"")] },
  { id: "P2-21", title: "Local mail relay labelled \"test only\" in production", criterion: "The label applies only outside production.", evidence: [T("corrective-stage2", "a mail server on the same machine is a real relay in production"), E("C. the administrator reviews, approves and notifies")] },
  { id: "P2-22", title: "Backups weakly protected", criterion: "Production backups are always encrypted; the job lock allows one run at a time.", evidence: [T("corrective-launch", "names every missing or wrong value"), T("corrective-stage2c", "a second run is refused while the first is running"), T("corrective-stage2c", "a job that fails still releases the lock"), W("Back up now writes a backup"), M("the walkthrough's encrypted backup (.cwbak.gz.enc) was restored into a scratch database and verified table by table")] },
  { id: "P2-23", title: "Real database holds the founder's test records", criterion: "Written environment table; verified clean-start procedure; no existing record changed.", evidence: [T("corrective-launch", "the clean production start"), M("README and DEPLOYMENT.md list the four environments; integrity check in Stage 4 shows the development database with the same 5 accounts as at the audit")] },
  { id: "P2-24", title: "Upload size limit avoidable", criterion: "Limit enforced while reading; uploads without a size refused.", evidence: [T("corrective-stage2c", "refuses an upload that does not state its size"), T("corrective-stage2c", "stops reading when the body is larger than it claimed"), T("corrective-stage2c", "a normal small upload still works")] },
  { id: "P2-25", title: "Limits and caches in one process's memory", criterion: "Memory stays flat; two instances cannot run against one database.", evidence: [T("corrective-stage2c", "a second instance cannot take the instance lock")] },

  { id: "P3-1", title: "No site icon", criterion: "/favicon.ico returns 200; no console 404.", evidence: [T("corrective-stage3", "the site has an icon"), M("production build: /favicon.ico, /icon.svg, /apple-icon.png return 200; crawl shows 0 console errors")] },
  { id: "P3-2", title: "No loading indicators", criterion: "A slow page shows a placeholder.", evidence: [T("corrective-stage3", "each signed-in area has a loading placeholder"), M("browser check on a slowed connection in Stage 4: the placeholder is shown while the page loads and gone when it arrives (scripts/audit/slow-loading.ts)")] },
  { id: "P3-3", title: "Public pages repeat each other", criterion: "Each fact in one main place (founder-approved cut list).", evidence: [T("corrective-stage3", "1. Home no longer repeats three FAQ questions"), T("corrective-stage3", "2. About no longer has"), T("corrective-stage3", "3. Founding Contributors no longer has"), T("corrective-stage3", "7. the closing banner stays"), E("public pages and mobile layouts")] },
  { id: "P3-4", title: "Member without application offered to apply", criterion: "No \"start application\" offer for members.", evidence: [T("corrective-stage3", "a member who never applied is told they are a member")] },
  { id: "P3-5", title: "\"You can enter\" under \"access paused\"", criterion: "One consistent message.", evidence: [T("corrective-stage3", "paused or removed access is the only message"), T("corrective-stage3", "an accepted person is told they can enter only when they really can")] },
  { id: "P3-6", title: "Filter boxes cut off their text", criterion: "Full labels visible.", evidence: [T("corrective-stage3", "filter boxes are as wide as their text"), M("screenshot docs/corrective-screenshots/stage3-02")] },
  { id: "P3-7", title: "Four places to talk", criterion: "Each place says who can read it (nothing merged, as planned).", evidence: [T("corrective-stage3", "each place to talk says who can read it")] },
  { id: "P3-8", title: "Three accessibility issues", criterion: "Automated accessibility check: 0 serious issues on all crawled pages.", evidence: [T("corrective-stage3", "the chat offers ONE named control"), E("public pages and mobile layouts"), M("crawl of 141 pages in Stage 4: 0 serious or critical accessibility issues, after correcting the contrast of the unread badges (found by this crawl)")] },
  { id: "P3-9", title: "Admin lists cramped on a phone", criterion: "Results visible without scrolling past filters.", evidence: [T("corrective-stage3", "on a phone the less-used application filters are folded away"), M("screenshot docs/corrective-screenshots/stage3-01")] },
  { id: "P3-10", title: "Email log under the templates; a sentence twice", criterion: "Log visible on opening the page.", evidence: [T("corrective-stage3", "the email page shows the delivery log before the templates")] },
  { id: "P3-11", title: "Only the latest 100–200 records reachable", criterion: "Any record can be reached.", evidence: [T("corrective-stage3", "walking through the pages returns every audit entry exactly once"), T("corrective-stage3", "the three pages use paging")] },
  { id: "P3-12", title: "Notifications jumped; dead links", criterion: "Order stable; no dead links.", evidence: [T("corrective-stage3", "reading a notification does not move it"), T("corrective-stage3", "a link to something that was removed ends on a plain page")] },
  { id: "P3-13", title: "New member saw the whole history as unread", criterion: "Badge counts only messages after joining.", evidence: [T("corrective-stage3", "only messages written after joining count as unread")] },
  { id: "P3-14", title: "One-click actions that cannot be undone", criterion: "Each asks first; removal is notified; an administrator can lift it.", evidence: [T("corrective-stage3b", "Close idea, Make coordinator and Remove member ask first"), T("corrective-stage3b", "a removed member is told"), T("corrective-stage3b", "the organization can lift a removal"), W("hands the coordinator role over (asks first)")] },
  { id: "P3-15", title: "Actions failed silently", criterion: "Every failed action shows a message.", evidence: [T("corrective-stage3b", "each one-click action explains a refusal"), T("corrective-stage3b", "the source has no swallowed errors left")] },
  { id: "P3-16", title: "Leftovers of the earlier invitation flow", criterion: "No unused path or dead link remains.", evidence: [T("corrective-stage3c", "the unused pieces are gone"), T("corrective-stage3c", "an invitation can never bring back a suspended or deactivated account"), W("the owner invites an administrator; the invitation is activated")] },
  { id: "P3-17", title: "Confirmation link skipped two-step; address in the URL", criterion: "Covered by a test.", evidence: [T("corrective-stage3c", "an account with two-step verification is confirmed but must sign in"), T("corrective-stage3c", "after sign-up the address is not part of the page address")] },
  { id: "P3-18", title: "Banners showed any text from the address", criterion: "Unknown text is not displayed.", evidence: [T("corrective-stage3b", "free text from an address is never displayed"), T("corrective-stage3b", "no page displays address text directly")] },
  { id: "P3-19", title: "Small sign-in hardening gaps", criterion: "One email rule; limited password-change attempts; idle timeout.", evidence: [T("corrective-stage3c", "every form and tool accepts exactly the same addresses"), T("corrective-stage3c", "after five wrong attempts"), T("corrective-stage3c", "an owner or administrator session unused for an hour ends")] },
  { id: "P3-20", title: "Advisories in build tooling", criterion: "npm audit clean or reviewed.", status: "decision", evidence: [M("reviewed in Stage 3 and again in Stage 4: the 4 advisories are in Prisma's command-line tooling; no fixed release of Prisma 6 exists; never \"npm audit fix --force\"")] },
  { id: "P3-21", title: "Documentation out of date", criterion: "Docs match behaviour.", evidence: [M("corrected in Stage 3 (ONBOARDING, README, DEPLOYMENT, ARCHITECTURE); Stage 4 adds the upload rule")] },
  { id: "P3-22", title: "One browser test failed once under load", criterion: "10 consecutive passes.", evidence: [M("cause found in Stage 4 (the accessibility check could run in the one frame where the page title is not yet set) and the check corrected; then 10 consecutive passes of the whole browser suite, plus 2 more runs afterwards")] },
  { id: "P3-23", title: "No overview of compensation agreements", criterion: "Owner sees all agreements on one page (founder to decide).", status: "deferred", evidence: [M("deferred as planned; agreements remain visible per project to the owner only")] },
];

// ------------------------------------------------------------------ result sources

const [vitestFile, e2eFile, walkFile] = process.argv.slice(2);
type VResult = { name: string; assertionResults: { title: string; fullName: string; status: string }[] };
const vitest = JSON.parse(readFileSync(vitestFile!, "utf8")) as { testResults: VResult[] };

type PSpec = { title: string; ok: boolean; tests: { results: { status: string }[] }[] };
type PSuite = { specs?: PSpec[]; suites?: PSuite[] };
const e2eSpecs: PSpec[] = [];
const walk = (s: PSuite) => {
  for (const sp of s.specs ?? []) e2eSpecs.push(sp);
  for (const c of s.suites ?? []) walk(c);
};
for (const s of (JSON.parse(readFileSync(e2eFile!, "utf8")) as { suites: PSuite[] }).suites) walk(s);
const walkRows = readFileSync(walkFile!, "utf8").split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Role") && !l.startsWith("|---"));

function check(ev: Ev): { ok: boolean; text: string } {
  if (ev[0] === "T") {
    const [, file, title] = ev;
    const fr = vitest.testResults.find((r) => r.name.replace(/\\/g, "/").endsWith(`tests/${file}.test.ts`));
    const t = fr?.assertionResults.filter((a) => a.title.includes(title)) ?? [];
    const ok = t.length > 0 && t.every((a) => a.status === "passed");
    return { ok, text: `test \`${file}\`: "${title}"${t.length === 0 ? " (NOT FOUND)" : ok ? "" : " (NOT PASSED)"}` };
  }
  if (ev[0] === "E") {
    const sp = e2eSpecs.filter((s) => s.title.startsWith(ev[1]));
    const ok = sp.length > 0 && sp.every((s) => s.ok && s.tests.every((t) => t.results.at(-1)?.status === "passed"));
    return { ok, text: `browser test "${ev[1]}…"${sp.length === 0 ? " (NOT FOUND)" : ok ? "" : " (NOT PASSED)"}` };
  }
  if (ev[0] === "W") {
    const row = walkRows.find((r) => r.includes(ev[1]));
    const ok = Boolean(row && row.includes("| passed |"));
    return { ok, text: `walkthrough: "${ev[1]}"${row ? (ok ? "" : " (NOT PASSED)") : " (NOT FOUND)"}` };
  }
  return { ok: true, text: ev[1] };
}

let allOk = true;
const lines: string[] = ["| ID | Finding | Acceptance criterion | Evidence | Result |", "|---|---|---|---|---|"];
for (const f of FINDINGS) {
  const results = f.evidence.map(check);
  const ok = results.every((r) => r.ok);
  allOk &&= ok;
  const automated = f.evidence.filter((e) => e[0] !== "M").length;
  const result = !ok ? "**NOT MET**" : f.status === "deferred" ? "Deferred (planned)" : f.status === "decision" ? "Reviewed, no change possible" : automated ? "Met" : "Met (manual check)";
  lines.push(`| ${f.id} | ${f.title} | ${f.criterion} | ${results.map((r) => r.text).join("<br>")} | ${result} |`);
}
console.log(lines.join("\n"));
console.error(`\n${FINDINGS.length} findings; ${FINDINGS.filter((f) => f.evidence.map(check).every((r) => r.ok)).length} with all evidence confirmed; ${allOk ? "nothing missing" : "SOMETHING IS MISSING OR FAILED"}`);
const cited = FINDINGS.flatMap((f) => f.evidence).filter((e) => e[0] !== "M").length;
console.error(`${cited} automated pieces of evidence cited and checked against the result files.`);
process.exitCode = allOk ? 0 : 1;
