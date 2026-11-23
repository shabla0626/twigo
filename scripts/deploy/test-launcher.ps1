<#
  Isolated tests for deploy-twigo.ps1 (the one-click launcher). Never connects to the VPS: it starts a
  throw-away SSH server in Docker (WSL) on 127.0.0.1:2222 (and :2223 without SFTP), with its own test keys,
  known_hosts and ssh config, a test settings file with generated secrets, and the Compose project
  "twigolaunchtest". The real Windows OpenSSH (ssh.exe, scp.exe) and the real server script are used.

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy\test-launcher.ps1 [-Quick] [-Keep]

  -Quick skips the two real deployments (Docker build). -Keep leaves the test server running afterwards.
  Needs WSL with Docker; frees port 1010 by removing the deployment test's containers (twigodeploytest).
#>
[CmdletBinding()]
param([switch]$Quick, [switch]$Keep)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Launcher = Join-Path $Repo "deploy-twigo.ps1"
$NewRelease = Join-Path $PSScriptRoot "new-release.ps1"
$Work = Join-Path $env:TEMP "twigo-launchtest"
$Utf8 = New-Object System.Text.UTF8Encoding $false
$Tar = Join-Path $env:SystemRoot "System32\tar.exe"
$KeyGen = Join-Path $env:SystemRoot "System32\OpenSSH\ssh-keygen.exe"
$RemoteDir = "/tmp/twigo-launchtest/home/Server"
$WslHelper = "/mnt/" + $Repo.Substring(0, 1).ToLowerInvariant() + ($Repo.Substring(2) -replace '\\', '/') + "/scripts/deploy/test-launcher-server.sh"
$Results = New-Object System.Collections.Generic.List[string]
$script:Pass = 0; $script:Fail = 0

