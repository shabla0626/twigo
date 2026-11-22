/**
 * AUDIT DIAGNOSTIC (temporary, READ-ONLY). Looks for inconsistent records.
 *   npx tsx scripts/audit/integrity.ts <database-name>
 */
import { Client } from "pg";

const CHECKS: [string, string][] = [
  ["database encoding", `SELECT datname, pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname LIKE 'cowork%' ORDER BY 1`],
  ["row counts", `SELECT (SELECT count(*) FROM "User") users, (SELECT count(*) FROM "Applicant") applicants, (SELECT count(*) FROM "Application") applications, (SELECT count(*) FROM "Participant") participants, (SELECT count(*) FROM "BusinessIdea") ideas, (SELECT count(*) FROM "ResearchGroup") groups, (SELECT count(*) FROM "ChatMessage") messages, (SELECT count(*) FROM "Project") projects, (SELECT count(*) FROM "CompensationAgreement") agreements, (SELECT count(*) FROM "EmailDelivery") emails, (SELECT count(*) FROM "AuditLog") audit`],
  ["users by role/status/membership", `SELECT role, status, "membershipStatus", ("emailVerifiedAt" IS NOT NULL) verified, ("totpEnabledAt" IS NOT NULL) twofa, count(*) FROM "User" GROUP BY 1,2,3,4,5 ORDER BY 1,2,3`],
  ["applications by status", `SELECT status, count(*) FROM "Application" GROUP BY 1 ORDER BY 1`],
  ["emails differing only by case/space (User)", `SELECT lower(trim(email)) e, count(*) FROM "User" GROUP BY 1 HAVING count(*)>1`],
  ["emails not stored lower-case (User)", `SELECT count(*) FROM "User" WHERE email <> lower(trim(email))`],
  ["applicant emails duplicated", `SELECT lower(trim(email)) e, count(*) FROM "Applicant" GROUP BY 1 HAVING count(*)>1`],
  ["applicants with >1 open application", `SELECT "applicantId", count(*) FROM "Application" WHERE status NOT IN ('ACCEPTED','DECLINED','WITHDRAWN') GROUP BY 1 HAVING count(*)>1`],
  ["ACCEPTED application whose account has no ACTIVE membership", `SELECT a.id, a.status, u.id uid, u."membershipStatus", u.status ustatus FROM "Application" a JOIN "Applicant" ap ON ap.id=a."applicantId" LEFT JOIN "User" u ON u.id=ap."userId" WHERE a.status='ACCEPTED' AND (u.id IS NULL OR u."membershipStatus"<>'ACTIVE')`],
  ["MEMBER with ACTIVE membership but no accepted application", `SELECT u.id, u.status FROM "User" u WHERE u.role='MEMBER' AND u."membershipStatus"='ACTIVE' AND NOT EXISTS (SELECT 1 FROM "Applicant" ap JOIN "Application" a ON a."applicantId"=ap.id WHERE ap."userId"=u.id AND a.status='ACCEPTED')`],
  ["ACTIVE membership without verified email", `SELECT id, role FROM "User" WHERE "membershipStatus"='ACTIVE' AND "emailVerifiedAt" IS NULL`],
  ["ACTIVE member without profile", `SELECT u.id FROM "User" u WHERE u."membershipStatus"='ACTIVE' AND u.status='ACTIVE' AND NOT EXISTS (SELECT 1 FROM "MemberProfile" p WHERE p."userId"=u.id)`],
  ["admins without two-step verification", `SELECT role, count(*) FROM "User" WHERE role IN ('OWNER','ADMIN') AND status='ACTIVE' AND "totpEnabledAt" IS NULL GROUP BY 1`],
  ["live sessions of non-active accounts", `SELECT u.status, count(*) FROM "Session" s JOIN "User" u ON u.id=s."userId" WHERE u.status<>'ACTIVE' AND s."expiresAt">now() AND s."revokedAt" IS NULL GROUP BY 1`],
  ["ideas GROUP_FORMED without a group", `SELECT i.id FROM "BusinessIdea" i WHERE i.status='GROUP_FORMED' AND NOT EXISTS (SELECT 1 FROM "ResearchGroup" g WHERE g."ideaId"=i.id)`],
  ["groups whose idea is not GROUP_FORMED", `SELECT g.slug, i.status FROM "ResearchGroup" g JOIN "BusinessIdea" i ON i.id=g."ideaId" WHERE i.status<>'GROUP_FORMED'`],
  ["open groups without an active coordinator", `SELECT g.slug, g.status, g."adminManaged" FROM "ResearchGroup" g WHERE g.status<>'ARCHIVED' AND NOT EXISTS (SELECT 1 FROM "GroupMembership" m WHERE m."groupId"=g.id AND m.role='COORDINATOR' AND m.status='ACTIVE')`],
  ["memberCount differs from active memberships", `SELECT g.slug, g."memberCount", (SELECT count(*) FROM "GroupMembership" m WHERE m."groupId"=g.id AND m.status='ACTIVE') actual FROM "ResearchGroup" g WHERE g."memberCount" <> (SELECT count(*) FROM "GroupMembership" m WHERE m."groupId"=g.id AND m.status='ACTIVE')`],
  ["active group memberships of people without community access", `SELECT g.slug, u.status, u."membershipStatus", m.role FROM "GroupMembership" m JOIN "User" u ON u.id=m."userId" JOIN "ResearchGroup" g ON g.id=m."groupId" WHERE m.status='ACTIVE' AND NOT (u.status='ACTIVE' AND (u."membershipStatus"='ACTIVE' OR u.role IN ('OWNER','ADMIN')))`],
  ["endorsements by the idea's own author", `SELECT e."ideaId" FROM "IdeaEndorsement" e JOIN "BusinessIdea" i ON i.id=e."ideaId" WHERE i."authorId"=e."userId"`],
  ["groups without a channel", `SELECT g.slug FROM "ResearchGroup" g WHERE NOT EXISTS (SELECT 1 FROM "GroupChannel" c WHERE c."groupId"=g.id)`],
  ["email deliveries by status", `SELECT status, count(*) FROM "EmailDelivery" GROUP BY 1 ORDER BY 1`],
  ["migrations applied", `SELECT count(*) applied, max(migration_name) latest, count(*) FILTER (WHERE finished_at IS NULL) unfinished FROM _prisma_migrations`],
];

async function main() {
  const name = process.argv[2] ?? "cowork";
  const c = new Client({ connectionString: `postgresql://postgres:postgres@localhost:5433/${name}`, options: "-c default_transaction_read_only=on" });
  await c.connect();
  console.log(`# ${name}`);
  for (const [label, sql] of CHECKS) {
    try {
      const r = await c.query(sql);
      console.log(`\n## ${label} (${r.rowCount} rows)`);
      if (r.rowCount) console.table(r.rows);
    } catch (e) {
      console.log(`\n## ${label}: QUERY ERROR ${(e as Error).message}`);
    }
  }
  await c.end();
}
main();
