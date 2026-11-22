import { describe, expect, it } from "vitest";
import * as Enums from "@prisma/client";
import { parseSkillList, stepAboutSchema, stepMotivationSchema, stepSkillsSchema } from "@/lib/validation/application";
import { registerSchema } from "@/lib/validation/account";
import { contactSchema } from "@/lib/validation/contact";
import { compensationSchema, projectSchema } from "@/lib/validation/admin";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";
import { checkFormToken, issueFormToken } from "@/lib/security";
import { passwordPolicyError } from "@/lib/auth/password";
import { contentSchemas, CONTENT_KEYS } from "@/lib/content/schema";
import { defaultContent } from "@/lib/content/defaults";
import { TEMPLATES, renderTemplate } from "@/lib/email/templates";
import * as L from "@/lib/labels";
import { slugify } from "@/server/admin/projects";
import { applicationAnswers } from "./answers";

describe("labels stay in sync with Prisma enums", () => {
  const pairs: [Record<string, string>, Record<string, string>][] = [
    [L.WORK_CATEGORIES, Enums.WorkCategory],
    [L.EXPERIENCE_LEVELS, Enums.ExperienceLevel],
    [L.APPLICATION_STATUSES, Enums.ApplicationStatus],
    [L.PROJECT_STATUSES, Enums.ProjectStatus],
    [L.PARTICIPANT_STATUSES, Enums.ParticipantStatus],
    [L.ASSIGNMENT_STATUSES, Enums.AssignmentStatus],
    [L.MILESTONE_STATUSES, Enums.MilestoneStatus],
    [L.AGREEMENT_STATUSES, Enums.AgreementStatus],
    [L.INQUIRY_CATEGORIES, Enums.InquiryCategory],
    [L.CONTACT_METHODS, Enums.ContactMethod],
    [L.REMOTE_EXPERIENCE, Enums.RemoteExperience],
  ];
  it.each(pairs.map((p, i) => [i, ...p]))("pair %i", (_i, labels, prismaEnum) => {
    expect(Object.keys(labels).sort()).toEqual(Object.keys(prismaEnum).sort());
  });
});

describe("registration and application validation", () => {
  const ok = { fullName: "Ada Example", email: "  Ada@Example.TEST ", password: "a-long-password-1", confirm: "a-long-password-1", agree: true };

  it("registration accepts valid input, normalizes the email and requires consent and matching passwords", () => {
    const r = registerSchema.safeParse(ok);
    expect(r.success && r.data.email).toBe("ada@example.test");
    expect(registerSchema.safeParse({ ...ok, agree: false }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, confirm: "different-password-1" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, email: "nope" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, fullName: "" }).success).toBe(false);
  });

  it("registration accepts names in any language", () => {
    for (const fullName of ["José Núñez", "李小龍", "Олена Шевченко", "محمد علي", "Zoë O’Brien-Smith"]) {
      expect(registerSchema.safeParse({ ...ok, fullName }).success, fullName).toBe(true);
    }
  });

  it("accepts the default answers for each application step", () => {
    const a = applicationAnswers();
    expect(stepAboutSchema.safeParse(a.about).success).toBe(true);
    const skills = stepSkillsSchema.safeParse(a.skills);
    expect(skills.success && skills.data.hoursPerWeek).toBe(5);
    expect(stepMotivationSchema.safeParse(a.motivation).success).toBe(true);
  });

  it("only requires the essentials; a resume, degree or experience level is never required", () => {
    expect(stepAboutSchema.safeParse({ country: "USA", occupation: "Retired" }).success).toBe(true);
    expect(stepAboutSchema.safeParse({ country: "", occupation: "Retired" }).success).toBe(false);
    expect(stepSkillsSchema.safeParse({ mainSkills: "Organizing", workCategories: ["GENERAL_REMOTE"], hoursPerWeek: "2", willingToLearn: false }).success).toBe(true);
    expect(stepSkillsSchema.safeParse({ mainSkills: "Organizing", workCategories: [], hoursPerWeek: "2", willingToLearn: true }).success).toBe(false);
    expect(stepMotivationSchema.safeParse({ motivation: "short", contribution: "I am reliable and careful." }).success).toBe(false);
  });

  it("only allows https profile links (blocks javascript: links) and rejects unknown choices", () => {
    const base = applicationAnswers().about;
    expect(stepAboutSchema.safeParse({ ...base, profileUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(stepAboutSchema.safeParse({ ...base, profileUrl: "http://x.test" }).success).toBe(false);
    expect(stepAboutSchema.safeParse({ ...base, profileUrl: "https://x.test/me" }).success).toBe(true);
    expect(stepAboutSchema.safeParse({ ...base, experienceLevel: "GOD" }).success).toBe(false);
    expect(stepSkillsSchema.safeParse({ ...applicationAnswers().skills, workCategories: ["CRYPTO"] }).success).toBe(false);
  });

  it("has no fields for sensitive financial or identity data", () => {
    const keys = [registerSchema.shape, stepAboutSchema.shape, stepSkillsSchema.shape, stepMotivationSchema.shape].flatMap((sh) => Object.keys(sh)).join(" ").toLowerCase();
    expect(keys).not.toMatch(/ssn|social|bank|tax|passport|card|payment|iban|routing|salary|birth/);
  });

  it("parses skill lists, de-duplicating case-insensitively", () => {
    expect(parseSkillList("Excel, excel; React\n  Online   research ,")).toEqual(["Excel", "React", "Online research"]);
    expect(parseSkillList("")).toEqual([]);
  });
});

describe("contact validation", () => {
  it("validates category and message length", () => {
    const base = { name: "A", email: "a@b.test", category: "BUSINESS", subject: "Hi", message: "A long enough message", formToken: "x" };
    expect(contactSchema.safeParse(base).success).toBe(true);
    expect(contactSchema.safeParse({ ...base, category: "SPAM" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...base, message: "short" }).success).toBe(false);
  });
});

describe("admin validation", () => {
  it("parses compensation amounts into minor units", () => {
    const r = compensationSchema.parse({ assignmentId: "a1", terms: "t", amount: "150.50", currency: "usd", status: "AGREED" });
    expect(r.amount).toBe(15050);
    expect(r.currency).toBe("USD");
    expect(compensationSchema.safeParse({ assignmentId: "a1", terms: "t", amount: "1.234", status: "DRAFT" }).success).toBe(false);
    expect(compensationSchema.safeParse({ assignmentId: "a1", terms: "t", currency: "dollars", status: "DRAFT" }).success).toBe(false);
  });

  it("parses project form data including checkbox and dates", () => {
    const r = projectSchema.parse({ title: "P", summary: "S", status: "PLANNING", isPublished: "on", startDate: "2026-12-01", category: "" });
    expect(r.isPublished).toBe(true);
    expect(r.category).toBeNull();
    expect(r.startDate?.toISOString().slice(0, 10)).toBe("2026-12-01");
    expect(projectSchema.parse({ title: "P", summary: "S", status: "PLANNING" }).isPublished).toBe(false);
  });

  it("slugifies titles", () => {
    expect(slugify("  Café Research: Phase #1 ")).toBe("cafe-research-phase-1");
    expect(slugify("!!!")).toBe("project");
  });
});

describe("rate limiting", () => {
  it("allows up to the limit, then blocks until the window resets", () => {
    resetRateLimits();
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, t).ok).toBe(true);
    expect(rateLimit("k", 3, 1000, t + 10).ok).toBe(false);
    expect(rateLimit("k", 3, 1000, t + 1001).ok).toBe(true);
  });
});

