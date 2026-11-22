import "server-only";
import { z } from "zod";

const bool = (def: "true" | "false") => z.string().default(def).transform((v) => v === "true");

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SITE_URL: z.string().url().default("http://localhost:3000"),
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
  ORG_NAME: z.string().default("CoWork"),
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

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  if (process.env.NODE_ENV === "production" && process.env.SKIP_PROD_ENV_CHECK !== "1") {
    const problems: string[] = [];
    if (parsed.data.ENCRYPTION_KEY.length < 32) problems.push("ENCRYPTION_KEY must be set (at least 32 characters)");
    if (parsed.data.ENCRYPTION_KEY && parsed.data.ENCRYPTION_KEY === parsed.data.AUTH_SECRET)
      problems.push("ENCRYPTION_KEY must differ from AUTH_SECRET");
    if (/dev-only|change-me/i.test(parsed.data.AUTH_SECRET)) problems.push("AUTH_SECRET still has the development value");
    if (problems.length) throw new Error(`Invalid production configuration: ${problems.join("; ")}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test hook: re-read process.env on the next env() call. */
export function resetEnvCache() {
  cached = null;
}

export function siteUrl(path = "/"): string {
  return new URL(path, env().SITE_URL).toString();
}
