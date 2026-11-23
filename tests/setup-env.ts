import os from "node:os";
import path from "node:path";

// Test environment. Integration tests use a SEPARATE database (never the dev
// or production one). Override with TEST_DATABASE_URL.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/cowork_test?schema=public";
process.env.AUTH_SECRET = "test-secret-that-is-long-enough-for-hs256-signing";
process.env.SITE_URL = "http://localhost:3000";
process.env.ORG_NAME = "TestOrg";
process.env.SMTP_HOST = "";
// The database client loads the developer's .env for every setting not set here, so all email
// settings are fixed explicitly: tests never inherit a real provider, login or key from .env.
process.env.SMTP_PORT = "587";
process.env.SMTP_SECURE = "";
process.env.SMTP_USER = "";
process.env.SMTP_PASSWORD = "";
process.env.EMAIL_FROM = "";
process.env.RESEND_WEBHOOK_SECRET = "";
process.env.DEV_MAIL_CATCHER = "true";
// Organization facts from the developer's .env must not leak into tests either.
process.env.ORG_LEGAL_NAME = "";
process.env.ORG_JURISDICTION = "";
process.env.ORG_CONTACT_EMAIL = "";
process.env.ADMIN_NOTIFICATION_EMAIL = "";
process.env.ENCRYPTION_KEY = "test-encryption-key-different-from-auth-secret-123";
process.env.STORAGE_DIR = path.join(os.tmpdir(), "cowork-test-storage");
process.env.JOBS_ENABLED = "false";
