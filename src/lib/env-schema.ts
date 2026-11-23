// Settings (environment variables): what exists, what is valid, and what a real
// production start additionally requires. No framework imports, so the server
// entry point (server.ts) can check everything BEFORE it starts serving.
import { z } from "zod";

const bool = (def: "true" | "false") => z.string().default(def).transform((v) => v === "true");

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // An empty value counts as "not set" (the production check then asks for it by name).
  SITE_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().default("http://localhost:3000")),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  // Separate key for encrypting secrets at rest (2FA). Required in production.
  ENCRYPTION_KEY: z.string().default(""),
  // Administrator sessions (hours). Members get MEMBER_SESSION_TTL_HOURS.
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(8),
  MEMBER_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 60).default(24 * 14),
  ADMIN_REQUIRE_2FA: bool("true"),
  // Number of reverse proxies in front of the app that append to X-Forwarded-For (0 = none; Caddy/nginx = 1).
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  STORAGE_DIR: z.string().default("storage"),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(10),
  JOBS_ENABLED: bool("true"),
  BACKUP_DIR: z.string().default("backups"),
  BACKUP_KEEP: z.coerce.number().int().min(1).max(365).default(14),
  BACKUP_ENCRYPTION_KEY: z.string().default(""),
  ORG_NAME: z.string().default("Twigo"),
  ORG_TAGLINE: z.string().default("Work Together. Create Value. Share the Results."),
  EMAIL_FROM_NAME: z.string().default(""),
  ORG_LEGAL_NAME: z.string().default(""),
  ORG_JURISDICTION: z.string().default(""),
  ORG_CONTACT_EMAIL: z.string().default(""),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().default(587),
  // "true" = TLS from the start (port 465), "false" = STARTTLS/plain (587, 2587, 25). Empty = automatic (true only on 465).
  SMTP_SECURE: z
    .string()
    .default("")
    .transform((v) => (v === "true" ? true : v === "false" ? false : null)),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  EMAIL_FROM: z.string().default(""),
  ADMIN_NOTIFICATION_EMAIL: z.string().default(""),
  // Resend webhook signing secret (starts with "whsec_"); enables confirmed-delivery tracking.
  RESEND_WEBHOOK_SECRET: z.string().default(""),
  SEND_APPLICANT_CONFIRMATION: z.string().default("true").transform((v) => v !== "false"),
  RETENTION_DAYS_DECLINED: z.coerce.number().int().min(30).default(365),
});

export type Env = z.infer<typeof envSchema>;

/** localhost, 127.x.x.x, ::1 and *.localhost: this computer, never a public site. */
export function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h.endsWith(".localhost") || h === "::1" || /^127(\.\d{1,3}){3}$/.test(h);
}

/**
 * Secrets that must be right whenever the code runs in production mode,
 * including the build and local test runs.
 */
function secretProblems(e: Env): string[] {
  const problems: string[] = [];
  if (e.ENCRYPTION_KEY.length < 32) problems.push("ENCRYPTION_KEY must be set (at least 32 characters)");
  if (e.ENCRYPTION_KEY && e.ENCRYPTION_KEY === e.AUTH_SECRET) problems.push("ENCRYPTION_KEY must differ from AUTH_SECRET");
  if (/dev-only|change-me/i.test(e.AUTH_SECRET)) problems.push("AUTH_SECRET still has the development value");
  return problems;
}

/**
 * "Local production test": production mode on this computer for the browser
 * tests and the performance measurement (LOCAL_PRODUCTION_TEST=1). It skips
 * the checks that only make sense on a real site, and it works ONLY while the
 * site address is a local one, so it can never weaken a real deployment.
 */
export function isLocalProductionTest(raw: Record<string, string | undefined>, e: Env): boolean {
  return raw.LOCAL_PRODUCTION_TEST === "1" && isLocalHostname(new URL(e.SITE_URL).hostname);
}

/**
 * What must be true before the site may START in production (checked once by
 * server.ts, before it serves anything). Returns the problems in plain words
 * (empty = fine). `raw` is process.env: some checks need to know whether a
 * value was set at all, not only its default.
 */
export function startupProblems(raw: Record<string, string | undefined>, e: Env): string[] {
  if (raw.NODE_ENV !== "production") return [];
  const problems = secretProblems(e);
  const site = new URL(e.SITE_URL);
  if (raw.LOCAL_PRODUCTION_TEST === "1") {
    if (!isLocalHostname(site.hostname)) problems.push("LOCAL_PRODUCTION_TEST=1 is only for test runs on this computer; remove it (SITE_URL is not a local address)");
    return problems;
  }
  if (!raw.SITE_URL) problems.push("SITE_URL must be set to the public address of the site (links in emails are built from it)");
  else if (isLocalHostname(site.hostname)) problems.push("SITE_URL points to this computer; set the public address of the site");
  else if (site.protocol !== "https:") problems.push("SITE_URL must start with https://");
  if (!e.SMTP_HOST) problems.push("SMTP_HOST must be set (email confirmation and password reset cannot work without email)");
  if (!e.EMAIL_FROM) problems.push("EMAIL_FROM must be set (the sender address of all emails)");
  if (!e.ORG_CONTACT_EMAIL) problems.push("ORG_CONTACT_EMAIL must be set (the public contact address)");
  // Without these the Privacy Notice and the Terms would show a placeholder instead of who is responsible.
  if (!e.ORG_LEGAL_NAME) problems.push("ORG_LEGAL_NAME must be set (the legal name shown in the Privacy Notice and the Terms)");
  if (!e.ORG_JURISDICTION) problems.push("ORG_JURISDICTION must be set (the governing law shown in the Privacy Notice and the Terms)");
  if (e.BACKUP_ENCRYPTION_KEY.length < 16) problems.push("BACKUP_ENCRYPTION_KEY must be set (at least 16 characters); backups contain personal data");
  if (!e.ADMIN_REQUIRE_2FA) problems.push("ADMIN_REQUIRE_2FA must not be turned off");
  if (raw.TRUSTED_PROXY_HOPS === undefined || raw.TRUSTED_PROXY_HOPS === "")
    problems.push("TRUSTED_PROXY_HOPS must be set explicitly (1 behind one reverse proxy such as Caddy or nginx, 0 when the app is reached directly)");
  return problems;
}

/**
 * Parses the settings (used by application code through env()). Throws one
 * error that lists every problem. In production mode the secrets are checked
 * here too; the complete production check is startupProblems().
 */
export function loadEnv(raw: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  if (raw.NODE_ENV === "production") {
    const problems = secretProblems(parsed.data);
    if (problems.length) throw new Error(`Invalid production configuration: ${problems.join("; ")}`);
  }
  return parsed.data;
}
