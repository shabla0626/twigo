/**
 * Prepares a FRESH end-to-end database before the e2e server starts.
 * Refuses to touch any database whose name does not end in "_e2e".
 */
import { Client } from "pg";
import { createUtf8Database } from "../../src/ops/create-database";
import { createPrismaClient } from "../../src/lib/db-core";
import { encryptSecret } from "../../src/lib/crypto";
import { hashPassword } from "../../src/lib/auth/password";
import { deploy } from "../../scripts/migrate";

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  const name = url.pathname.slice(1);
  if (!name.endsWith("_e2e")) throw new Error(`Refusing to reset database "${name}"`);
  const admin = new Client({ connectionString: Object.assign(new URL(url), { pathname: "/postgres", search: "" }).toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await createUtf8Database(admin, name);
  await admin.end();
  await deploy(url.toString(), () => {});

  const db = createPrismaClient(url.toString());
  const now = new Date();
  await db.user.create({
    data: {
      email: process.env.E2E_OWNER_EMAIL!,
      name: "Founder",
      role: "OWNER",
      status: "ACTIVE",
      passwordHash: await hashPassword(process.env.E2E_PASSWORD!),
      emailVerifiedAt: now,
      totpSecretEnc: encryptSecret(process.env.E2E_TOTP_SECRET!),
      totpEnabledAt: now,
    },
  });
  // One application from before accounts existed (no account linked to it).
  await db.applicant.create({
    data: {
      email: "lena.legacy@e2e.test",
      fullName: "Lena Legacy",
      country: "United States",
      timeZone: "America/Chicago",
      applications: {
        create: {
          status: "SUBMITTED",
          draftStep: 3,
          experienceLevel: "ENTRY",
          motivation: "I want to build something useful with others in my free time.",
          contribution: "Research, writing and reliable follow-through.",
          desiredWork: "Market research",
          submittedAt: now,
          privacyNoticeVersion: "e2e",
          acknowledgedAt: now,
          availability: { create: { hoursPerWeek: 5, schedule: "Evenings" } },
          workPreferences: { create: [{ category: "RESEARCH" }] },
        },
      },
    },
  });
  await db.$disconnect();
  console.log("e2e database ready");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
