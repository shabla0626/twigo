/**
 * The one-click Windows launcher (deploy-twigo.ps1) and its release packager: safety rules that must never
 * regress. The behaviour itself is tested end to end by scripts/deploy/test-launcher.ps1 (real OpenSSH
 * against an isolated SSH server) and scripts/deploy/test-deploy.sh (the server script).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const launcher = readFileSync("deploy-twigo.ps1", "utf8");
const release = readFileSync("scripts/deploy/new-release.ps1", "utf8");
const harness = readFileSync("scripts/deploy/test-launcher.ps1", "utf8");
const deploy = readFileSync("scripts/deploy/deploy-twigo.sh", "utf8");

describe("one-click launcher (deploy-twigo.ps1)", () => {
  it("is plain ASCII without a byte-order mark, so Windows PowerShell 5.1 reads it correctly", () => {
    for (const [name, text] of [["deploy-twigo.ps1", launcher], ["new-release.ps1", release], ["test-launcher.ps1", harness]] as const) {
      expect(text.charCodeAt(0), name).not.toBe(0xfeff);
      expect(/[^\x00-\x7f]/.test(text), name).toBe(false);
    }
  });

  it("never weakens SSH: no host-key overrides, no stored password or key", () => {
    for (const forbidden of ["StrictHostKeyChecking", "UserKnownHostsFile", "BatchMode", "sshpass", "PasswordAuthentication", "IdentityFile", "PreferredAuthentications", "ConvertTo-SecureString"]) {
      expect(launcher, forbidden).not.toContain(forbidden);
    }
    expect(launcher).not.toMatch(/["']-i["']/);
    expect(launcher).toMatch(/\$Target = "shabla@162\.35\.23\.106"/);
    expect(launcher).toMatch(/\$RemoteDir = "\/home\/shabla\/Server"/);
  });

  it("uploads exactly the three files named in the release manifest, never a hard-coded release", () => {
    const scp = launcher.match(/Invoke-Tool \$scp \(\$scpOpts \+ @\(([^)]*)\)\)/);
    expect(scp).toBeTruthy();
    expect(scp![1]).toBe('$scriptName, $archiveName, $sumName, "${Target}:$RemoteDir/.twigo-upload/"');
    expect(launcher).toContain('Join-Path $ReleaseDir "release-manifest.json"');
    expect(launcher).not.toMatch(/twigo-rc\d/);
    // The file names come from the manifest and are pinned to the release name.
    expect(launcher).toContain('if ($archiveName -ne "$version.tar.gz")');
    expect(launcher).toContain('if ($scriptName -ne "deploy-twigo.sh")');
    expect(launcher).toContain('if ($sumName -ne "$archiveName.sha256")');
  });

  it("refuses archives with settings files, keys, backups or data before connecting", () => {
    expect(launcher).toContain("$base -like '.env*' -and $base -ne '.env.example' -and $base -ne '.env.production.example'");
    expect(launcher).toContain("'^(backups|storage|\\.pgdata|node_modules|\\.git)(/|$)'");
    expect(launcher).toContain("KEEP-SECRET");
    // The local check comes before the first SSH call.
    expect(launcher.indexOf("$names.Contains($_)")).toBeLessThan(launcher.indexOf("$probe = Invoke-Tool $ssh"));
  });

  it("runs the existing server script with the exact archive and keeps its exit code", () => {
    expect(launcher).toContain('TWIGO_ARCHIVE="$D/$A" bash "$D/deploy-twigo.sh"');
    expect(launcher).toMatch(/if \[ "\$rc" -ne 0 \]; then\n[\s\S]*?TWIGO-HEALTH: [\s\S]*?\n  exit "\$rc"\nfi\n/);
    expect(launcher).toMatch(/Show-Summary \$rc\n\s+Exit-Launcher \$rc\n/);
    expect(launcher).toMatch(/function Exit-Launcher\(\[int\]\$Code\) \{[\s\S]*?\n  exit \$Code\n\}/);
    expect(launcher).toContain("sha256sum -c -");
  });

  it("opens only the check, upload and deployment connections, and announces each password prompt", () => {
    // A fourth connection after a failure asked for the password again; when that prompt ended early, the
    // password was typed after the PS> prompt instead. The server now reports health in the same connection.
    expect(launcher.match(/Invoke-Tool \$ssh \(\$sshOpts/g)).toHaveLength(2);
    expect(launcher.match(/Invoke-Tool \$ssh /g)).toHaveLength(3); // the third is the local "ssh -V"
    expect(launcher.match(/Invoke-Tool \$scp /g)).toHaveLength(1);
    expect(launcher.match(/nothing is shown while you type/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it("knows the server script's ten steps and its exit codes", () => {
    const steps = [...deploy.matchAll(/^step (\d+) "([^"]+)"$/gm)].map((m) => m[2]);
    expect(steps).toHaveLength(10);
    const names = launcher.match(/\$StepNames = @\(([\s\S]*?)\)\n/)![1].match(/"([^"]+)"/g)!.map((s) => s.slice(1, -1));
    expect(names).toEqual(steps);
    expect(deploy).toMatch(/die\(\).*exit \$\(\(10 \+ STEP_NO\)\); \}/);
    expect(deploy).toMatch(/exit \$\(\(10 \+ STEP_NO\)\)' ERR/);
    expect(deploy).toMatch(/flock -n 9/);
    expect(deploy).toMatch(/exit 30/);
    for (const sig of ["HUP 129", "INT 130", "TERM 143", "PIPE 141"]) expect(deploy).toContain(`on_signal ${sig}`);
  });
});

describe("release packager (new-release.ps1)", () => {
  it("builds from git with LF line endings and writes the manifest last", () => {
    expect(release).toContain('"core.autocrlf=false", "archive", "--format=tar.gz"');
    expect(release).toContain('format       = "twigo-release-manifest/1"');
    expect(launcher).toContain('$ManifestFormat = "twigo-release-manifest/1"');
    expect(release).toContain('"scripts/deploy/deploy-twigo.sh"');
    const files = release.indexOf('foreach ($f in @($ArchiveName, $sumName, "deploy-twigo.sh"))');
    const manifest = release.indexOf('(Join-Path $Staging "release-manifest.json") -Destination');
    expect(files).toBeGreaterThan(0);
    expect(manifest).toBeGreaterThan(files);
    // The finished release goes through the launcher's own checks before it replaces anything.
    expect(release.indexOf("-CheckOnly")).toBeLessThan(files);
  });
});
