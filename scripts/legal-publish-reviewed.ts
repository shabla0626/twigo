/**
 * Marks the legal documents as reviewed by a lawyer (Approved) and publishes them, exactly once, on the
 * production database. Run it only after the owner account exists and only for texts that were reviewed.
 *
 *   docker compose --env-file .env.production run --rm app npm run legal:publish-reviewed -- \
 *     --owner <owner email> --reviewed-by "<lawyer or firm>" --reviewed-on 2026-11-20 [--effective 2026-12-01] [--dry-run]
 *
 * Only versions whose text is exactly the text in this release are touched (checked by fingerprint);
 * every change is written to the audit log with the reviewer statement.
 */
import { createPrismaClient } from "../src/lib/db-core";
import { publishReviewedDocuments } from "../src/ops/legal-publish";
import { loadDotEnv } from "./load-env";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const isoDate = (v: string | undefined, what: string) => {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`--${what} must be a date such as 2026-11-20`);
  return new Date(`${v}T00:00:00Z`);
};

async function main() {
  loadDotEnv();
  const email = arg("owner")?.trim().toLowerCase();
  const by = arg("reviewed-by")?.trim();
  if (!email || !by) throw new Error('Usage: --owner <email> --reviewed-by "<lawyer or firm>" --reviewed-on YYYY-MM-DD [--effective YYYY-MM-DD] [--dry-run]');
  const on = isoDate(arg("reviewed-on"), "reviewed-on");
  const effective = arg("effective") ? isoDate(arg("effective"), "effective") : new Date();
  const dryRun = process.argv.includes("--dry-run");
  const db = createPrismaClient();
  try {
    const owner = await db.user.findUnique({ where: { email }, select: { id: true, role: true } });
    if (!owner || owner.role !== "OWNER") throw new Error(`No owner account with the email ${email}. Create it first (npm run admin:create).`);
    const note = `Reviewed by ${by} on ${on.toISOString().slice(0, 10)}; publication confirmed by the owner.`;
    const res = await publishReviewedDocuments(db, { ownerId: owner.id, orgName: process.env.ORG_NAME || "Twigo", approvalNote: note, effectiveDate: effective, dryRun });
    for (const r of res) console.log(`${r.result.padEnd(18)} ${r.title}${r.version ? ` v${r.version}` : ""}  ${r.fingerprint.slice(0, 16)}`);
    const differs = res.filter((r) => r.result === "text-differs");
    if (differs.length) console.log(`\n${differs.length} document(s) not published: their stored text is not the reviewed text. Check them in Admin -> Legal.`);
    console.log(dryRun ? "\nDry run: nothing was changed." : `\nDone. Effective date ${effective.toISOString().slice(0, 10)}. Recorded in the audit log.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
