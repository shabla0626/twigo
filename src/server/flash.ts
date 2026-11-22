import "server-only";

// One-time display of recovery codes after they are generated. Kept in
// server memory for 5 minutes and removed on first read. (Not a server
// action module: these functions cannot be called from the browser.)
const flash = new Map<string, { codes: string[]; exp: number }>();

export async function stashCodes(userId: string, codes: string[]) {
  flash.set(userId, { codes, exp: Date.now() + 5 * 60_000 });
}

export async function takeRecoveryCodes(userId: string): Promise<string[] | null> {
  const f = flash.get(userId);
  flash.delete(userId);
  return f && f.exp > Date.now() ? f.codes : null;
}
