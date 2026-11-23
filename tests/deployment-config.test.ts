/** The founder's fixed production port: Next.js listens on 1010 in the container and on the host; never 3000. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const compose = readFileSync("docker-compose.yml", "utf8");
const dockerfile = readFileSync("Dockerfile", "utf8");
const prodEnv = readFileSync(".env.production.example", "utf8");
const server = readFileSync("server.ts", "utf8");
const dockerignore = readFileSync(".dockerignore", "utf8");

describe("production port 1010", () => {
  it("the container listens on 1010 and the host publishes the same port on loopback only", () => {
    expect(dockerfile).toMatch(/PORT=1010/);
    expect(dockerfile).toMatch(/HOST=0\.0\.0\.0/);
    expect(dockerfile).toMatch(/EXPOSE 1010/);
    expect(compose).toMatch(/- "127\.0\.0\.1:1010:1010"/);
    expect(compose).toMatch(/PORT: "1010"/);
    expect(prodEnv).toMatch(/^PORT=1010$/m);
    expect(compose).toMatch(/127\.0\.0\.1:1010\/api\/health/);
  });

  it("no production configuration uses port 3000", () => {
    for (const [name, text] of [["docker-compose.yml", compose], ["Dockerfile", dockerfile], [".env.production.example", prodEnv]] as const) {
      expect(text, name).not.toMatch(/\b3000\b/);
    }
    // server.ts: 1010 is the production default, 3000 only for development.
    expect(server).toMatch(/process\.env\.PORT \|\| \(dev \? 3000 : 1010\)/);
  });

  it("the project has no Caddy of its own, and secrets never enter the image", () => {
    expect(compose.toLowerCase()).not.toMatch(/image:\s*caddy|caddyfile/);
    expect(dockerfile.toLowerCase()).not.toMatch(/caddy/);
    expect(dockerignore).toMatch(/^\.env$/m);
    expect(dockerignore).toMatch(/^\.env\.\*$/m);
    // Production settings reach the build only as a BuildKit secret, not as a copied file.
    expect(dockerfile).toMatch(/--mount=type=secret,id=envfile/);
    expect(prodEnv).toMatch(/^SMTP_PASSWORD=$/m);
    expect(prodEnv).toMatch(/^SITE_URL=https:\/\/twigo\.space$/m);
  });
});
