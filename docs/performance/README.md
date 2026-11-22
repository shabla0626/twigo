# Performance and quality pass (2026-11-22)

How it was measured: `npm run perf:measure` runs the **production build** against the separate
demo database, signs in as a visitor, applicant, member and owner, and records for each page the median
response time over 7 requests, the number of database queries and the JavaScript the browser downloads.
Raw numbers: [baseline.json](baseline.json) and [after.json](after.json).

## Results

**Database queries across the 22 measured pages: 302 → 138 (54% fewer).**

| Page (who) | Queries before | Queries after | Median ms before | Median ms after |
|---|---|---|---|---|
| `/` (visitor) | 0 | **0** | 25 | 23 |
| `/how-it-works` (visitor) | 0 | **0** | 25 | 21 |
| `/join` (visitor) | 0 | **0** | 26 | 26 |
| `/login` (visitor) | 0 | **0** | 25 | 26 |
| `/application` (applicant) | 9 | **2** | 37 | 33 |
| `/community` (member) | 24 | **11** | 49 | 49 |
| `/community/ideas/:idea` (member) | 19 | **6** | 38 | 36 |
| `/community/groups` (member) | 10 | **5** | 32 | 29 |
| `/community/groups/mine` (member) | 14 | **7** | 35 | 35 |
| `/community/groups/:group` (member) | 33 | **11** | 42 | 38 |
| `/community/groups/:group/chat` (member) | 20 | **10** | 37 | 35 |
| `/community/groups/:group/research` (member) | 35 | **18** | 44 | 44 |
| `/community/groups/:group/meetings` (member) | 24 | **12** | 36 | 35 |
| `/community/groups/:group/discussions` (member) | 22 | **11** | 36 | 37 |
| `/community/groups/:group/discussions/:discussion` (member) | 22 | **11** | 38 | 35 |
| `/community/notifications` (member) | 8 | **4** | 29 | 29 |
| `/community/profile` (member) | 8 | **4** | 32 | 28 |
| `/admin` (admin) | 16 | **13** | 36 | 36 |
| `/admin/applications` (admin) | 11 | **3** | 33 | 32 |
| `/admin/applications/:app` (admin) | 14 | **3** | 34 | 34 |
| `/admin/members` (admin) | 6 | **3** | 32 | 30 |
| `/admin/email` (admin) | 7 | **4** | 31 | 29 |

### Why the times barely change here, and why that is expected

On this computer the database runs on the same machine, so a query takes well under 1 ms. On a real
server the database is usually reached over a network, where every trip costs roughly 1–5 ms (more if
the database is in another data center). There, the pages that dropped from 20–35 queries to 10–18
save a similar number of round trips per page view. This could not be measured here without a
remote database, and is not claimed as a measured result.

### Password checks no longer freeze the server (measured)

| | Before (bcryptjs) | After (built-in scrypt) |
|---|---|---|
| Time to check one password | ~230 ms | ~60 ms |
| Longest pause of the whole server during 3 simultaneous sign-ins | **294 ms** | **12 ms** (normal timer noise) |

The old library did the work on the server's main thread. While anyone signed in, every other visitor's
page and every live chat message waited. scrypt runs on Node's background thread pool.

## Changes

| Change | Effect |
|---|---|
| **Related records in one query** (Prisma `relationJoins`) | A group with its members, their profiles and the original idea loads in 1 query instead of 5. Applies everywhere. |
| **Session includes the profile photo** | The community frame no longer queries the profile separately on every page. |
| **Group pages share their data per request** (`group-page.ts`: channel, current meeting, overview, unread count) | The group frame and the page no longer load the same things twice; the page title reuses the same lookup. |
| **Organization settings cached in memory for 60 s** | The support threshold is not re-read on every idea page; a saved change clears the cache immediately. |
| **Password hashing with built-in `scrypt`** | See above. Existing bcrypt passwords still work and are upgraded automatically at the next sign-in (tested). |
| **Timing protection fixed** | Unknown accounts now really take as long as real ones. Before, the "equalizer" did nothing after its first use, so response times could hint whether an email was registered. |
| **Contact form validates on the server** | The browser no longer downloads a form-validation library on Contact and For Businesses (about 120 KB of uncompressed JavaScript). Field errors still appear under each field, and typed text is kept. |
| **Joining pages marked private** | `/join`, `/continue`, `/apply`, `/application` and `/forgot-password` are now never cached and never indexed by search engines, and don't leak their address to other sites. |

## Cleanup

- **Removed unused packages:** `jose`, `react-hook-form`, `@hookform/resolvers`.
- **Removed unused code:** the world-clock and value-flow components (no longer on any page) and an illustration that only the old application form used.
- **New tools:** `npm run perf:measure -- <label> [--build]` for measuring, and `PRISMA_QUERY_LOG=1` to print every query (measurement only; off by default).

## Verified

- TypeScript: 0 errors. ESLint: 0 problems.
- **134** unit and integration tests pass, including a new test for upgrading old passwords.
- **21** browser tests pass on a fresh production build.
- The contact form was checked by hand: a rejected address shows the error under the field with the typed text kept, and a valid message is received.

## Looked at, deliberately not changed

- **Base JavaScript (~460 KB uncompressed, ~150 KB compressed)** is the React and Next.js runtime that every page of a Next.js site loads. The pages' own code is small (about 27 KB on the home page). Further cuts would need a different framework.
- **Live notifications on community pages** load a 40 KB chat library. It powers the live notification badge, so it stays.
- **Compression** was already on (gzip), and the public pages are pre-built and cached for 5 minutes.
- **Research page (18 queries) and admin overview (13)** run most of their queries at the same time, not one after another, so they cost little extra time.

## For production

- **Database location:** put the database in the same region as the server. The query reductions above matter most when the two are far apart.
- **Old password hashes:** accounts created before this change still use bcrypt until each person signs in once.