describe("form timing token", () => {
  it("accepts a token older than the minimum fill time", () => {
    const now = Date.now();
    expect(checkFormToken(issueFormToken(now - 10_000), now)).toBe("ok");
  });
  it("rejects too-fast, expired, forged and missing tokens", () => {
    const now = Date.now();
    expect(checkFormToken(issueFormToken(now - 500), now)).toBe("too_fast");
    expect(checkFormToken(issueFormToken(now - 7 * 3600_000), now)).toBe("expired");
    const [ts] = issueFormToken(now - 10_000).split(".");
    expect(checkFormToken(`${ts}.forged`, now)).toBe("invalid");
    expect(checkFormToken(`${Number(ts) - 5000}.${issueFormToken(now - 10_000).split(".")[1]}`, now)).toBe("invalid");
    expect(checkFormToken(undefined, now)).toBe("invalid");
  });
});

describe("passwords and sessions", () => {
  it("enforces the admin password policy", () => {
    expect(passwordPolicyError("short1")).not.toBeNull();
    expect(passwordPolicyError("onlylettersnodigits")).not.toBeNull();
    expect(passwordPolicyError("long-enough-password-1")).toBeNull();
  });

});

describe("content and honesty guards", () => {
  const content = defaultContent({ name: "Org", contactEmail: "" });

  it("default content validates against the content schemas", () => {
    for (const key of CONTENT_KEYS) expect(contentSchemas[key].safeParse(content[key]).success, key).toBe(true);
  });

  it("default copy contains no income promises", () => {
    const text = JSON.stringify(content).toLowerCase();
    for (const phrase of ["guaranteed income", "guaranteed earnings", "effortless", "get rich", "passive income"]) {
      // Allowed only in a negated form ("do not promise guaranteed income").
      const idx = text.indexOf(phrase);
      if (idx > -1) expect(text.slice(Math.max(0, idx - 80), idx)).toMatch(/not|no /);
    }
  });

  it("FAQ covers the required questions", () => {
    const qs = content.faq.items.map((i) => i.q.toLowerCase()).join("\n");
    for (const q of ["pay to join", "professional experience", "current job", "remotely", "projects assigned", "compensation determined", "income guaranteed", "no suitable project", "beginners", "how much time", "responsibilities assigned", "multiple projects", "leave a project"]) {
      expect(qs).toContain(q);
    }
  });

  it("confirmation email does not promise acceptance", () => {
    const text = renderTemplate(TEMPLATES.application_received.body, { name: "A", orgName: "Org" });
    expect(text).toContain("does not mean that your application has been accepted");
    expect(text.toLowerCase()).not.toMatch(/you have been accepted|welcome aboard|congratulations/);
  });

  it("no email template promises income or asks for money or documents", () => {
    for (const [key, t] of Object.entries(TEMPLATES)) {
      const text = `${t.subject}\n${t.body}`.toLowerCase();
      expect(text, key).not.toMatch(/guaranteed (income|earnings|pay)|get rich|passive income/);
      expect(text, key).not.toMatch(/pay (a|the) (fee|deposit)|bank account|social security|routing number/);
    }
  });
});
