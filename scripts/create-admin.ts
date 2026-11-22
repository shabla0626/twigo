/**
 * Creates or resets an administrator account, or removes two-step verification
 * from one (recovery after a lost authenticator).
 *
 *   npm run admin:create -- --email founder@example.com --name "Founder" [--role OWNER]
 *   npm run admin:create -- --email founder@example.com --reset-2fa
 *
 * Create / reset: the password is read from the ADMIN_PASSWORD environment
 * variable or prompted for interactively (input hidden). It is never echoed or
 * logged. Re-running for an existing administrator resets the password and ends
 * all of that account's sessions. Administrators must set up two-step
 * verification at /account/security before the admin area opens.
 *
 * An existing account is never given more power silently: making a member an
 * administrator, changing an administrator's role, or bringing back a
 * suspended or deactivated account needs the extra flag --promote.
 *
 * --reset-2fa: removes two-step verification and ends the account's sessions.
 * The password is not changed; the person sets up two-step verification again
 * at the next sign-in. Use it only for someone you have identified yourself.
 *
 * Every use is written to the audit log.
 */
import type { UserRole } from "@prisma/client";
import { createInterface } from "node:readline";
import { createPrismaClient } from "../src/lib/db-core";
import { createOrResetAdmin, resetTwoStepVerification } from "../src/ops/admin-accounts";
import { loadDotEnv } from "./load-env";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

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
  if (!email) throw new Error("Provide --email <address>");
  const db = createPrismaClient();
  try {
    if (flag("reset-2fa")) {
      const res = await resetTwoStepVerification(db, email);
      if (!res.ok) throw new Error(res.error);
      console.log(res.message);
      return;
    }
    let password = process.env.ADMIN_PASSWORD ?? "";
    if (!password) {
      password = await promptHidden("Password (min 12 chars, letters and numbers): ");
      const again = await promptHidden("Repeat password: ");
      if (password !== again) throw new Error("Passwords do not match");
    }
    const res = await createOrResetAdmin(db, {
      email,
      name: arg("name"),
      role: arg("role")?.toUpperCase() as UserRole | undefined,
      password,
      promote: flag("promote"),
    });
    if (!res.ok) throw new Error(res.error);
    console.log(res.message);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
