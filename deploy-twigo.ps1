<#
.SYNOPSIS
  Twigo one-click deployment from Windows to the VPS.

.DESCRIPTION
    cd D:\MyProject\Co_work
    .\deploy-twigo.ps1

  1. Checks the release on this computer. release\release-manifest.json names the archive, its checksum
     file and the matching deploy-twigo.sh; each must match the SHA-256 recorded there, the archive must
     be intact and contain no secret or data, and it must contain that same deploy-twigo.sh. Nothing is
     sent if any check fails.
  2. Connects with Windows OpenSSH using your own SSH setup (keys, agent, ~/.ssh/config, known_hosts).
     Host keys are verified by OpenSSH as usual; if a password is needed, OpenSSH asks for it.
     Makes sure /home/shabla/Server exists.
  3. Uploads exactly those three files, verifies them on the server, then runs the tested server script
     (bash ~/Server/deploy-twigo.sh) with live output, and returns its exit code.

  Never uploads or changes .env.production, the database, uploaded files, backups or any secret. Stores
  no password or key. Build a release first: scripts\deploy\new-release.ps1 -Tag <tag>.
  Guide: docs\ONE-CLICK-DEPLOYMENT.md

  Exit codes
     0  deployed, health check passed          1  unexpected error in this launcher
     2  release check failed (nothing sent)    3  upload damaged on the server (nothing deployed)
     4  server unreachable                     5  SSH sign-in refused
     6  host key unknown or changed            7  server folder not usable
     8  upload failed                          9  health check failed right after the deployment
    10  server script stopped before step 1    11-20  server script failed at step (code - 10)
    30  another deployment is running          129/130/141/143  server script interrupted
   255  SSH connection failed during the deployment

.PARAMETER CheckOnly
  Only check the release on this computer; do not connect.
.PARAMETER AllowOlderRelease
  Deploy on purpose a release that is older than this folder's code or than the release on the server.
#>
[CmdletBinding()]
param(
  [string]$Target = "shabla@162.35.23.106",
  [string]$RemoteDir = "/home/shabla/Server",
  [string]$ReleaseDir = "",
  [string]$SshConfigFile = "",
  [switch]$CheckOnly,
  [switch]$AllowOlderRelease,
  [switch]$SkipPublicCheck
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

$SiteUrl = "https://twigo.space"
$AppPort = 1010
$ManifestFormat = "twigo-release-manifest/1"
$Utf8 = New-Object System.Text.UTF8Encoding $false
# The ten steps of scripts/deploy/deploy-twigo.sh, in order (exit code 10 + N = step N failed).
$StepNames = @("Checking server environment", "Verifying release archive", "Checking production settings",
  "Creating backups", "Preparing application release", "Building Docker image", "Starting PostgreSQL",
  "Applying database migrations", "Checking owner and legal publication", "Starting and verifying Twigo")
$RequiredInArchive = @("Dockerfile", "docker-compose.yml", "package.json", "package-lock.json", "server.ts",
  "prisma/schema.prisma", "scripts/migrate.ts", "scripts/create-admin.ts", "scripts/legal-publish-reviewed.ts",
  "scripts/backup.ts", ".env.production.example", "src/app/api/health/route.ts", "scripts/deploy/deploy-twigo.sh")
$ManualActions = @(
  "Central Caddy: register twigo.space with upstream 127.0.0.1:$AppPort (WebSocket on; www.twigo.space redirects to $SiteUrl). Do not install another Caddy.",
  "Cloudflare: confirm the DNS record for twigo.space is proxied and SSL/TLS is Full (strict).",
  "Email: send one real test email (sign in as the owner, Admin -> Email -> Send a test email to me).",
  "Backups: copy ~/Server/backups/twigo off the server (docs/DEPLOYMENT.md, section 8).",
  "Legal documents: publish only texts a lawyer actually reviewed (bash ~/Server/deploy-twigo.sh, type PUBLISH)."
)

$S = [ordered]@{
  Version = "(not read)"; Files = "none"; Ssh = "not attempted"; Remote = "not run"
  Health = "not checked"; Port = "not checked"; Public = "not checked"; Stage = ""
}

# ---------------------------------------------------------------------------------------------- output
function Write-Stage([string]$Number, [string]$Text) { Write-Host ""; Write-Host "[$Number] $Text" -ForegroundColor Cyan }
function Write-Ok([string]$Text) { Write-Host "      OK: $Text" -ForegroundColor Green }
function Write-Info([string]$Text) { Write-Host "      $Text" }
function Write-Warn([string]$Text) { Write-Host "      WARNING: $Text" -ForegroundColor Yellow }

function Show-Summary([int]$Code) {
  Write-Host ""
  Write-Host "=================================================================="
  if ($Code -eq 0 -and -not $CheckOnly) { Write-Host "TWIGO DEPLOYMENT: SUCCESS" -ForegroundColor Green }
  elseif ($Code -eq 0) { Write-Host "TWIGO RELEASE CHECK: PASSED (nothing was sent)" -ForegroundColor Green }
  else { Write-Host "TWIGO DEPLOYMENT: FAILED at: $($S.Stage)" -ForegroundColor Red }
  Write-Host "=================================================================="
  Write-Host "Release:            $($S.Version)"
  Write-Host "Uploaded files:     $($S.Files)"
  Write-Host "SSH:                $($S.Ssh)"
  Write-Host "Server script:      $($S.Remote)"
  Write-Host "Application health: $($S.Health)"
  Write-Host "Port:               $($S.Port)"
  Write-Host "Public address:     $SiteUrl - $($S.Public)"
  Write-Host "Exit code:          $Code"
  if (-not $CheckOnly) {
    Write-Host "Remaining manual actions (not automated on purpose):"
    foreach ($a in $ManualActions) { Write-Host "  - $a" }
  }
}

function Stop-Launcher([int]$Code, [string]$Stage, [string]$Message, [string[]]$Help = @()) {
  $S.Stage = $Stage
  Write-Host ""
  Write-Host "      FAILED: $Message" -ForegroundColor Red
  foreach ($h in $Help) { if ($h) { Write-Host "      $h" } }
  Show-Summary $Code
  exit $Code
}

# ---------------------------------------------------------------------------------------------- tools
# Quotes arguments the way Windows programs (MSVC runtime: ssh, scp, tar, git) split their command line.
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

# Runs a program. Captured: output and errors are returned. -Live: the program uses this console directly
# (live output, prompts, Ctrl+C). OpenSSH asks for passwords and host-key confirmations on the console
# itself in both modes.
function Invoke-Tool([string]$File, [string[]]$Arguments, [string]$WorkDir = "", [switch]$Live) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $File
  $psi.Arguments = ConvertTo-ArgString $Arguments
  $psi.UseShellExecute = $false
  if ($WorkDir) { $psi.WorkingDirectory = $WorkDir }
  if (-not $Live) {
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = $Utf8
    $psi.StandardErrorEncoding = $Utf8
  }
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  [void]$p.Start()
  if ($Live) {
    $p.WaitForExit()
    return [pscustomobject]@{ Code = $p.ExitCode; Out = ""; Err = "" }
  }
  $o = $p.StandardOutput.ReadToEndAsync()
  $e = $p.StandardError.ReadToEndAsync()
  $p.WaitForExit()
  return [pscustomobject]@{ Code = $p.ExitCode; Out = $o.Result; Err = $e.Result }
}

