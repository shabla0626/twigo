import { vi } from "vitest";

const jar = new Map<string, string>();
(globalThis as unknown as { __cookieJar: Map<string, string> }).__cookieJar = jar;

// Next.js request APIs are unavailable outside a request; provide stand-ins.
vi.mock("next/headers", () => {
  const j = (globalThis as unknown as { __cookieJar: Map<string, string> }).__cookieJar;
  return {
    cookies: async () => ({
      get: (name: string) => (j.has(name) ? { name, value: j.get(name)! } : undefined),
      set: (name: string, value: string) => void j.set(name, value),
      delete: (name: string) => void j.delete(name),
    }),
    // Same header that server.ts sets for every real request (see src/lib/client-address.ts).
    headers: async () => new Headers({ "x-internal-client-address": "203.0.113.7", "x-forwarded-for": "198.51.100.99" }),
  };
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
