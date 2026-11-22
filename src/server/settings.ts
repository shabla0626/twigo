import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { SETTINGS, readAllSettings, type SettingKey, type SettingValue } from "@/config/org-settings";

export { SETTINGS, type SettingKey };

const CACHE_MS = 60_000;
const cache = new Map<SettingKey, { value: unknown; at: number }>();

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as SettingValue<K>;
  const row = await db.orgSetting.findUnique({ where: { key } });
  const parsed = row ? SETTINGS[key].schema.safeParse(row.value) : null;
  const value = (parsed?.success ? parsed.data : SETTINGS[key].default) as SettingValue<K>;
  cache.set(key, { value, at: Date.now() });
  return value;
}

/** Forget cached values (after a change, and in tests). */
export function clearSettingsCache() {
  cache.clear();
}

export async function getAllSettings(): Promise<Record<SettingKey, number | null>> {
  return readAllSettings(db);
}

export async function saveSetting(ownerId: string, key: SettingKey, raw: unknown) {
  const value = raw === "" || raw === null || raw === undefined ? null : raw;
  const parsed = SETTINGS[key].schema.safeParse(value);
  if (!parsed.success) return { ok: false as const, error: `${SETTINGS[key].label}: invalid value.` };
  const prior = await getSetting(key);
  cache.delete(key);
  await db.orgSetting.upsert({
    where: { key },
    create: { key, value: parsed.data as number, updatedById: ownerId },
    update: { value: parsed.data as number, updatedById: ownerId },
  });
  cache.delete(key);
  await audit(ownerId, "settings.changed", "OrgSetting", key, { from: prior, to: parsed.data as number | null });
  return { ok: true as const };
}
