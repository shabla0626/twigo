import { db } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { clearSettingsCache } from "@/server/settings";
import type { UserRole } from "@prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { encryptSecret } from "@/lib/crypto";
import { applicationAnswers } from "./answers";

export { applicationAnswers };

/** Base32 TOTP secret used for test accounts with 2FA. */
export const TEST_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

export async function resetDb() {
  resetRateLimits();
  clearSettingsCache();
  const tables = await db.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename::text AS tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (tables.length) {
    await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  }
}

/** In-memory cookie jar standing in for next/headers cookies() (see setup-mocks.ts). */
export const cookieJar: Map<string, string> = (globalThis as unknown as { __cookieJar: Map<string, string> }).__cookieJar;
/** A registered account with a confirmed email and no membership (an applicant). */
export async function createApplicantAccount(email = "ada@example.test", name = "Ada Example", opts: { verified?: boolean } = {}) {
  return db.user.create({
    data: {
      email: email.toLowerCase(),
      name,
      role: "MEMBER",
      status: "ACTIVE",
      passwordHash: await hashPassword(PASSWORD),
      emailVerifiedAt: opts.verified === false ? null : new Date(),
      termsAcceptedAt: new Date(),
      termsVersion: "test",
    },
  });
}

/** Registers an applicant and submits a complete application through the real server functions. */
export async function submitTestApplication(
  opts: { email?: string; fullName?: string; about?: Record<string, unknown>; skills?: Record<string, unknown>; motivation?: Record<string, unknown> } = {},
) {
  const { saveApplicationStep, submitMyApplication } = await import("@/server/membership-application");
  const user = await createApplicantAccount(opts.email ?? "ada@example.test", opts.fullName ?? "Ada Example");
  const answers = applicationAnswers(opts);
  for (const [i, part] of [answers.about, answers.skills, answers.motivation].entries()) {
    const r = await saveApplicationStep(user.id, i + 1, part);
    if (!r.ok) throw new Error(`step ${i + 1} failed: ${JSON.stringify(r)}`);
  }
  const res = await submitMyApplication(user.id, { confirm: true });
  if (!res.ok) throw new Error(`submit failed: ${res.error}`);
  const application = await db.application.findUniqueOrThrow({ where: { id: res.applicationId } });
  return { user, application };
}

/** An application from before accounts existed: stored by email, not linked to any account. */
export async function createLegacyApplication(email: string, fullName = "Legacy Person", status: "SUBMITTED" | "ACCEPTED" | "DECLINED" = "SUBMITTED") {
  const applicant = await db.applicant.create({
    data: {
      email: email.toLowerCase(),
      fullName,
      country: "Testland",
      timeZone: "UTC",
      applications: {
        create: {
          status,
          draftStep: 3,
          experienceLevel: "ENTRY",
          remoteExperience: "SOME",
          motivation: "I want to build something useful with others.",
          contribution: "Research and reliable follow-through.",
          desiredWork: "Market research",
          submittedAt: new Date(),
          privacyNoticeVersion: "legacy",
          acknowledgedAt: new Date(),
          availability: { create: { hoursPerWeek: 5, schedule: "Evenings" } },
          workPreferences: { create: [{ category: "RESEARCH" }] },
        },
      },
    },
    include: { applications: true },
  });
  return { applicant, application: applicant.applications[0]! };
}

export const PASSWORD = "correct-horse-battery-9";

/** Creates an account (ACTIVE by default). Members with `profile` get community access. */
export async function createUser(
  opts: {
    email?: string;
    role?: UserRole;
    status?: "ACTIVE" | "SUSPENDED" | "DEACTIVATED" | "INVITED";
    name?: string;
    totp?: boolean;
    profile?: boolean;
    membership?: "NONE" | "ACTIVE" | "SUSPENDED" | "REVOKED";
  } = {},
) {
  const email = opts.email ?? "founder@example.test";
  const name = opts.name ?? email.split("@")[0]!;
  return db.user.create({
    data: {
      email,
      name,
      role: opts.role ?? "OWNER",
      status: opts.status ?? "ACTIVE",
      passwordHash: await hashPassword(PASSWORD),
      emailVerifiedAt: new Date(),
      totpEnabledAt: opts.totp ? new Date() : null,
      totpSecretEnc: opts.totp ? encryptSecret(TEST_TOTP_SECRET) : null,
      // Members created with a profile are approved members unless stated otherwise.
      membershipStatus: opts.membership ?? (opts.profile && (opts.role ?? "OWNER") === "MEMBER" ? "ACTIVE" : "NONE"),
      ...(opts.profile ? { profile: { create: { displayName: name } } } : {}),
    },
  });
}

export async function createMember(name: string) {
  return createUser({ email: `${name.toLowerCase()}@example.test`, role: "MEMBER", name, profile: true });
}

/** Signs a user in for code that reads the session cookie (requireMember, requireAdmin...). */
export async function signIn(userId: string, role: UserRole = "MEMBER") {
  const s = await createSession(userId, role, { mfaVerified: true });
  cookieJar.set(SESSION_COOKIE, s.token);
  return s.token;
}