function ConvertTo-ArgString([string[]]$Arguments) {
  $parts = foreach ($a in $Arguments) {
    if ($a.Length -gt 0 -and $a -notmatch '[\s"]') { $a; continue }
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('"')
    $bs = 0
    foreach ($ch in $a.ToCharArray()) {
      if ($ch -eq [char]'\') { $bs++; continue }
      if ($ch -eq [char]'"') { [void]$sb.Append('\' * ($bs * 2 + 1)); [void]$sb.Append('"'); $bs = 0; continue }
      if ($bs -gt 0) { [void]$sb.Append('\' * $bs); $bs = 0 }
      [void]$sb.Append($ch)
    }
    if ($bs -gt 0) { [void]$sb.Append('\' * ($bs * 2)) }
    [void]$sb.Append('"')
    $sb.ToString()
  }
  return ($parts -join ' ')
}
function Invoke-Tool([string]$File, [string[]]$Arguments) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $File
  $psi.Arguments = ConvertTo-ArgString $Arguments
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.StandardOutputEncoding = $Utf8
  $psi.StandardErrorEncoding = $Utf8
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  [void]$p.Start()
  $o = $p.StandardOutput.ReadToEndAsync()
  $e = $p.StandardError.ReadToEndAsync()
  $p.WaitForExit()
  return [pscustomobject]@{ Code = $p.ExitCode; Out = $o.Result; Err = $e.Result }
}
function Invoke-Server([string[]]$ServerArgs) {
  $r = Invoke-Tool "wsl.exe" (@("-e", "bash", $WslHelper) + $ServerArgs)
  return [pscustomobject]@{ Code = $r.Code; Out = ($r.Out -replace "`r", ""); Err = $r.Err }
}
function Get-ServerState {
  $st = @{}
  foreach ($line in ((Invoke-Server @("state")).Out -split "`n")) { if ($line -match '^([A-Z]+)[= ](.*)$') { $k = $Matches[1]; if ($k -eq "SHA") { $st["SHA " + $Matches[2].Split(' ')[0]] = $Matches[2].Split(' ')[-1] } else { $st[$k] = $Matches[2].Trim() } } }
  return $st
}
$script:RunNo = 0
function Invoke-Launcher([string]$Name, [string[]]$LauncherArgs) {
  $script:RunNo++
  $r = Invoke-Tool "powershell.exe" (@("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $Launcher) + $LauncherArgs)
  $text = $r.Out + "`n" + $r.Err
  $file = Join-Path $Work ("run-{0:D2}-{1}.txt" -f $script:RunNo, $Name)
  [System.IO.File]::WriteAllText($file, $text, $Utf8)
  return [pscustomobject]@{ Code = $r.Code; Text = $text; File = $file }
}
function Add-Result([bool]$Ok, [string]$Name, $Run = $null) {
  if ($Ok) { $script:Pass++; $Results.Add("pass  $Name"); Write-Host "== pass: $Name" -ForegroundColor Green }
  else {
    $script:Fail++; $Results.Add("FAIL  $Name"); Write-Host "== FAIL: $Name" -ForegroundColor Red
    if ($Run) { Write-Host "   exit $($Run.Code); output: $($Run.File)"; (($Run.Text -split "`n") | Select-Object -Last 25) | ForEach-Object { Write-Host "   | $_" } }
  }
}
function Get-Sha256([string]$Path) { (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant() }

# A release folder with a hand-made archive (for the stand-in deployment script and broken releases).
function New-TestRelease([string]$Dir, [string]$Version, [string]$Tree, [string]$Commit, [string]$ScriptFile = "") {
  if (Test-Path $Dir) { Remove-Item $Dir -Recurse -Force }
  New-Item -ItemType Directory -Path $Dir | Out-Null
  $archive = "$Version.tar.gz"
  $r = Invoke-Tool $Tar @("-czf", (Join-Path $Dir $archive), "-C", $Tree, ".")
  if ($r.Code -ne 0) { throw "tar failed: $($r.Err)" }
  $src = if ($ScriptFile) { $ScriptFile } else { Join-Path $Tree "scripts\deploy\deploy-twigo.sh" }
  Copy-Item -LiteralPath $src -Destination (Join-Path $Dir "deploy-twigo.sh")
  $ah = Get-Sha256 (Join-Path $Dir $archive)
  [System.IO.File]::WriteAllText((Join-Path $Dir "$archive.sha256"), "$ah  $archive`n", $Utf8)
  $man = [ordered]@{
    format = "twigo-release-manifest/1"; version = $Version; gitTag = ""; gitCommit = $Commit
    commitDate = ""; createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    archive = [ordered]@{ file = $archive; sha256 = $ah; bytes = (Get-Item (Join-Path $Dir $archive)).Length }
    checksumFile = [ordered]@{ file = "$archive.sha256"; sha256 = (Get-Sha256 (Join-Path $Dir "$archive.sha256")) }
    deployScript = [ordered]@{ file = "deploy-twigo.sh"; sha256 = (Get-Sha256 (Join-Path $Dir "deploy-twigo.sh")); pathInArchive = "scripts/deploy/deploy-twigo.sh" }
  }
  [System.IO.File]::WriteAllText((Join-Path $Dir "release-manifest.json"), ($man | ConvertTo-Json -Depth 4), $Utf8)
}
function Set-ManifestField([string]$Dir, [string]$Section, [string]$Field, $Value) {
  $p = Join-Path $Dir "release-manifest.json"
  $m = [System.IO.File]::ReadAllText($p) | ConvertFrom-Json
  if ($Section) { $m.$Section.$Field = $Value } else { $m.$Field = $Value }
  [System.IO.File]::WriteAllText($p, ($m | ConvertTo-Json -Depth 4), $Utf8)
}

# ================================================================================ set-up
Write-Host "Setting up the isolated test environment in $Work and WSL /tmp/twigo-launchtest..."
if (Test-Path $Work) { Remove-Item $Work -Recurse -Force }
New-Item -ItemType Directory -Path $Work | Out-Null
$Keys = Join-Path $Work "keys"
New-Item -ItemType Directory -Path $Keys | Out-Null
foreach ($k in @("id_test", "id_wrong", "ssh_host_ed25519_key")) {
  $r = Invoke-Tool $KeyGen @("-q", "-t", "ed25519", "-N", "", "-C", "twigo-launchtest-$k", "-f", (Join-Path $Keys $k))
  if ($r.Code -ne 0) { throw "ssh-keygen failed: $($r.Err)" }
}
Copy-Item (Join-Path $Keys "id_test.pub") (Join-Path $Keys "authorized_keys")
$hostPub = ([System.IO.File]::ReadAllText((Join-Path $Keys "ssh_host_ed25519_key.pub")).Trim() -split ' ')[0..1] -join ' '
$wrongPub = ([System.IO.File]::ReadAllText((Join-Path $Keys "id_wrong.pub")).Trim() -split ' ')[0..1] -join ' '
$kh = Join-Path $Keys "known_hosts"; $khWrong = Join-Path $Keys "known_hosts_wrong"
[System.IO.File]::WriteAllText($kh, "[127.0.0.1]:2222 $hostPub`n[127.0.0.1]:2223 $hostPub`n", $Utf8)
[System.IO.File]::WriteAllText($khWrong, "[127.0.0.1]:2222 $wrongPub`n", $Utf8)
$fw = { param($p) $p -replace '\\', '/' }
$common = @"
  HostName 127.0.0.1
  User shabla
  IdentitiesOnly yes
  IdentityAgent none
  StrictHostKeyChecking yes
  PasswordAuthentication no
  KbdInteractiveAuthentication no
  BatchMode yes
"@
$cfg = Join-Path $Keys "ssh_config"
$cfgText = @"
Host twigotest
$common
  Port 2222
  IdentityFile $(& $fw (Join-Path $Keys 'id_test'))
  UserKnownHostsFile $(& $fw $kh)
Host twigotest-nosftp
$common
  Port 2223
  IdentityFile $(& $fw (Join-Path $Keys 'id_test'))
  UserKnownHostsFile $(& $fw $kh)
Host twigotest-badkey
$common
  Port 2222
  IdentityFile $(& $fw (Join-Path $Keys 'id_wrong'))
  UserKnownHostsFile $(& $fw $kh)
Host twigotest-hostkey
$common
  Port 2222
  IdentityFile $(& $fw (Join-Path $Keys 'id_test'))
  UserKnownHostsFile $(& $fw $khWrong)
Host twigotest-down
$common
  Port 2299
  IdentityFile $(& $fw (Join-Path $Keys 'id_test'))
  UserKnownHostsFile $(& $fw $kh)
"@
[System.IO.File]::WriteAllText($cfg, ($cfgText -replace "`r", ""), $Utf8)

# WSL stops the distribution (and Docker with it) a few seconds after its last wsl.exe process ends:
# keep one running for the whole test.
$keepPsi = New-Object System.Diagnostics.ProcessStartInfo
$keepPsi.FileName = "wsl.exe"; $keepPsi.Arguments = "-e sleep 7200"; $keepPsi.UseShellExecute = $false; $keepPsi.CreateNoWindow = $true
$KeepAlive = [System.Diagnostics.Process]::Start($keepPsi)
$keysWsl = "/mnt/" + $Keys.Substring(0, 1).ToLowerInvariant() + ($Keys.Substring(2) -replace '\\', '/')
$up = Invoke-Server @("up", $keysWsl)
if ($up.Out -notmatch 'UP') { throw "The SSH test server did not start: $($up.Out) $($up.Err)" }
$fp = Invoke-Server @("free-port")
$ssh = Join-Path $env:SystemRoot "System32\OpenSSH\ssh.exe"
$hello = Invoke-Tool $ssh @("-F", $cfg, "twigotest", "echo hello-from-test-server")
if ($hello.Out -notmatch 'hello-from-test-server') { throw "Windows OpenSSH cannot reach the test server on 127.0.0.1:2222: $($hello.Err)" }
Write-Host "Test SSH server is up (127.0.0.1:2222 with key sign-in; 2223 without SFTP)."

$Head = (Invoke-Tool "git.exe" @("-C", $Repo, "rev-parse", "HEAD")).Out.Trim()
$Base = @("-SshConfigFile", $cfg, "-RemoteDir", $RemoteDir, "-SkipPublicCheck")

# A minimal application tree with a stand-in deployment script: shows what the launcher does with the
# server script's exit code without running a real deployment.
$Fake = Join-Path $Work "fake-tree"
foreach ($f in @("Dockerfile", "docker-compose.yml", "package.json", "package-lock.json", "server.ts", "prisma\schema.prisma",
                 "scripts\migrate.ts", "scripts\create-admin.ts", "scripts\legal-publish-reviewed.ts", "scripts\backup.ts",
                 ".env.production.example", "src\app\api\health\route.ts")) {
  $p = Join-Path $Fake $f; New-Item -ItemType Directory -Force -Path (Split-Path $p) | Out-Null
  [System.IO.File]::WriteAllText($p, "placeholder`n", $Utf8)
}
New-Item -ItemType Directory -Force -Path (Join-Path $Fake "scripts\deploy") | Out-Null
$standIn = @'
#!/usr/bin/env bash
# TWIGO PRODUCTION DEPLOYMENT (stand-in used by scripts/deploy/test-launcher.ps1; it changes nothing)
code="$(cat "$(dirname "$0")/fake-exit-code" 2>/dev/null || echo 0)"
echo "[1/10] Checking server environment..."
n=10; if [ "$code" -ge 11 ] && [ "$code" -le 20 ]; then n=$((code - 10)); fi
echo "[$n/10] stand-in step..."
echo "STAND-IN ARCHIVE=${TWIGO_ARCHIVE:-none}"
[ "$code" = 0 ] || echo "ERROR: simulated failure (exit $code)"
exit "$code"
'@
[System.IO.File]::WriteAllText((Join-Path $Fake "scripts\deploy\deploy-twigo.sh"), ($standIn -replace "`r", ""), $Utf8)
$FakeRel = Join-Path $Work "rel-fake"
New-TestRelease $FakeRel "twigo-launchtest-fake" $Fake $Head

# ================================================================================ 1. local checks (nothing sent)
# The target is a port where nothing listens: any attempt to connect would end with 4, not 2.
$Down = $Base + @("-Target", "twigotest-down")
function Copy-Release([string]$From, [string]$To) { if (Test-Path $To) { Remove-Item $To -Recurse -Force }; Copy-Item $From $To -Recurse }

$d = Join-Path $Work "rel-nomanifest"; Copy-Release $FakeRel $d; Remove-Item (Join-Path $d "release-manifest.json")
$r = Invoke-Launcher "no-manifest" ($Down + @("-ReleaseDir", $d))
Add-Result ($r.Code -eq 2 -and $r.Text -match 'no release manifest' -and $r.Text -match 'SSH:\s+not attempted') "missing manifest: stops before connecting (exit 2)" $r

$d = Join-Path $Work "rel-noarchive"; Copy-Release $FakeRel $d; Remove-Item (Join-Path $d "twigo-launchtest-fake.tar.gz")
$r = Invoke-Launcher "missing-archive" ($Down + @("-ReleaseDir", $d))
Add-Result ($r.Code -eq 2 -and $r.Text -match 'missing: .*twigo-launchtest-fake\.tar\.gz' -and $r.Text -match 'SSH:\s+not attempted') "missing archive: stops before connecting (exit 2)" $r

$d = Join-Path $Work "rel-nosum"; Copy-Release $FakeRel $d; Remove-Item (Join-Path $d "twigo-launchtest-fake.tar.gz.sha256")
$r = Invoke-Launcher "missing-sha256" ($Down + @("-ReleaseDir", $d))
Add-Result ($r.Code -eq 2 -and $r.Text -match 'missing: .*\.sha256') "missing .sha256 file: stops (exit 2)" $r

$d = Join-Path $Work "rel-badsum"; Copy-Release $FakeRel $d
[System.IO.File]::WriteAllText((Join-Path $d "twigo-launchtest-fake.tar.gz.sha256"), ("0" * 64) + "  twigo-launchtest-fake.tar.gz`n", $Utf8)
$r = Invoke-Launcher "wrong-checksum" ($Down + @("-ReleaseDir", $d))
Add-Result ($r.Code -eq 2 -and $r.Text -match 'checksum file does not match') "incorrect checksum file: stops (exit 2)" $r

$d = Join-Path $Work "rel-corrupt"; Copy-Release $FakeRel $d
$bytes = [System.IO.File]::ReadAllBytes((Join-Path $d "twigo-launchtest-fake.tar.gz")); $bytes[[int]($bytes.Length / 2)] = $bytes[[int]($bytes.Length / 2)] -bxor 0xFF
[System.IO.File]::WriteAllBytes((Join-Path $d "twigo-launchtest-fake.tar.gz"), $bytes)
$r = Invoke-Launcher "corrupt-archive" ($Down + @("-ReleaseDir", $d))
Add-Result ($r.Code -eq 2 -and $r.Text -match 'archive does not match the manifest') "damaged archive (one byte changed): stops (exit 2)" $r

# Consistent hashes, but the archive itself is broken (not gzip): the integrity check must catch it.
$d = Join-Path $Work "rel-notgzip"; Copy-Release $FakeRel $d
[System.IO.File]::WriteAllText((Join-Path $d "twigo-launchtest-fake.tar.gz"), "this is not an archive`n", $Utf8)
$ah = Get-Sha256 (Join-Path $d "twigo-launchtest-fake.tar.gz")
[System.IO.File]::WriteAllText((Join-Path $d "twigo-launchtest-fake.tar.gz.sha256"), "$ah  twigo-launchtest-fake.tar.gz`n", $Utf8)
Set-ManifestField $d "archive" "sha256" $ah; Set-ManifestField $d "archive" "bytes" (Get-Item (Join-Path $d "twigo-launchtest-fake.tar.gz")).Length
Set-ManifestField $d "checksumFile" "sha256" (Get-Sha256 (Join-Path $d "twigo-launchtest-fake.tar.gz.sha256"))
$r = Invoke-Launcher "not-an-archive" ($Down + @("-ReleaseDir", $d))
Add-Result ($r.Code -eq 2 -and $r.Text -match 'cannot be read') "archive integrity check (consistent hashes, unreadable archive): stops (exit 2)" $r

$d = Join-Path $Work "rel-secret"; $t = Join-Path $Work "tree-secret"; Copy-Release $Fake $t
[System.IO.File]::WriteAllText((Join-Path $t ".env.production"), "AUTH_SECRET=must-never-leave`n", $Utf8)
New-TestRelease $d "twigo-launchtest-secret" $t $Head
$r = Invoke-Launcher "archive-with-env" ($Down + @("-ReleaseDir", $d))
Add-Result ($r.Code -eq 2 -and $r.Text -match 'settings or key file that must never be uploaded') "archive containing .env.production: refused, nothing sent (exit 2)" $r

$d = Join-Path $Work "rel-data"; $t = Join-Path $Work "tree-data"; Copy-Release $Fake $t
New-Item -ItemType Directory -Path (Join-Path $t "backups") | Out-Null; [System.IO.File]::WriteAllText((Join-Path $t "backups\db.cwbak.gz.enc"), "x", $Utf8)
New-TestRelease $d "twigo-launchtest-data" $t $Head
$r = Invoke-Launcher "archive-with-backups" ($Down + @("-ReleaseDir", $d))
Add-Result ($r.Code -eq 2 -and $r.Text -match 'data that must never be uploaded') "archive containing backups: refused (exit 2)" $r

$d = Join-Path $Work "rel-mixed"; $other = Join-Path $Work "other-deploy-twigo.sh"
[System.IO.File]::WriteAllText($other, ($standIn -replace "`r", "") + "# another version`n", $Utf8)
New-TestRelease $d "twigo-launchtest-mixed" $Fake $Head $other
$r = Invoke-Launcher "mixed-release" ($Down + @("-ReleaseDir", $d))
Add-Result ($r.Code -eq 2 -and $r.Text -match 'mixed releases') "deploy script not the one inside the archive: refused (exit 2)" $r

$d = Join-Path $Work "rel-crlf"; $crlf = Join-Path $Work "crlf-deploy-twigo.sh"
[System.IO.File]::WriteAllText($crlf, (($standIn -replace "`r", "") -replace "`n", "`r`n"), $Utf8)
$t = Join-Path $Work "tree-crlf"; Copy-Release $Fake $t; Copy-Item $crlf (Join-Path $t "scripts\deploy\deploy-twigo.sh") -Force
New-TestRelease $d "twigo-launchtest-crlf" $t $Head
$r = Invoke-Launcher "crlf-script" ($Down + @("-ReleaseDir", $d))
Add-Result ($r.Code -eq 2 -and $r.Text -match 'Windows line endings') "deploy script with Windows line endings: refused (exit 2)" $r

$d = Join-Path $Work "rel-old"; Copy-Release $FakeRel $d
$older = (Invoke-Tool "git.exe" @("-C", $Repo, "rev-parse", "HEAD~1")).Out.Trim()
Set-ManifestField $d "" "gitCommit" $older
$r = Invoke-Launcher "older-than-folder" ($Down + @("-ReleaseDir", $d))
$r2 = Invoke-Launcher "older-allowed-checkonly" ($Base + @("-ReleaseDir", $d, "-CheckOnly", "-AllowOlderRelease"))
Add-Result ($r.Code -eq 2 -and $r.Text -match 'OLDER than the code in this folder' -and $r2.Code -eq 0) "release older than this folder's code: refused (exit 2); allowed only with -AllowOlderRelease" $r

$r = Invoke-Launcher "check-only" ($Base + @("-ReleaseDir", $FakeRel, "-CheckOnly"))
Add-Result ($r.Code -eq 0 -and $r.Text -match 'RELEASE CHECK: PASSED' -and $r.Text -match 'Release:\s+twigo-launchtest-fake') "valid release: -CheckOnly passes and shows the release version" $r

# ================================================================================ 2. SSH failures
$r = Invoke-Launcher "unreachable" ($Base + @("-Target", "twigotest-down", "-ReleaseDir", $FakeRel))
Add-Result ($r.Code -eq 4 -and $r.Text -match 'could not be reached' -and $r.Text -match 'FAILED at: SSH connection') "missing SSH connection: exit 4, stage shown" $r

$r = Invoke-Launcher "auth-failure" ($Base + @("-Target", "twigotest-badkey", "-ReleaseDir", $FakeRel))
Add-Result ($r.Code -eq 5 -and $r.Text -match 'refused the SSH sign-in' -and $r.Text -match 'Permission denied') "authentication failure: exit 5, OpenSSH's reason shown" $r

$r = Invoke-Launcher "host-key-changed" ($Base + @("-Target", "twigotest-hostkey", "-ReleaseDir", $FakeRel))
$st = Get-ServerState
Add-Result ($r.Code -eq 6 -and $r.Text -match 'did not accept the server''s host key' -and -not $st.ContainsKey("SHA deploy-twigo.sh")) "changed host key: refused by OpenSSH (verification stays on), exit 6, nothing uploaded" $r

$r = Invoke-Launcher "scp-failure" ($Base + @("-Target", "twigotest-nosftp", "-ReleaseDir", $FakeRel))
$st = Get-ServerState
Add-Result ($r.Code -eq 8 -and $r.Text -match 'The upload failed' -and $r.Text -match 'FAILED at: upload' -and -not $st.ContainsKey("SHA deploy-twigo.sh")) "SCP failure: exit 8, nothing deployed" $r

[void](Invoke-Server @("lock-hold"))
$r = Invoke-Launcher "deployment-running" ($Base + @("-Target", "twigotest", "-ReleaseDir", $FakeRel))
[void](Invoke-Server @("lock-release"))
$st = Get-ServerState
Add-Result ($r.Code -eq 30 -and $r.Text -match 'Another deployment is running' -and -not $st.ContainsKey("SHA deploy-twigo.sh")) "another deployment running: exit 30, nothing uploaded" $r

# ================================================================================ 3. upload + exit codes (stand-in script)
[void](Invoke-Server @("fake-code", "14"))
$r = Invoke-Launcher "remote-step4-fails" ($Base + @("-Target", "twigotest", "-ReleaseDir", $FakeRel))
$st = Get-ServerState
$m = [System.IO.File]::ReadAllText((Join-Path $FakeRel "release-manifest.json")) | ConvertFrom-Json
$uploadedOk = ($st["SHA deploy-twigo.sh"] -eq $m.deployScript.sha256) -and ($st["SHA twigo-launchtest-fake.tar.gz"] -eq $m.archive.sha256) -and ($st["SHA twigo-launchtest-fake.tar.gz.sha256"] -eq $m.checksumFile.sha256) -and ($st["UPLOAD"] -eq "")
Add-Result ($uploadedOk -and $r.Text -match 'deploy-twigo\.sh: OK' -and $r.Text -match 'twigo-launchtest-fake\.tar\.gz: OK' -and $r.Text -match 'twigo-launchtest-fake\.tar\.gz\.sha256: OK') "successful upload: the three files arrive, verify on the server (sha256sum -c) and are moved into place" $r
Add-Result ($r.Code -eq 14 -and $r.Text -match 'STAND-IN ARCHIVE=/tmp/twigo-launchtest/home/Server/twigo-launchtest-fake\.tar\.gz' -and $r.Text -match 'FAILED at: server step 4/10: Creating backups' -and $r.Text -match 'exit code 14: failed at step 4 of 10') "remote failure: exit code 14 passed through, failed stage named, exact archive passed to the server script" $r
Add-Result ($r.Text -notmatch 'TWIGO DEPLOYMENT: SUCCESS') "no success reported after a failure" $r

[void](Invoke-Server @("fake-code", "0"))
$r = Invoke-Launcher "health-fails-after-success" ($Base + @("-Target", "twigotest", "-ReleaseDir", $FakeRel))
Add-Result ($r.Code -eq 9 -and $r.Text -match 'TWIGO-HEALTH: FAILED' -and $r.Text -notmatch 'TWIGO DEPLOYMENT: SUCCESS') "server script reports success but /api/health fails: exit 9, not reported as success" $r

# ================================================================================ 4. older than the server's release
# A clone of this repository at HEAD~1 (so the folder check passes) while the server runs a newer tag.
$Clone = Join-Path $Work "clone"
[void](Invoke-Tool "git.exe" @("clone", "--quiet", "--shared", "--no-checkout", $Repo, $Clone))
[void](Invoke-Tool "git.exe" @("-C", $Clone, "checkout", "--quiet", $older))
[void](Invoke-Tool "git.exe" @("-C", $Clone, "tag", "twigo-launchtest-newer", $Head))
Copy-Item $Launcher (Join-Path $Clone "deploy-twigo.ps1") -Force
$d = Join-Path $Work "rel-older-than-server"; Copy-Release $FakeRel $d; Set-ManifestField $d "" "gitCommit" $older
[void](Invoke-Server @("marker", "twigo-launchtest-newer.tar.gz", ("ab" * 32)))
$rr = Invoke-Tool "powershell.exe" @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $Clone "deploy-twigo.ps1"), "-SshConfigFile", $cfg, "-RemoteDir", $RemoteDir, "-SkipPublicCheck", "-Target", "twigotest", "-ReleaseDir", $d)
[void](Invoke-Server @("unmarker"))
$r = [pscustomobject]@{ Code = $rr.Code; Text = $rr.Out + $rr.Err; File = "(clone run)" }
Add-Result ($r.Code -eq 2 -and $r.Text -match 'OLDER than the one on the server \(twigo-launchtest-newer\)' -and $r.Text -match 'Nothing was uploaded') "release older than the one running on the server: refused before the upload (exit 2)" $r

# ================================================================================ 5. real deployments
if (-not $Quick) {
  Write-Host "Building a release of HEAD with new-release.ps1 for the real deployments..."
  $RealRel = Join-Path $Work "rel-real"
  $nr = Invoke-Tool "powershell.exe" @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $NewRelease, "-Ref", "HEAD", "-Version", "twigo-launchtest-1", "-OutDir", $RealRel)
  if ($nr.Code -ne 0) { throw "new-release.ps1 failed: $($nr.Out) $($nr.Err)" }
  [void](Invoke-Server @("free-port"))
  $envBefore = (Get-ServerState)["ENVSHA"]

  [void](Invoke-Server @("env-bad"))
  $envBad = (Get-ServerState)["ENVSHA"]
  $r = Invoke-Launcher "real-step3-fails" ($Base + @("-Target", "twigotest", "-ReleaseDir", $RealRel))
  $st = Get-ServerState
  Add-Result ($r.Code -eq 13 -and $r.Text -match 'Required settings are empty' -and $r.Text -match 'FAILED at: server step 3/10: Checking production settings' -and $st["ENVSHA"] -eq $envBad) "real server script fails at step 3 (empty ORG_JURISDICTION): exit 13, stage named, settings file untouched" $r

  [void](Invoke-Server @("env-good"))
  $envGood = (Get-ServerState)["ENVSHA"]
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $r = Invoke-Launcher "real-success" ($Base + @("-Target", "twigotest", "-ReleaseDir", $RealRel))
  Write-Host ("   (real deployment took {0:N0} s)" -f $sw.Elapsed.TotalSeconds)
  $st = Get-ServerState
  $health = Invoke-Server @("health")
  $m = [System.IO.File]::ReadAllText((Join-Path $RealRel "release-manifest.json")) | ConvertFrom-Json
  Add-Result ($r.Code -eq 0 -and $r.Text -match 'TWIGO DEPLOYMENT: SUCCESS' -and $r.Text -match 'DEPLOYMENT RESULT: SUCCESS' -and $r.Text -match 'TWIGO-HEALTH: ok' -and $health.Out -match '"status":"ok"') "successful remote execution: real deployment, exit 0, live output streamed, app healthy on 127.0.0.1:1010" $r
  Add-Result ($st["SHA deploy-twigo.sh"] -eq $m.deployScript.sha256 -and $st["SHA twigo-launchtest-1.tar.gz"] -eq $m.archive.sha256 -and $st["MARKER"] -match "^twigo-launchtest-1\.tar\.gz $($m.archive.sha256)$") "the deployed release is exactly the one in the manifest" $r
  Add-Result ($st["ENVSHA"] -eq $envGood -and $st["ENVFILES"] -eq "" -and $st["STRAY"] -eq "" -and $st["UPLOAD"] -eq "") "no secrets uploaded: settings file unchanged, no other .env or secret file on the server, upload folder empty" $r
  $files = @(Get-ChildItem $Work -Filter "run-*.txt" | ForEach-Object { "/mnt/" + $_.FullName.Substring(0, 1).ToLowerInvariant() + ($_.FullName.Substring(2) -replace '\\', '/') })
  $leak = Invoke-Server (@("leaks") + $files)
  Add-Result ($leak.Out -match 'NO-LEAK') "no secret value in any launcher output or server log" $null
}

# ================================================================================ static safety of the launcher
$src = [System.IO.File]::ReadAllText($Launcher)
$unsafeOpts = @('StrictHostKeyChecking', 'UserKnownHostsFile', 'BatchMode', 'sshpass', 'PasswordAuthentication', 'IdentityFile', 'PreferredAuthentications')
$found = @($unsafeOpts | Where-Object { $src -match [regex]::Escape($_) })
Add-Result ($found.Count -eq 0 -and $src -notmatch '\s-i\s' -and $src -notmatch '\.env\.production"\s*,' ) "launcher never disables host-key checking, never passes keys or passwords" $null

# ================================================================================ result
if (-not $Keep) { [void](Invoke-Server @("down")) }
try { if (-not $KeepAlive.HasExited) { $KeepAlive.Kill() } } catch { }
Write-Host ""
Write-Host "RESULT: $($script:Pass) passed, $($script:Fail) failed"
$Results | ForEach-Object { Write-Host "  $_" }
Write-Host "Outputs of every run: $Work"
if ($script:Fail -gt 0) { exit 1 }
exit 0
