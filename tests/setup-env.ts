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
process.env.ADMIN_NOTIFICATION_EMAIL = "";
process.env.ENCRYPTION_KEY = "test-encryption-key-different-from-auth-secret-123";
process.env.STORAGE_DIR = path.join(os.tmpdir(), "cowork-test-storage");
process.env.JOBS_ENABLED = "false";
