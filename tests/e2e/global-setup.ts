import { rmSync } from "node:fs";
import { E2E } from "../../playwright.config";

// The local mail catcher is started by the test file itself (so one test can
// stop and restart it to simulate an email outage). Here we only clear old mail.
export default async function globalSetup() {
  rmSync(E2E.mailDir, { recursive: true, force: true });
}
