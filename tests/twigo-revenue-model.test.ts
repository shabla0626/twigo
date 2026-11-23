/**
 * Twigo Stage 10, section 12.2: the twelve revenue-model checks, numbered as in the instructions.
 * Some are behaviour tests, some inspect the code and texts (for example "no commission is calculated"
 * can only be shown by proving no code computes one).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { LEGAL_DOCUMENTS } from "@/content/legal";
import { registerSchema } from "@/lib/validation/account";
import { defaultContent } from "@/lib/content/defaults";
import {
  COMPENSATION_METHODS,
  acceptAgreement,
  activateProject,
  agreementText,
  createGroupProject,
  openForAcceptance,
  saveAgreementDraft,
  termsSchema,
  withdrawOpenVersion,
} from "@/server/community/group-projects";
import { paymentsAvailable } from "@/server/community-support";
import { registerAccount } from "@/server/onboarding";
import { cookieJar, createMember, resetDb, submitTestApplication } from "./helpers";
import { fullTerms, groupOfThree, participant } from "./twigo-fixtures";

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterAll(async () => {
  await db.$disconnect();
});

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p.replace(/\\/g, "/")] : [];
  });
const SRC = walk("src");
const schema = readFileSync("prisma/schema.prisma", "utf8");
const modelFields = schema
  .split("\n")
  .filter((l) => /^\s+[a-zA-Z]+\s+[A-Z][A-Za-z]*[?[\]]*(\s|$)/.test(l))
  .map((l) => l.trim().split(/\s+/)[0]!);

/** Text everyone can read: the legal documents, the editable site content and the public pages' source. */
function publicText() {
  const legal = LEGAL_DOCUMENTS.map((d) => d.text("Twigo")).join("\n");
  const content = JSON.stringify(defaultContent({ name: "Twigo", contactEmail: "", tagline: "Together We Innovate, Grow & Opportunity" }));
  const pages = SRC.filter((f) => f.includes("src/app/(site)/") || f.includes("src/components/site/") || f.includes("src/components/visuals/")).map((f) => readFileSync(f, "utf8"));
  return [legal, content, ...pages].join("\n");
}
/** Every occurrence of `re` must be negated ("no", "not", "never", "without") shortly before it. */
function onlyNegated(text: string, re: RegExp) {
  const bad: string[] = [];
  for (const m of text.matchAll(re)) {
    const before = text.slice(Math.max(0, m.index! - 60), m.index!).toLowerCase();
    // `negative` is the prop of the crossed-out "What we do not promise" list.
    if (!/\b(no|not|never|without|nor|neither|cannot|negative|isn['’]t|aren['’]t|don['’]t|doesn['’]t)\b/.test(before)) bad.push(text.slice(Math.max(0, m.index! - 60), m.index! + m[0].length + 20));
  }
  return bad;
}

async function project() {
  const f = await groupOfThree();
  const p = await createGroupProject(f.a.id, f.g.id, { name: "Bookkeeping pilot", objective: "Serve three local shops for six months." });
  if (!p.ok) throw new Error(p.error);
  return { ...f, projectId: p.id };
}

