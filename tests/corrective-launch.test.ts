/**
 * Regression tests for the corrective implementation plan: starting in production.
 * P1-8: settings are checked before the site starts. P0-1: no test administrators in production.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { envSchema, isLocalProductionTest, loadEnv, startupProblems } from "@/lib/env-schema";
import { isReservedTestAddress, launchProblems } from "@/ops/launch-checks";
import { createOrResetAdmin } from "@/ops/admin-accounts";
import { createMember, createUser, resetDb } from "./helpers";

const GOOD: Record<string, string> = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://app:secret@db.internal:5432/cowork",
  SITE_URL: "https://www.organization.org",
  AUTH_SECRET: "a-real-production-secret-with-enough-length-1",
  ENCRYPTION_KEY: "another-real-production-secret-of-good-length-2",
  SMTP_HOST: "smtp.provider.net",
  EMAIL_FROM: "no-reply@organization.org",
  ORG_CONTACT_EMAIL: "hello@organization.org",
  ORG_LEGAL_NAME: "Organization Example LLC",
  ORG_JURISDICTION: "State of Example, USA",
  BACKUP_ENCRYPTION_KEY: "backup-key-0123456789",
  TRUSTED_PROXY_HOPS: "1",
};
const problems = (overrides: Record<string, string | undefined>) => {
  const raw: Record<string, string | undefined> = { ...GOOD, ...overrides };
  for (const k of Object.keys(raw)) if (raw[k] === undefined) delete raw[k];
  return startupProblems(raw, envSchema.parse(raw));
};

describe("P1-8: production settings are checked before the site starts", () => {
  it("accepts a complete production configuration", () => {
    expect(problems({})).toEqual([]);
  });

  it("names every missing or wrong value in plain words", () => {
    expect(problems({ SITE_URL: undefined })[0]).toContain("SITE_URL must be set");
    expect(problems({ SITE_URL: "http://localhost:3000" })[0]).toContain("points to this computer");
    expect(problems({ SITE_URL: "https://127.0.0.1" })[0]).toContain("points to this computer");
    expect(problems({ SITE_URL: "http://www.organization.org" })[0]).toContain("https://");
    expect(problems({ SMTP_HOST: undefined })[0]).toContain("SMTP_HOST");
    expect(problems({ EMAIL_FROM: undefined })[0]).toContain("EMAIL_FROM");
    expect(problems({ ORG_CONTACT_EMAIL: undefined })[0]).toContain("ORG_CONTACT_EMAIL");
    expect(problems({ ORG_LEGAL_NAME: undefined })[0]).toContain("ORG_LEGAL_NAME");
    expect(problems({ ORG_JURISDICTION: undefined })[0]).toContain("ORG_JURISDICTION");
    expect(problems({ BACKUP_ENCRYPTION_KEY: undefined })[0]).toContain("BACKUP_ENCRYPTION_KEY");
    expect(problems({ ADMIN_REQUIRE_2FA: "false" })[0]).toContain("ADMIN_REQUIRE_2FA");
    expect(problems({ TRUSTED_PROXY_HOPS: undefined })[0]).toContain("TRUSTED_PROXY_HOPS");
    expect(problems({ ENCRYPTION_KEY: "short" })[0]).toContain("ENCRYPTION_KEY");
    expect(problems({ ENCRYPTION_KEY: GOOD.AUTH_SECRET })[0]).toContain("differ");
    expect(problems({ AUTH_SECRET: "dev-only-secret-change-me-0123456789abcdef" })[0]).toContain("development value");
  });

  it("lists all problems at once, not only the first", () => {
    expect(problems({ SITE_URL: undefined, SMTP_HOST: undefined, EMAIL_FROM: undefined, TRUSTED_PROXY_HOPS: undefined }).length).toBe(4);
  });

  it("is not applied in development", () => {
    expect(problems({ NODE_ENV: "development", SITE_URL: undefined, SMTP_HOST: undefined })).toEqual([]);
  });

  it("the local test switch works only with a local site address and never hides wrong secrets", () => {
    const local = { LOCAL_PRODUCTION_TEST: "1", SITE_URL: "http://127.0.0.1:3210", SMTP_HOST: undefined, BACKUP_ENCRYPTION_KEY: undefined, TRUSTED_PROXY_HOPS: undefined, ORG_LEGAL_NAME: undefined, ORG_JURISDICTION: undefined };
    expect(problems(local)).toEqual([]);
    expect(problems({ ...local, ENCRYPTION_KEY: "short" })[0]).toContain("ENCRYPTION_KEY");
    // Left switched on by mistake on a real site: refused, and the strict checks are not skipped silently.
    expect(problems({ LOCAL_PRODUCTION_TEST: "1" })[0]).toContain("only for test runs on this computer");
    const realRaw = { ...GOOD, LOCAL_PRODUCTION_TEST: "1" };
    expect(isLocalProductionTest(realRaw, envSchema.parse(realRaw))).toBe(false);
  });

  it("application code still refuses wrong secrets in production mode", () => {
    expect(() => loadEnv({ ...GOOD, ENCRYPTION_KEY: "short" })).toThrow(/ENCRYPTION_KEY/);
    expect(() => loadEnv({ ...GOOD, AUTH_SECRET: "too-short" })).toThrow(/AUTH_SECRET/);
    expect(loadEnv(GOOD).TRUSTED_PROXY_HOPS).toBe(1);
  });
});

describe("P0-1: a production database has no test administrators", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it("recognizes addresses that can never belong to a real person", () => {
    for (const a of ["admin@example.test", "owner@demo.test", "x@example.com", "x@mail.example.org", "x@something.invalid", "x@localhost", "x@dev.localhost", "x@corp.example"]) {
      expect(isReservedTestAddress(a), a).toBe(true);
    }
    for (const a of ["founder@organization.org", "someone@outlook.com", "test@realcompany.com", "x@contest.io", "x@examples.net"]) {
      expect(isReservedTestAddress(a), a).toBe(false);
    }
  });

  it("an empty database is refused until the owner has been created", async () => {
    expect(await launchProblems(db)).toEqual([expect.stringContaining("no owner account yet")]);
  });

  it("the clean production start (one real owner created from the command line) passes", async () => {
    expect((await createOrResetAdmin(db, { email: "founder@organization.org", name: "Founder", password: "a-long-password-123" })).ok).toBe(true);
    expect(await launchProblems(db)).toEqual([]);
    expect(await db.user.count()).toBe(1);
  });

  it("an active owner or administrator with a test address stops the start; the address is not printed in full", async () => {
    await createUser({ email: "founder@organization.org", totp: true });
    await createUser({ email: "admin@example.test", role: "OWNER" });
    const found = await launchProblems(db);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("1 administrator account(s) use a test address");
    expect(found[0]).toContain("@example.test");
    expect(found[0]).not.toContain("admin@example.test");
  });

  it("deactivated test administrators and ordinary members with test addresses do not stop the start", async () => {
    await createUser({ email: "founder@organization.org", totp: true });
    await createUser({ email: "old-admin@example.test", role: "ADMIN", status: "DEACTIVATED" });
    await createMember("Mia"); // mia@example.test, an ordinary member
    expect(await launchProblems(db)).toEqual([]);
  });

  it("a database whose only owner has a test address is refused on both counts", async () => {
    await createUser({ email: "admin@example.test", role: "OWNER" });
    expect(await launchProblems(db)).toHaveLength(2);
  });
});