function Find-OpenSsh([string]$Name) {
  $p = Join-Path $env:SystemRoot "System32\OpenSSH\$Name.exe"
  if (Test-Path -LiteralPath $p) { return $p }
  $c = Get-Command "$Name.exe" -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { return $c.Source }
  return $null
}

function Get-Sha256([string]$Path) { (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant() }

function Get-Field($Object, [string]$Path) {
  $cur = $Object
  foreach ($k in $Path.Split('.')) {
    if ($null -eq $cur) { return $null }
    $prop = $cur.PSObject.Properties[$k]
    if ($null -eq $prop) { return $null }
    $cur = $prop.Value
  }
  return $cur
}

function Get-ErrorLines([string]$Text) {
  return @($Text -split "`r?`n" | Where-Object { $_.Trim() -and $_ -notmatch '^Pseudo-terminal will not be allocated' } | Select-Object -Last 6)
}

# What kind of SSH failure (ssh exits with 255 for its own errors).
function Get-SshProblem([string]$ErrText) {
  if ($ErrText -match 'REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed|host key for .* has changed|No [A-Z0-9-]+ host key is known') { return "hostkey" }
  if ($ErrText -match 'Permission denied|Too many authentication failures|Authentication failed|No more authentication methods') { return "auth" }
  return "unreachable"
}

function Stop-SshProblem([string]$Kind, [string]$ErrText, [string]$Stage) {
  $lines = @(Get-ErrorLines $ErrText)
  switch ($Kind) {
    "hostkey" {
      $S.Ssh = "refused: the server's host key is unknown or has changed (OpenSSH verification)"
      Stop-Launcher 6 $Stage "OpenSSH did not accept the server's host key." ($lines + @(
        "If the server was reinstalled, confirm the new key with the provider, then remove the old entry:",
        "  ssh-keygen -R $($Target.Split('@')[-1])",
        "and connect once by hand to accept the new key: ssh $Target",
        "If nothing changed on the server, do NOT continue: someone may be intercepting the connection."))
    }
    "auth" {
      $S.Ssh = "refused: authentication failed for $Target"
      Stop-Launcher 5 $Stage "The server refused the SSH sign-in." ($lines + @(
        "Test by hand: ssh $Target   (see docs\ONE-CLICK-DEPLOYMENT.md, SSH sign-in problems)"))
    }
    default {
      $S.Ssh = "failed: the server could not be reached"
      Stop-Launcher 4 $Stage "The server could not be reached over SSH." ($lines + @(
        "Check the internet connection, the address ($Target) and that the VPS is running; then run again."))
    }
  }
}

function Get-RemoteMeaning([int]$Code) {
  if ($Code -eq 0) { return "the deployment succeeded and the health check passed" }
  if ($Code -eq 3) { return "the upload arrived damaged or incomplete; nothing was deployed" }
  if ($Code -eq 9) { return "the deployment script finished, but the health check right after it failed" }
  if ($Code -eq 10) { return "the server script stopped before its first step" }
  if ($Code -ge 11 -and $Code -le 20) {
    $n = $Code - 10
    $after = if ($n -ge 5) { "the previous version was put back" } else { "nothing was changed on the server (backups may have been made)" }
    return "failed at step $n of 10 ($($StepNames[$n - 1])); $after"
  }
  if ($Code -eq 30) { return "another deployment is running on the server; nothing was changed" }
  if ($Code -eq 129) { return "interrupted: the connection or terminal was closed; the server puts the previous version back" }
  if ($Code -eq 130) { return "interrupted with Ctrl+C; the server put the previous version back" }
  if ($Code -eq 141) { return "interrupted: the output could no longer be written; the server put the previous version back" }
  if ($Code -eq 143) { return "interrupted (TERM); the server put the previous version back" }
  if ($Code -eq 255) { return "the SSH connection failed or was lost during the deployment" }
  return "the server returned exit code $Code"
}

function Get-StageOfRemote([int]$Code) {
  if ($Code -eq 3) { return "upload verification on the server" }
  if ($Code -eq 9) { return "health check after the deployment" }
  if ($Code -ge 11 -and $Code -le 20) { return "server step $($Code - 10)/10: $($StepNames[$Code - 11])" }
  if ($Code -eq 30) { return "server busy (another deployment)" }
  if ($Code -eq 255) { return "SSH connection during the deployment" }
  return "server deployment script"
}

# ---------------------------------------------------------------------------------------------- main
try {
  Write-Host "=================================================================="
  Write-Host "  TWIGO ONE-CLICK DEPLOYMENT   ($Target -> $RemoteDir)"
  Write-Host "=================================================================="

  # ============================================================ 1. local checks (nothing is sent)
  $stage = "release check on this computer"
  Write-Stage "1/4" "Checking the release on this computer"
  if ($RemoteDir -notmatch '^/[A-Za-z0-9._/-]+$' -or $RemoteDir -match '(^|/)\.\.(/|$)') {
    Stop-Launcher 2 $stage "The server folder '$RemoteDir' is not a plain absolute path."
  }
  $RemoteDir = $RemoteDir.TrimEnd('/')
  if ($Target -notmatch '^[A-Za-z0-9._@:\[\]-]+$') { Stop-Launcher 2 $stage "The SSH target '$Target' is not valid." }
  if (-not $ReleaseDir) { $ReleaseDir = Join-Path $PSScriptRoot "release" }
  $ReleaseDir = [System.IO.Path]::GetFullPath($ReleaseDir)
  $manifestPath = Join-Path $ReleaseDir "release-manifest.json"
  $buildHint = "Build a release: git tag <name>, then  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy\new-release.ps1 -Tag <name>"
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    Stop-Launcher 2 $stage "There is no release manifest: $manifestPath" @($buildHint)
  }
  try { $m = [System.IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json }
  catch { Stop-Launcher 2 $stage "The release manifest is not valid JSON: $manifestPath" @($buildHint) }

  $hex64 = '^[0-9a-f]{64}$'
  $version = [string](Get-Field $m "version")
  $archiveName = [string](Get-Field $m "archive.file")
  $archiveSha = [string](Get-Field $m "archive.sha256")
  $archiveBytes = Get-Field $m "archive.bytes"
  $sumName = [string](Get-Field $m "checksumFile.file")
  $sumSha = [string](Get-Field $m "checksumFile.sha256")
  $scriptName = [string](Get-Field $m "deployScript.file")
  $scriptSha = [string](Get-Field $m "deployScript.sha256")
  $commit = [string](Get-Field $m "gitCommit")
  $bad = @()
  if ([string](Get-Field $m "format") -ne $ManifestFormat) { $bad += "format is not $ManifestFormat" }
  if ($version -notmatch '^twigo-[A-Za-z0-9][A-Za-z0-9._-]{0,80}$') { $bad += "version '$version' is not a release name" }
  if ($archiveName -ne "$version.tar.gz") { $bad += "archive.file must be $version.tar.gz" }
  if ($archiveSha -notmatch $hex64) { $bad += "archive.sha256 is not a SHA-256" }
  if (-not ($archiveBytes -is [int] -or $archiveBytes -is [long]) -or $archiveBytes -le 0) { $bad += "archive.bytes is missing" }
  if ($sumName -ne "$archiveName.sha256") { $bad += "checksumFile.file must be $archiveName.sha256" }
  if ($sumSha -notmatch $hex64) { $bad += "checksumFile.sha256 is not a SHA-256" }
  if ($scriptName -ne "deploy-twigo.sh") { $bad += "deployScript.file must be deploy-twigo.sh" }
  if ($scriptSha -notmatch $hex64) { $bad += "deployScript.sha256 is not a SHA-256" }
  if ($commit -and $commit -notmatch '^[0-9a-f]{40}$') { $bad += "gitCommit is not a commit id" }
  if ($bad.Count -gt 0) { Stop-Launcher 2 $stage "The release manifest is not valid: $($bad -join '; ')." @($buildHint) }
  $S.Version = "$version" + $(if ($commit) { " (commit $($commit.Substring(0, 12)), built $([string](Get-Field $m 'createdAt')))" } else { "" })
  Write-Info "Release: $version"
  Write-Info "Manifest: $manifestPath"

  $archivePath = Join-Path $ReleaseDir $archiveName
  $sumPath = Join-Path $ReleaseDir $sumName
  $scriptPath = Join-Path $ReleaseDir $scriptName
  foreach ($f in @($scriptPath, $archivePath, $sumPath)) {
    if (-not (Test-Path -LiteralPath $f -PathType Leaf)) {
      Stop-Launcher 2 $stage "A file named in the manifest is missing: $f" @("Build the release again: scripts\deploy\new-release.ps1")
    }
  }
  Write-Ok "deploy script, archive and checksum file exist"

  $actualBytes = (Get-Item -LiteralPath $archivePath).Length
  $actualSha = Get-Sha256 $archivePath
  if ($actualBytes -ne $archiveBytes -or $actualSha -ne $archiveSha) {
    Stop-Launcher 2 $stage "The archive does not match the manifest (size $actualBytes, sha256 $actualSha)." @("It is damaged or not this release. Build the release again.")
  }
  $sumText = [System.IO.File]::ReadAllText($sumPath)
  $sumOk = ((Get-Sha256 $sumPath) -eq $sumSha) -and ($sumText -match "^([0-9a-f]{64})  (\S+)`n?$") -and ($Matches[1] -eq $actualSha) -and ($Matches[2] -eq $archiveName)
  if (-not $sumOk) {
    Stop-Launcher 2 $stage "The checksum file does not match the archive: $sumPath" @("Build the release again.")
  }
  Write-Ok "checksum verified (sha256 $($actualSha.Substring(0, 16))..., $([math]::Round($actualBytes / 1MB, 1)) MB)"

  $scriptBytes = [System.IO.File]::ReadAllBytes($scriptPath)
  $scriptText = $Utf8.GetString($scriptBytes)
  if ((Get-Sha256 $scriptPath) -ne $scriptSha) { Stop-Launcher 2 $stage "deploy-twigo.sh does not match the manifest." @("Build the release again.") }
  if ($scriptBytes -contains [byte]13) { Stop-Launcher 2 $stage "deploy-twigo.sh has Windows line endings; it would fail on the server." @("Build the release again (it takes the script from git with LF endings).") }
  if (-not $scriptText.StartsWith("#!/usr/bin/env bash") -or $scriptText -notmatch 'TWIGO PRODUCTION DEPLOYMENT') {
    Stop-Launcher 2 $stage "deploy-twigo.sh in the release folder is not the Twigo deployment script."
  }

  $ssh = Find-OpenSsh "ssh"; $scp = Find-OpenSsh "scp"
  $tar = Join-Path $env:SystemRoot "System32\tar.exe"
  if (-not (Test-Path -LiteralPath $tar)) { Stop-Launcher 2 $stage "tar.exe is missing ($tar); it is part of Windows 10/11." }

  # Archive integrity (reading it completely checks the compression) and contents.
  $list = Invoke-Tool $tar @("-tzf", $archivePath)
  $vlist = Invoke-Tool $tar @("-tvzf", $archivePath)
  if ($list.Code -ne 0 -or $vlist.Code -ne 0) { Stop-Launcher 2 $stage "The archive cannot be read (damaged)." (Get-ErrorLines ($list.Err + $vlist.Err)) }
  $raw = @{}
  $names = New-Object System.Collections.Generic.List[string]
  foreach ($line in ($list.Out -split "`r?`n")) {
    if (-not $line.Trim()) { continue }
    $n = ($line -replace '\\', '/') -replace '^\./', ''
    $n = $n.TrimEnd('/')
    if (-not $n) { continue }
    $names.Add($n); $raw[$n] = $line
  }
  $unsafe = @(); $secret = @(); $data = @()
  foreach ($n in $names) {
    if ($n.StartsWith('/') -or $n -match '^[A-Za-z]:' -or $n -match '(^|/)\.\.(/|$)') { $unsafe += $n; continue }
    $base = $n.Split('/')[-1]
    if (($base -like '.env*' -and $base -ne '.env.example' -and $base -ne '.env.production.example') -or $base -eq '.vps.local' -or
        $n -match 'KEEP-SECRET' -or $n -match '\.(pem|key|p12|pfx)$' -or $base -match '^id_(rsa|dsa|ecdsa|ed25519)$') { $secret += $n }
    if ($n -match '^(backups|storage|\.pgdata|node_modules|\.git)(/|$)' -or $n -match '\.cwbak' -or $n -match '\.(dump|pgdump)$') { $data += $n }
  }
  foreach ($line in ($vlist.Out -split "`r?`n")) { if ($line -match '^[lhbcp]') { $unsafe += $line.Trim() } }
  if ($unsafe.Count) { Stop-Launcher 2 $stage "The archive contains unsafe paths or links: $(($unsafe | Select-Object -First 3) -join ', ')" }
  if ($secret.Count) { Stop-Launcher 2 $stage "The archive contains a settings or key file that must never be uploaded: $(($secret | Select-Object -First 3) -join ', ')" }
  if ($data.Count) { Stop-Launcher 2 $stage "The archive contains data that must never be uploaded (backups, uploaded files, database): $(($data | Select-Object -First 3) -join ', ')" }
  $missing = @($RequiredInArchive | Where-Object { -not $names.Contains($_) })
  if ($missing.Count) { Stop-Launcher 2 $stage "The archive is incomplete; missing: $($missing -join ', ')" }
  Write-Ok "archive intact ($($names.Count) entries): safe paths, no settings file, no keys, no backups or data"

  # The archive must carry the very same deploy-twigo.sh that will be uploaded and run.
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("twigo-check-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    $x = Invoke-Tool $tar @("-xzf", $archivePath, "-C", $tmp, $raw["scripts/deploy/deploy-twigo.sh"])
    $inner = Join-Path $tmp "scripts\deploy\deploy-twigo.sh"
    if ($x.Code -ne 0 -or -not (Test-Path -LiteralPath $inner)) { Stop-Launcher 2 $stage "deploy-twigo.sh could not be read from the archive." }
    if ((Get-Sha256 $inner) -ne $scriptSha) {
      Stop-Launcher 2 $stage "deploy-twigo.sh in the release folder is not the one inside the archive (mixed releases)." @("Build the release again.")
    }
  } finally { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
  Write-Ok "files match the manifest; deploy-twigo.sh is the one inside the archive"

  if (-not $ssh -or -not $scp) {
    Stop-Launcher 2 $stage "Windows OpenSSH (ssh.exe and scp.exe) is not installed." @("Install it: Settings -> System -> Optional features -> OpenSSH Client.")
  }
  $ver = Invoke-Tool $ssh @("-V")
  $sshVersion = (($ver.Err + $ver.Out).Trim() -split "`r?`n")[0]
  if ($sshVersion -notmatch 'OpenSSH') { Stop-Launcher 2 $stage "$ssh is not OpenSSH ($sshVersion)." }
  Write-Ok "OpenSSH available: $sshVersion"
  Write-Info "ssh: $ssh"
  Write-Info "scp: $scp"

  # Never an older release by accident: compare with the code in this folder (git).
  $gitCmd = Get-Command git.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  $gitOk = $false
  if ($gitCmd -and $commit) {
    $inside = Invoke-Tool $gitCmd.Source @("-C", $PSScriptRoot, "rev-parse", "--is-inside-work-tree")
    if ($inside.Code -eq 0 -and $inside.Out.Trim() -eq "true") {
      $known = Invoke-Tool $gitCmd.Source @("-C", $PSScriptRoot, "cat-file", "-e", "$commit^{commit}")
      if ($known.Code -ne 0) {
        Write-Warn "the release's commit is not in this folder's git history; cannot tell whether it is the newest code"
      } else {
        $gitOk = $true
        $changed = Invoke-Tool $gitCmd.Source @("-C", $PSScriptRoot, "diff", "--name-only", $commit, "HEAD")
        $newer = Invoke-Tool $gitCmd.Source @("-C", $PSScriptRoot, "rev-list", "--count", "$commit..HEAD")
        $relevant = @($changed.Out -split "`r?`n" | Where-Object { $_.Trim() -and $_ -notmatch '^(docs/|tests/)' -and $_ -notmatch '\.md$' })
        $count = 0; [void][int]::TryParse($newer.Out.Trim(), [ref]$count)
        if ($count -gt 0 -and $relevant.Count -gt 0) {
          if (-not $AllowOlderRelease) {
            Stop-Launcher 2 $stage "This release is OLDER than the code in this folder: $count newer commit(s) change $($relevant.Count) file(s), e.g. $(($relevant | Select-Object -First 3) -join ', ')." @(
              "Build a release of the current code (git tag <name>; scripts\deploy\new-release.ps1 -Tag <name>),",
              "or, to deploy this older release on purpose: .\deploy-twigo.ps1 -AllowOlderRelease")
          }
          Write-Warn "deploying an OLDER release on purpose (-AllowOlderRelease): $count newer commit(s) in this folder"
        } elseif ($count -gt 0) {
          Write-Info "note: $count newer commit(s) here change only documentation or tests"
        } else {
          Write-Ok "the release contains all committed code of this folder"
        }
        $dirty = Invoke-Tool $gitCmd.Source @("-C", $PSScriptRoot, "status", "--porcelain", "--untracked-files=no")
        $dirtyCount = @($dirty.Out -split "`r?`n" | Where-Object { $_.Trim() }).Count
        if ($dirtyCount -gt 0) { Write-Info "note: $dirtyCount file(s) here have uncommitted changes; they are not part of the release" }
      }
    }
  }
  $S.Port = "127.0.0.1:$AppPort on the server (verified by the server script after the deployment)"

  if ($CheckOnly) {
    $S.Stage = ""
    $S.Files = "none (check only): $scriptName, $archiveName, $sumName"
    Show-Summary 0
    exit 0
  }

  # ============================================================ 2. SSH connection and server folder
  $stage = "SSH connection"
  $sshOpts = @()
  if ($SshConfigFile) { $sshOpts += @("-F", $SshConfigFile) }
  $sshOpts += @("-o", "ConnectTimeout=20", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=8")
  Write-Stage "2/4" "Connecting to $Target and preparing $RemoteDir"
  Write-Info "(if your SSH key has a passphrase or the server wants a password, OpenSSH asks for it here)"
  $probeScript = @'
D='__DIR__'; U="$D/.twigo-upload"
echo TWIGO_PROBE_BEGIN
if mkdir -p "$U" 2>/dev/null && [ -w "$D" ] && [ -w "$U" ]; then echo "DIR=ok"; else echo "DIR=fail"; fi
if [ -f "$D/twigo/.env.production" ]; then echo "ENV=present"; else echo "ENV=missing"; fi
for c in bash sha256sum tar curl flock; do command -v "$c" >/dev/null 2>&1 || echo "MISSING=$c"; done
if [ -e "$D/.twigo-deploy.lock" ] && command -v flock >/dev/null 2>&1 && ! flock -n "$D/.twigo-deploy.lock" true; then echo "LOCK=busy"; else echo "LOCK=free"; fi
echo "FREE_KB=$(df -Pk "$D" 2>/dev/null | awk 'NR==2 {print $4}')"
echo "DEPLOYED=$(head -n 1 "$D/twigo/.twigo-release" 2>/dev/null)"
echo TWIGO_PROBE_END
'@
  $probeScript = $probeScript.Replace("`r", "").Replace("__DIR__", $RemoteDir)
  $probe = Invoke-Tool $ssh ($sshOpts + @("-T", $Target, $probeScript))
  if ($probe.Code -eq 255) { Stop-SshProblem (Get-SshProblem $probe.Err) $probe.Err $stage }
  if ($probe.Out -notmatch 'TWIGO_PROBE_END') {
    $S.Ssh = "connected, but the server check did not run (exit $($probe.Code))"
    Stop-Launcher 7 "server folder check" "The server did not run the folder check." (Get-ErrorLines ($probe.Err + $probe.Out))
  }
  $S.Ssh = "connected to $Target (host key verified by OpenSSH)"
  Write-Ok "SSH connection works"
  $info = @{}; $missingTools = @()
  foreach ($line in ($probe.Out -split "`r?`n")) {
    if ($line -match '^([A-Z_]+)=(.*)$') {
      if ($Matches[1] -eq "MISSING") { $missingTools += $Matches[2] } else { $info[$Matches[1]] = $Matches[2].Trim() }
    }
  }
  $stage = "server folder check"
  if ($info["DIR"] -ne "ok") { Stop-Launcher 7 $stage "$RemoteDir cannot be created or is not writable for $Target." @("Check on the server: ls -ld $RemoteDir") }
  Write-Ok "$RemoteDir exists and is writable"
  $needed = @($missingTools | Where-Object { $_ -in @("bash", "sha256sum") })
  if ($needed.Count) { Stop-Launcher 7 $stage "The server lacks: $($needed -join ', ')." @("Install them: sudo apt-get install -y coreutils bash") }
  foreach ($t in $missingTools) { if ($t -notin $needed) { Write-Warn "the server lacks '$t' (the server script reports what it needs)" } }
  if ($info["LOCK"] -eq "busy") {
    $S.Remote = "not started: another deployment is running on the server"
    Stop-Launcher 30 "server busy (another deployment)" "Another deployment is running on the server. Nothing was uploaded." @("Wait until it has finished, then run again.")
  }
  $freeKb = 0; [void][long]::TryParse([string]$info["FREE_KB"], [ref]$freeKb)
  if ($freeKb -gt 0 -and ($freeKb * 1024) -lt ($archiveBytes + 64MB)) {
    Stop-Launcher 7 $stage "Not enough free disk space in $RemoteDir for the upload ($([math]::Round($freeKb / 1024)) MB free)."
  }
  if ($info["ENV"] -ne "present") {
    Write-Warn "$RemoteDir/twigo/.env.production does not exist yet: the server script will stop at step 3 and explain how to create it (this launcher never uploads it)"
  } else {
    Write-Ok "production settings file present on the server (not read, not changed)"
  }

  # Never an older release by accident: compare with the release running on the server.
  $deployed = [string]$info["DEPLOYED"]
  if ($deployed -match '^(\S+)\s+([0-9a-f]{64})') {
    $depName = $Matches[1]; $depSha = $Matches[2]
    if ($depSha -eq $archiveSha) {
      Write-Info "the server already runs this release ($depName); deploying it again is safe"
    } else {
      Write-Info "the server currently runs: $depName"
      $depTag = $depName -replace '\.tar\.gz$', ''
      if ($gitOk -and $depTag -match '^twigo-[A-Za-z0-9][A-Za-z0-9._-]*$') {
        $depCommit = Invoke-Tool $gitCmd.Source @("-C", $PSScriptRoot, "rev-parse", "--verify", "--quiet", "refs/tags/$depTag^{commit}")
        if ($depCommit.Code -eq 0) {
          $dc = $depCommit.Out.Trim()
          $isOlder = Invoke-Tool $gitCmd.Source @("-C", $PSScriptRoot, "merge-base", "--is-ancestor", $commit, $dc)
          if ($isOlder.Code -eq 0 -and $dc -ne $commit) {
            if (-not $AllowOlderRelease) {
              Stop-Launcher 2 "release check against the server" "This release ($version) is OLDER than the one on the server ($depTag). Nothing was uploaded." @(
                "Build a newer release, or deploy this one on purpose: .\deploy-twigo.ps1 -AllowOlderRelease")
            }
            Write-Warn "replacing the newer release $depTag with the older $version on purpose (-AllowOlderRelease)"
          }
        }
      }
    }
  }

  # ============================================================ 3. upload
  $stage = "upload"
  Write-Stage "3/4" "Uploading the release to $RemoteDir/.twigo-upload"
  $scpOpts = @()
  if ($SshConfigFile) { $scpOpts += @("-F", $SshConfigFile) }
  $scpOpts += @("-o", "ConnectTimeout=20", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=8")
  # Relative names from the release folder: exactly these three files, nothing else.
  $up = Invoke-Tool $scp ($scpOpts + @($scriptName, $archiveName, $sumName, "${Target}:$RemoteDir/.twigo-upload/")) -WorkDir $ReleaseDir
  if ($up.Code -ne 0) {
    $kind = Get-SshProblem $up.Err
    $why = if ($kind -eq "auth") { "the server refused the sign-in during the upload" } elseif ($kind -eq "hostkey") { "the host key was not accepted" } else { "the copy did not complete" }
    $S.Files = "upload FAILED ($why); nothing was deployed"
    Stop-Launcher 8 $stage "The upload failed: $why (scp exit $($up.Code))." (@(Get-ErrorLines ($up.Err + $up.Out)) + @("Nothing was deployed. Run again; if it keeps failing, see docs\ONE-CLICK-DEPLOYMENT.md."))
  }
  $S.Files = "$scriptName, $archiveName, $sumName (uploaded; checked on the server before use)"
  Write-Ok "uploaded $scriptName, $archiveName ($([math]::Round($archiveBytes / 1MB, 1)) MB), $sumName"

  # ============================================================ 4. verify on the server and deploy
  $stage = "server deployment"
  Write-Stage "4/4" "Verifying the upload and running the deployment on the server (live output)"
  $deployScript = @'
trap ':' INT HUP TERM
D='__DIR__'; U="$D/.twigo-upload"; A='__ARCHIVE__'
echo 'Checking the uploaded files on the server:'
cd "$U" || exit 3
printf '%s  %s\n' '__HSCRIPT__' 'deploy-twigo.sh' '__HARCHIVE__' "$A" '__HSUM__' "$A.sha256" | sha256sum -c - || { echo 'The upload is incomplete or damaged. Nothing was deployed.'; exit 3; }
if [ -e "$D/.twigo-deploy.lock" ] && command -v flock >/dev/null 2>&1 && ! flock -n "$D/.twigo-deploy.lock" true; then echo 'Another deployment is running on this server. Nothing was changed.'; exit 30; fi
mv -f deploy-twigo.sh "$A" "$A.sha256" "$D/" || exit 3
cd "$D" || exit 3
echo 'Upload verified and in place. Starting the deployment script:'
TWIGO_ARCHIVE="$D/$A" bash "$D/deploy-twigo.sh"
rc=$?
if [ "$rc" -ne 0 ]; then exit "$rc"; fi
if curl -fsS --max-time 15 http://127.0.0.1:1010/api/health 2>/dev/null | grep -Eq 'status.{3}ok.{3}db.{3}ok'; then echo 'TWIGO-HEALTH: ok (http://127.0.0.1:1010/api/health)'; exit 0; fi
echo 'TWIGO-HEALTH: FAILED (http://127.0.0.1:1010/api/health does not report status ok and db ok)'
exit 9
'@ -replace "`r", ""
  $deployScript = $deployScript.Replace("__DIR__", $RemoteDir).Replace("__ARCHIVE__", $archiveName).Replace("__HSCRIPT__", $scriptSha).Replace("__HARCHIVE__", $archiveSha).Replace("__HSUM__", $sumSha)
  $run = Invoke-Tool $ssh ($sshOpts + @("-t", $Target, $deployScript)) -Live
  $rc = $run.Code
  $S.Remote = "exit code ${rc}: $(Get-RemoteMeaning $rc)"
  if ($rc -eq 0) { $S.Files = "$scriptName, $archiveName, $sumName (uploaded and verified on the server)" }

  if ($rc -eq 0) {
    $S.Health = "healthy (status ok, database ok at http://127.0.0.1:$AppPort/api/health on the server)"
    $S.Port = "127.0.0.1:$AppPort on the server (Next.js on 1010 in the container; verified by the server script)"
    if ($SkipPublicCheck) {
      $S.Public = "not checked"
    } else {
      try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $resp = Invoke-WebRequest -Uri "$SiteUrl/api/health" -UseBasicParsing -TimeoutSec 20
        if ($resp.StatusCode -eq 200 -and $resp.Content -match '"status":"ok"') { $S.Public = "answers from this computer (health ok)" }
        else { $S.Public = "answered with HTTP $($resp.StatusCode); check Caddy and Cloudflare" }
      } catch {
        $S.Public = "does not answer yet from this computer (register Caddy and check Cloudflare; manual)"
      }
    }
    Show-Summary 0
    exit 0
  }

  # Failed: say where, and whether the site still answers on the server.
  $S.Stage = Get-StageOfRemote $rc
  if ($rc -eq 3) { $S.Files = "$scriptName, $archiveName, $sumName uploaded, but they did NOT verify on the server; nothing was deployed" }
  elseif ($rc -ne 255) { $S.Files = "$scriptName, $archiveName, $sumName (uploaded and verified on the server)" }
  Write-Host ""
  Write-Info "Checking whether the site still answers on the server (OpenSSH may ask for your password again)..."
  $h = Invoke-Tool $ssh ($sshOpts + @("-T", $Target, "curl -s -o /dev/null -w 'HTTP=%{http_code}' --max-time 10 http://127.0.0.1:1010/api/health; echo"))
  if ($h.Out -match 'HTTP=200') { $S.Health = "the site answers on the server (HTTP 200): the previous version is serving" }
  elseif ($h.Code -eq 255) { $S.Health = "unknown (no SSH connection for the check)" }
  elseif ($h.Out -match 'HTTP=(\d{3})' -and $Matches[1] -ne "000") { $S.Health = "NOT healthy (HTTP $($Matches[1]) from /api/health on the server)" }
  else { $S.Health = "NOT answering on 127.0.0.1:$AppPort on the server" }
  $S.Port = if ($h.Out -match 'HTTP=200') { "127.0.0.1:$AppPort answers on the server" } else { "127.0.0.1:$AppPort does not answer on the server" }
  $S.Public = "not checked (the deployment failed)"
  Write-Host ""
  Write-Host "      FAILED: $($S.Remote)" -ForegroundColor Red
  if ($rc -ge 10 -and $rc -le 20) { Write-Info "The server script's own report and log path are shown above; fix the problem it names, then run .\deploy-twigo.ps1 again." }
  if ($rc -eq 255) { Write-Info "If the connection dropped, the server script stops and puts the previous version back; its log is in $RemoteDir/logs/." }
  Show-Summary $rc
  exit $rc
} catch {
  $S.Stage = "launcher error"
  Write-Host ""
  Write-Host "      UNEXPECTED ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Show-Summary 1
  exit 1
}