describe("Twigo revenue model (instructions 12.2)", () => {
  it("1. membership cannot require a fee", async () => {
    // Nothing in the data model can hold a membership fee, price or payment method.
    for (const f of modelFields) expect(f).not.toMatch(/fee|price|subscription|paymentMethod|cardNumber|iban/i);
    // The whole path from registration to a submitted application asks for no payment.
    const { application } = await submitTestApplication();
    expect(application.status).toBe("SUBMITTED");
  });

  it("2. registration does not require an investment", async () => {
    expect(Object.keys(registerSchema.shape).sort()).toEqual(["acceptGuidelines", "acceptTerms", "ackPrivacy", "confirm", "email", "fullName", "legalVersions", "password"].sort());
    for (const f of modelFields) expect(f).not.toMatch(/invest|capital|stake|equity|deposit/i);
    expect(
      (await registerAccount({ fullName: "Nora New", email: "nora@example.test", password: "a-long-password-123", confirm: "a-long-password-123", acceptTerms: true, acceptGuidelines: true, ackPrivacy: true }, { ipHash: "ip" })).ok,
    ).toBe(true);
  });

  it("3. project revenue has no automatic Twigo deduction", async () => {
    // The agreement text always says the platform takes nothing, and offers no field for a platform share.
    const text = agreementText({ projectName: "P", groupName: "G", version: 1, terms: termsSchema.parse(fullTerms()), participants: [] });
    expect(text).toContain("is not a party to this agreement and receives no share, commission or fee from this project");
    expect(Object.keys(termsSchema.shape).join(" ")).not.toMatch(/platform|twigo|commission|fee|levy/i);
    // Net revenue is whatever the participants define; the code never computes it.
    const code = readFileSync("src/server/community/group-projects.ts", "utf8");
    expect(code).not.toMatch(/netRevenue\s*[-*/+]=?|grossRevenue\s*[-*/+]/);
  });

  it("4. no platform commission is calculated anywhere", () => {
    // A variable, function or typed field for a platform share (sentences such as "No fees, no commission:" are fine).
    const code = /\b(const|let|var|function)\s+\w*(commission|platformFee|platformShare|serviceFee|twigoShare)\w*|\b\w*(commission|platformFee|platformShare|serviceFee|twigoShare)\w*\s*:\s*(z\.|number\b|\d)/i;
    const offenders = SRC.filter((f) => code.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
    for (const f of modelFields) expect(f).not.toMatch(/commission|platformShare|platformFee/i);
  });

  it("5. members can record different compensation arrangements", async () => {
    const o = await project();
    for (const method of Object.keys(COMPENSATION_METHODS)) {
      const d = await saveAgreementDraft(o.a.id, o.projectId, fullTerms({ compensationMethod: method, distributionFormula: `Formula for ${method}` }), [participant(o.a.id, "USD 500 fixed"), participant(o.b.id, "60% of net"), participant(o.c.id, "hours × USD 20")], "");
      expect(d.ok).toBe(true);
      if (!d.ok) continue;
      const v = await db.projectAgreementVersion.findUniqueOrThrow({ where: { id: d.versionId }, include: { participants: true } });
      expect((v.terms as { compensationMethod: string }).compensationMethod).toBe(method);
      expect(v.content).toContain(`Formula for ${method}`);
      expect(v.participants.map((p) => p.compensation).sort()).toEqual(["60% of net", "USD 500 fixed", "hours × USD 20"]);
    }
  });

  it("6. compensation agreements require every participant's acceptance before work can start", async () => {
    const o = await project();
    const d = await saveAgreementDraft(o.a.id, o.projectId, fullTerms(), [participant(o.a.id, "half"), participant(o.b.id, "half")], "");
    if (!d.ok) throw new Error();
    expect((await activateProject(o.a.id, o.projectId)).ok).toBe(false); // draft only
    await openForAcceptance(o.a.id, d.versionId);
    const v = await db.projectAgreementVersion.findUniqueOrThrow({ where: { id: d.versionId } });
    await acceptAgreement(o.a.id, v.id, v.contentHash);
    expect((await activateProject(o.a.id, o.projectId)).ok).toBe(false); // Bob has not accepted
    await acceptAgreement(o.b.id, v.id, v.contentHash);
    expect((await activateProject(o.a.id, o.projectId)).ok).toBe(true);
  });

  it("7. unauthorized members cannot change project agreements", async () => {
    const o = await project();
    const d = await saveAgreementDraft(o.a.id, o.projectId, fullTerms(), [participant(o.a.id, "half"), participant(o.c.id, "half")], "");
    if (!d.ok) throw new Error();
    // Cara is a participant but not a coordinator.
    expect((await saveAgreementDraft(o.c.id, o.projectId, fullTerms(), [participant(o.c.id, "everything")], "")).ok).toBe(false);
    expect((await openForAcceptance(o.c.id, d.versionId)).ok).toBe(false);
    await openForAcceptance(o.a.id, d.versionId);
    expect((await withdrawOpenVersion(o.c.id, d.versionId)).ok).toBe(false);
    // Someone outside the group cannot even read it.
    const outsider = await createMember("Olga");
    await expect(saveAgreementDraft(outsider.id, o.projectId, fullTerms(), [], "")).rejects.toThrow();
    // No administrator action can write a group agreement.
    const adminCode = SRC.filter((f) => f.includes("src/app/admin/")).map((f) => readFileSync(f, "utf8")).join("\n");
    expect(adminCode).not.toMatch(/saveAgreementDraft|openForAcceptance|projectAgreementVersion\.(update|create|delete)|projectAgreementParticipant\.(update|create|delete)/);
  });

  it("8. agreement history is preserved", async () => {
    const o = await project();
    const d1 = await saveAgreementDraft(o.a.id, o.projectId, fullTerms(), [participant(o.a.id, "half"), participant(o.b.id, "half")], "");
    if (!d1.ok) throw new Error();
    await openForAcceptance(o.a.id, d1.versionId);
    const v1 = await db.projectAgreementVersion.findUniqueOrThrow({ where: { id: d1.versionId } });
    for (const u of [o.a, o.b]) await acceptAgreement(u.id, v1.id, v1.contentHash);
    const d2 = await saveAgreementDraft(o.a.id, o.projectId, fullTerms(), [participant(o.a.id, "70%"), participant(o.b.id, "30%")], "Change of split");
    if (!d2.ok) throw new Error();
    await openForAcceptance(o.a.id, d2.versionId);
    const v2 = await db.projectAgreementVersion.findUniqueOrThrow({ where: { id: d2.versionId } });
    for (const u of [o.a, o.b]) await acceptAgreement(u.id, v2.id, v2.contentHash);
    const all = await db.projectAgreementVersion.findMany({ where: { projectId: o.projectId }, orderBy: { version: "asc" }, include: { participants: true } });
    expect(all.map((v) => [v.version, v.status])).toEqual([
      [1, "SUPERSEDED"],
      [2, "ACCEPTED"],
    ]);
    expect(all[0]!.content).toBe(v1.content);
    expect(all[0]!.participants.every((p) => p.acceptedAt && p.acceptedHash === v1.contentHash)).toBe(true);
    // Deleting versions is not offered anywhere in the application.
    expect(SRC.some((f) => /projectAgreementVersion\.delete/.test(readFileSync(f, "utf8")))).toBe(false);
  });

  it("9. voluntary support grants no extra privileges", () => {
    // Only the owner's support pages, the public totals page and the support module itself read the records.
    const readers = SRC.filter((f) => /supportLedgerEntry|supportReport\.|from "@\/server\/community-support"/.test(readFileSync(f, "utf8")));
    expect(readers.sort()).toEqual(["src/app/(site)/support/page.tsx", "src/app/admin/(panel)/support/page.tsx", "src/app/admin/actions/twigo.ts", "src/server/community-support.ts"].sort());
    // The support records are not linked to any account (contributors are a free-text name).
    const model = schema.slice(schema.indexOf("model SupportLedgerEntry"), schema.indexOf("}", schema.indexOf("model SupportLedgerEntry")));
    expect(model).not.toMatch(/userId|User\s/);
  });

  it("10. voluntary support is not deducted from project earnings", () => {
    const projectCode = ["src/server/community/group-projects.ts", "src/app/community/project-actions.ts"].map((f) => readFileSync(f, "utf8")).join("\n");
    expect(projectCode).not.toMatch(/community-support|supportLedger|supportReport/);
    const model = schema.slice(schema.indexOf("model SupportLedgerEntry"), schema.indexOf("}", schema.indexOf("model SupportLedgerEntry")));
    expect(model).not.toMatch(/project|GroupProject/i);
  });

  it("11. the support payment feature remains disabled", () => {
    const before = process.env.SUPPORT_PAYMENTS_ENABLED;
    process.env.SUPPORT_PAYMENTS_ENABLED = "true";
    try {
      expect(paymentsAvailable()).toBe(false); // the switch alone cannot enable anything
    } finally {
      if (before === undefined) delete process.env.SUPPORT_PAYMENTS_ENABLED;
      else process.env.SUPPORT_PAYMENTS_ENABLED = before;
    }
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).join(" ");
    expect(deps).not.toMatch(/stripe|paypal|braintree|adyen|square|coinbase|web3|ethers|bitcoin|razorpay|mollie|plaid/i);
    expect(SRC.some((f) => /from "(stripe|@stripe|@paypal|braintree|ethers|web3)/.test(readFileSync(f, "utf8")))).toBe(false);
  });

  it("12. no fake financial or tax claims are displayed", () => {
    const text = publicText();
    expect(onlyNegated(text, /tax[- ]deductible/gi)).toEqual([]);
    expect(onlyNegated(text, /guaranteed? (income|earnings|returns|profits?|payments?)/gi)).toEqual([]);
    expect(onlyNegated(text, /(registered|incorporated) (company|corporation|charity|nonprofit|non-profit|cooperative|llc)/gi)).toEqual([]);
    expect(text).not.toMatch(/\b(LLC|Inc\.|GmbH|501\(c\)\(3\))/);
    expect(text).not.toMatch(/\[(Company Name|Legal Address|Registration Number|Jurisdiction)\]/i);
    // No invented figures about money received or members.
    expect(text).not.toMatch(/\$\s?\d[\d,]*(\.\d+)?\s*(raised|earned|paid out|in revenue)/i);
  });
});
