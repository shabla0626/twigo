import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Minimal .env loader for CLI scripts (does not override existing variables). */
export function loadDotEnv(file = ".env") {
  const p = path.resolve(process.cwd(), file);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
