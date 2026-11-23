import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a PRODUCTION build (in .next-e2e), a dedicated
// database (cowork_e2e) and a local SMTP catcher, on port 3210. (Dev mode is not
// used: its hot reload can interrupt form submissions while routes compile.) They use the installed Microsoft Edge, so no
// browser download is needed (channel: "msedge").
const PORT = 3210;
export const E2E = {
  baseURL: `http://127.0.0.1:${PORT}`,
  mailDir: ".e2e-mail",
  smtpPort: 2828,
  ownerEmail: "owner@e2e.test",
  password: "e2e-strong-password-42",
  totpSecret: "KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU",
};

const env = {
  PORT: String(PORT),
  HOST: "127.0.0.1",
  SITE_URL: E2E.baseURL,
  // Production mode on this computer: skips the checks that need a real site (see src/lib/env-schema.ts).
  LOCAL_PRODUCTION_TEST: "1",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5433/cowork_e2e?schema=public",
  AUTH_SECRET: "e2e-auth-secret-that-is-long-enough-0123456789",
  ENCRYPTION_KEY: "e2e-encryption-key-different-from-auth-secret-99",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: String(E2E.smtpPort),
  EMAIL_FROM: "no-reply@e2e.test",
  // Set explicitly: Next.js fills every unset variable from the developer's .env (which may hold the
  // real Resend login); the tests must only ever talk to the local catcher, without a login.
  SMTP_SECURE: "false",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  RESEND_WEBHOOK_SECRET: "",
  ADMIN_NOTIFICATION_EMAIL: "",
  SEND_APPLICANT_CONFIRMATION: "true",
  JOBS_ENABLED: "false",
  STORAGE_DIR: ".e2e-storage",
  NEXT_DIST_DIR: ".next-e2e",
  E2E_OWNER_EMAIL: E2E.ownerEmail,
  E2E_PASSWORD: E2E.password,
  E2E_TOTP_SECRET: E2E.totpSecret,
};

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: E2E.baseURL,
    channel: "msedge",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 120_000,
  },
  projects: [{ name: "edge", use: { ...devices["Desktop Edge"], channel: "msedge" } }],
  webServer: {
    command: process.env.E2E_SKIP_BUILD
      ? "npx tsx tests/e2e/prepare.ts && npx tsx server.ts --production"
      : "npx tsx tests/e2e/prepare.ts && npx next build --webpack && npx tsx server.ts --production",
    url: `${E2E.baseURL}/api/health`,
    timeout: 900_000,
    reuseExistingServer: false,
    env,
    stdout: "pipe",
  },
});
