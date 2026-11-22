import { ActionForm } from "@/components/forms/action-form";
import { Field, FormAlert, Input } from "@/components/forms/fields";
import { Badge, Button } from "@/components/ui/primitives";
import { SettingsCard } from "@/components/ui/settings-card";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/guard";
import { readFlash } from "@/lib/flash";
import { isAdminRole } from "@/lib/auth/permissions";
import { pendingTotpSetup } from "@/server/accounts";
import { takeRecoveryCodes } from "@/server/flash";
import { redirect } from "next/navigation";
import { confirmTotpAction, disableTotpAction, regenerateCodesAction, revokeSessionAction, signOutOthersAction, startTotpAction } from "../actions";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

function describeAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

const fmt = (d: Date) => d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

export default async function SecurityPage({ searchParams }: Props) {
  const s = await getSession();
  if (!s) redirect("/login");
  const sp = await searchParams;
  const flash = readFlash(sp);
  const user = await db.user.findUniqueOrThrow({ where: { id: s.user.id }, select: { totpEnabledAt: true, totpPendingEnc: true, role: true, passwordChangedAt: true } });
  const setup = sp.setup && user.totpPendingEnc && !user.totpEnabledAt ? await pendingTotpSetup(s.user.id) : null;
  const codes = sp.codes ? await takeRecoveryCodes(s.user.id) : null;
  const remaining = await db.recoveryCode.count({ where: { userId: s.user.id, usedAt: null } });
  const sessions = await db.session.findMany({
    where: { userId: s.user.id, revokedAt: null, mfaPending: false, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
  });
  const admin = isAdminRole(user.role);

  return (
    <>
      <h1 className="text-2xl font-semibold text-ink-950">Security</h1>
      {sp.required === "2fa" && !user.totpEnabledAt && (
        <FormAlert tone="error">Administrator accounts must turn on two-step verification before opening the admin dashboard.</FormAlert>
      )}
      {flash.ok && <FormAlert tone="success">{flash.ok}</FormAlert>}
      {flash.error && <FormAlert tone="error">{flash.error}</FormAlert>}

      <SettingsCard
        title="Two-step verification"
        description="After your password, you enter a 6-digit code from an authenticator app (for example Google Authenticator, Microsoft Authenticator or 1Password)."
      >
        {codes && (
          <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h3 className="font-semibold text-amber-950">Save your recovery codes now</h3>
            <p className="mt-1 text-sm text-amber-900">
              Each code works once if you lose your phone. They will not be shown again. Store them somewhere safe (for example a password manager).
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm text-ink-950" aria-label="Recovery codes">
              {codes.map((c) => (
                <li key={c} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-amber-200">
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}
        {user.totpEnabledAt ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm text-ink-700">
              <Badge tone="success">On</Badge> since {fmt(user.totpEnabledAt)} · {remaining} unused recovery code{remaining === 1 ? "" : "s"}
            </p>
            <div className="flex flex-wrap gap-3">
              <form action={regenerateCodesAction}>
                <Button type="submit" variant="secondary" size="sm">
                  Create new recovery codes
                </Button>
              </form>
              {!admin && (
                <form action={disableTotpAction}>
                  <Button type="submit" variant="ghost" size="sm">
                    Turn off
                  </Button>
                </form>
              )}
            </div>
          </div>
        ) : setup ? (
          <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URL QR code generated on the server */}
            <img src={setup.qrDataUrl} alt="QR code for your authenticator app" width={180} height={180} className="rounded-xl ring-1 ring-ink-100" />
            <div>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-700">
                <li>Open your authenticator app and scan the QR code.</li>
                <li>
                  Or enter this key manually: <code className="break-all rounded bg-ink-100 px-1.5 py-0.5 text-ink-950">{setup.manualKey}</code>
                </li>
                <li>Enter the 6-digit code the app shows.</li>
              </ol>
              <ActionForm action={confirmTotpAction} submitLabel="Turn on" className="mt-4">
                <Field id="code" label="6-digit code">
                  <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required className="max-w-40" />
                </Field>
              </ActionForm>
            </div>
          </div>
        ) : (
          <form action={startTotpAction}>
            <Button type="submit">Set up two-step verification</Button>
          </form>
        )}
      </SettingsCard>

      <SettingsCard title="Signed-in devices" description="Sign out of devices you no longer use. Changing your password signs out all other devices automatically.">
        <ul className="divide-y divide-ink-100">
          {sessions.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium text-ink-950">
                  {describeAgent(x.userAgent)} {x.id === s.sessionId && <Badge tone="accent">This device</Badge>}
                </p>
                <p className="text-xs text-ink-500">
                  Signed in {fmt(x.createdAt)} · last active {fmt(x.lastSeenAt)}
                </p>
              </div>
              {x.id !== s.sessionId && (
                <form action={revokeSessionAction}>
                  <input type="hidden" name="id" value={x.id} />
                  <Button type="submit" variant="secondary" size="sm">
                    Sign out
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {sessions.length > 1 && (
          <form action={signOutOthersAction} className="mt-4">
            <Button type="submit" variant="secondary" size="sm">
              Sign out of all other devices
            </Button>
          </form>
        )}
      </SettingsCard>
    </>
  );
}
