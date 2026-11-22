import { describe, expect, it } from "vitest";
import { Secret, TOTP } from "otpauth";
import { PERMISSIONS, ROLE_PERMISSIONS, can } from "@/lib/auth/permissions";
import { generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode, verifyTotp } from "@/lib/auth/totp";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { csvCell, toCsv } from "@/lib/csv";
import { renderTemplate } from "@/lib/email/templates";
import { safeFileName, sniff } from "@/lib/files/sniff";
import { chatMessageSchema, ideaSchema, meetingSchema, profileSchema } from "@/lib/validation/community";
import { readCookie } from "@/lib/auth/session-core";

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const code = (t = Date.now()) => new TOTP({ secret: Secret.fromBase32(SECRET), digits: 6, period: 30 }).generate({ timestamp: t });

describe("permissions", () => {
  it("OWNER has every permission; MEMBER has none", () => {
    for (const p of PERMISSIONS) expect(can("OWNER", p)).toBe(true);
    expect(ROLE_PERMISSIONS.MEMBER).toHaveLength(0);
  });
  it("ADMIN is explicitly limited (no owner-only operations)", () => {
    for (const p of ["admins.manage", "settings.manage", "compensation.view", "compensation.manage", "retention.run", "backups.manage", "data.export", "email.templates", "applications.erase", "projects.delete", "participants.remove"] as const) {
      expect(can("ADMIN", p), p).toBe(false);
    }
    for (const p of ["admin.access", "applications.review", "moderation.act", "groups.manage", "members.suspend"] as const) expect(can("ADMIN", p), p).toBe(true);
  });
});

describe("two-step verification", () => {
  it("accepts a current code once and rejects replay and wrong codes", () => {
    const c = code();
    expect(verifyTotp(SECRET, c, "user-a")).toBe(true);
    expect(verifyTotp(SECRET, c, "user-a")).toBe(false); // replay
    expect(verifyTotp(SECRET, "000000" === c ? "111111" : "000000", "user-b")).toBe(false);
    expect(verifyTotp(SECRET, "12ab56", "user-c")).toBe(false);
  });
  it("accepts a code from the previous 30-second window (clock drift)", () => {
    expect(verifyTotp(SECRET, code(Date.now() - 30_000), "user-d")).toBe(true);
    expect(verifyTotp(SECRET, code(Date.now() - 5 * 60_000), "user-e")).toBe(false);
  });
  it("generates unique recovery codes and hashes them format-independently", () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{2}$/);
    expect(normalizeRecoveryCode(` ${codes[0]!.toUpperCase()} `)).toBe(codes[0]!.replace(/-/g, ""));
    expect(hashRecoveryCode(codes[0]!.toUpperCase())).toBe(hashRecoveryCode(codes[0]!));
  });
});

describe("secret encryption", () => {
  it("round-trips and detects tampering", () => {
    const blob = encryptSecret("top secret");
    expect(blob).not.toContain("top secret");
    expect(decryptSecret(blob)).toBe("top secret");
    const parts = blob.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});

describe("CSV export", () => {
  it("neutralizes spreadsheet formulas and escapes quotes", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe(`"'=HYPERLINK(""http://x"")"`);
    for (const v of ["+1", "-2", "@SUM(A1)", "\tx"]) expect(csvCell(v).startsWith("'") || csvCell(v).startsWith(`"'`)).toBe(true);
    expect(csvCell("plain")).toBe("plain");
    expect(toCsv(["a"], [["x,y"]])).toContain('"x,y"');
  });
});

describe("upload type detection", () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  it("accepts real images and PDFs by content, not by name", () => {
    expect(sniff(png, "photo.exe")?.mime).toBe("image/png");
    expect(sniff(Buffer.from("%PDF-1.7\n..."), "doc.pdf")?.mime).toBe("application/pdf");
  });
  it("rejects SVG, HTML disguised as text, executables and unknown archives", () => {
    expect(sniff(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "x.svg")).toBeNull();
    expect(sniff(Buffer.from("<!DOCTYPE html><script>alert(1)</script>"), "notes.txt")).toBeNull();
    expect(sniff(Buffer.from("MZ\x90\x00\x03"), "setup.txt")).toBeNull();
    expect(sniff(Buffer.from("PK\x03\x04zip"), "bundle.zip")).toBeNull();
    expect(sniff(Buffer.from("PK\x03\x04zip"), "plan.docx")?.ext).toBe("docx");
    expect(sniff(Buffer.from([0x00, 0x01, 0x02]), "data.csv")).toBeNull();
  });
  it("produces safe download names", () => {
    expect(safeFileName('../../etc/"passwd".png', "png")).toBe("etcpasswd.png");
  });
});

describe("community validation", () => {
  it("only title, summary and category are required for an idea", () => {
    const r = ideaSchema.safeParse({ title: "Bookkeeping help", summary: "Small local shops need simple monthly bookkeeping help.", category: "ONLINE_SERVICES" });
    expect(r.success).toBe(true);
    expect(ideaSchema.safeParse({ title: "x", summary: "short", category: "NOPE" }).success).toBe(false);
  });
  it("rejects non-http links", () => {
    expect(ideaSchema.safeParse({ title: "Valid title", summary: "A valid summary of at least twenty chars.", category: "OTHER", links: "javascript:alert(1)" }).success).toBe(false);
  });
  it("accepts only Google Meet links for meetings", () => {
    expect(meetingSchema.safeParse({ kind: "VIDEO", joinUrl: "https://meet.google.com/abc-defg-hij" }).success).toBe(true);
    expect(meetingSchema.safeParse({ kind: "VIDEO", joinUrl: "https://evil.example/meet.google.com/abc-defg-hij" }).success).toBe(false);
    expect(meetingSchema.safeParse({ kind: "VOICE", joinUrl: "http://meet.google.com/abc-defg-hij" }).success).toBe(false);
  });
  it("limits chat message size and client ids", () => {
    expect(chatMessageSchema.safeParse({ channelId: "c1", body: "x".repeat(4001), clientId: "abcdefgh" }).success).toBe(false);
    expect(chatMessageSchema.safeParse({ channelId: "c1", body: "hi", clientId: "<script>" }).success).toBe(false);
    expect(chatMessageSchema.safeParse({ channelId: "c1", body: "hi", clientId: "abc-12345" }).success).toBe(true);
  });
  it("profile skills are deduplicated and capped", () => {
    const r = profileSchema.parse({ displayName: "Ann", skills: "Excel, excel, Writing, Excel" });
    expect(r.skills).toEqual(["Excel", "excel", "Writing"]);
  });
});

describe("misc", () => {
  it("renders templates without leaving placeholders", () => {
    expect(renderTemplate("Hi {{name}}\n\n{{missing}}\n\nBye", { name: "Ann" })).toBe("Hi Ann\n\nBye");
  });
  it("reads the session cookie from a raw Cookie header", () => {
    expect(readCookie("a=1; cw_session=abc%3D; b=2", "cw_session")).toBe("abc=");
    expect(readCookie(undefined, "cw_session")).toBeUndefined();
  });
});
