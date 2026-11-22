/**
 * Creates or resets an administrator account.
 *
 *   npm run admin:create -- --email founder@example.com --name "Founder" [--role OWNER]
 *
 * The password is read from the ADMIN_PASSWORD environment variable or
 * prompted for interactively (input hidden). It is never echoed or logged.
 * Re-running for an existing email resets the password and revokes all
 * existing sessions for that account. Administrators must then set up
 * two-step verification at /account/security before using /admin.
 */
import type { UserRole } from "@prisma/client";
import { createPrismaClient } from "../src/lib/db-core";
import { createInterface } from "node:readline";
import { hashPassword, passwordPolicyError } from "../src/lib/auth/password";
import { loadDotEnv } from "./load-env";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function promptHidden(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const out = process.stdout as NodeJS.WriteStream & { _orig?: unknown };
  const write = out.write.bind(out);
  let muted = false;
  (out as { write: unknown }).write = (chunk: string | Uint8Array, ...rest: unknown[]) =>
    muted ? true : (write as (...a: unknown[]) => boolean)(chunk, ...rest);
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      muted = false;
      (out as { write: unknown }).write = write;
      process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  loadDotEnv();
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim() || "Administrator";
  const role = (arg("role")?.toUpperCase() ?? "OWNER") as UserRole;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Provide --email <address>");
  if (!["OWNER", "ADMIN"].includes(role)) throw new Error("--role must be OWNER or ADMIN");

  let password = process.env.ADMIN_PASSWORD ?? "";
  if (!password) {
    password = await promptHidden("Password (min 12 chars, letters and numbers): ");
    const again = await promptHidden("Repeat password: ");
    if (password !== again) throw new Error("Passwords do not match");
  }
  const policy = passwordPolicyError(password);
  if (policy) throw new Error(policy);

  const db = createPrismaClient();
  try {
    const passwordHash = await hashPassword(password);
    const now = new Date();
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      await db.user.update({
        where: { email },
        data: { passwordHash, name, role, status: "ACTIVE", emailVerifiedAt: existing.emailVerifiedAt ?? now, passwordChangedAt: now, failedLogins: 0, lockedUntil: null, deactivatedAt: null, suspendedAt: null },
      });
      await db.session.updateMany({ where: { userId: existing.id, revokedAt: null }, data: { revokedAt: now } });
      await db.auditLog.create({ data: { actorId: existing.id, action: "admin.password_reset_cli", entityType: "User", entityId: existing.id } });
      console.log(`Updated administrator ${email}. Existing sessions were revoked.`);
    } else {
      const created = await db.user.create({ data: { email, name, role, passwordHash, status: "ACTIVE", emailVerifiedAt: now, passwordChangedAt: now } });
      await db.auditLog.create({ data: { actorId: created.id, action: "admin.created_cli", entityType: "User", entityId: created.id } });
      console.log(`Created administrator ${email} (${role}).`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
