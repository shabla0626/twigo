import "server-only";
import { loadEnv, type Env } from "./env-schema";

export type { Env };

let cached: Env | null = null;

/**
 * The validated settings. The rules live in env-schema.ts; server.ts runs the
 * same check once before the site starts, so a wrong production configuration
 * stops the start instead of failing on the first request.
 */
export function env(): Env {
  if (cached) return cached;
  cached = loadEnv(process.env);
  return cached;
}

/** Test hook: re-read process.env on the next env() call. */
export function resetEnvCache() {
  cached = null;
}

export function siteUrl(path = "/"): string {
  return new URL(path, env().SITE_URL).toString();
}
