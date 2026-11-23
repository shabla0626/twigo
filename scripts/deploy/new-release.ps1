<#
  Builds a Twigo release for .\deploy-twigo.ps1 from a git tag (committed files only, so no local
  secret, database or upload can be in it):

    release\<tag>.tar.gz            git archive of the tag (line endings as stored in git: LF)
    release\<tag>.tar.gz.sha256     its checksum, in the format deploy-twigo.sh checks
    release\deploy-twigo.sh         the deployment script taken from the same tag
    release\release-manifest.json   names exactly these three files with their SHA-256; written last

  Usage (in the project folder):
    git tag twigo-rc5-2026-12-01
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy\new-release.ps1 -Tag twigo-rc5-2026-12-01

  Without -Tag, the twigo-* tag on the current commit is used. The finished release is checked with
  .\deploy-twigo.ps1 -CheckOnly (the same checks the launcher makes before it connects).
  -Ref <commit> -Version <name> and -OutDir are for the isolated tests (scripts\deploy\test-launcher.ps1).
#>
[CmdletBinding()]
param(
  [string]$Tag = "",
  [string]$Ref = "",
  [string]$Version = "",
  [string]$OutDir = ""
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Launcher = Join-Path $Root "deploy-twigo.ps1"
$Tar = Join-Path $env:SystemRoot "System32\tar.exe"
$Utf8 = New-Object System.Text.UTF8Encoding $false

function Stop-Release([string]$Message) {
  Write-Host ""
  Write-Host "NEW RELEASE FAILED: $Message" -ForegroundColor Red
  exit 2
}

# Quotes one argument the way Windows programs (MSVC runtime) split their command line.
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

function Invoke-Tool([string]$File, [string[]]$Arguments, [string]$WorkDir = "") {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $File
  $psi.Arguments = ConvertTo-ArgString $Arguments
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.StandardOutputEncoding = $Utf8
  $psi.StandardErrorEncoding = $Utf8
  if ($WorkDir) { $psi.WorkingDirectory = $WorkDir }
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  [void]$p.Start()
  $o = $p.StandardOutput.ReadToEndAsync()
  $e = $p.StandardError.ReadToEndAsync()
  $p.WaitForExit()
  return [pscustomobject]@{ Code = $p.ExitCode; Out = $o.Result; Err = $e.Result }
}

function Get-Sha256([string]$Path) { (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant() }

$gitCmd = Get-Command git.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $gitCmd) { Stop-Release "git is not installed or not on PATH." }
$Git = $gitCmd.Source
if (-not (Test-Path -LiteralPath $Tar)) { Stop-Release "tar.exe is missing ($Tar)." }
if (-not (Test-Path -LiteralPath $Launcher)) { Stop-Release "deploy-twigo.ps1 is missing in $Root." }
function Invoke-Git([string[]]$GitArgs) {
  $r = Invoke-Tool $Git (@("-C", $Root) + $GitArgs)
  if ($r.Code -ne 0) { Stop-Release ("git " + ($GitArgs -join ' ') + " failed: " + $r.Err.Trim()) }
  return $r.Out.Trim()
}

# ---------------------------------------------------------------- which commit, which name
if ($Tag) {
  $check = Invoke-Tool $Git @("-C", $Root, "rev-parse", "--verify", "--quiet", "refs/tags/$Tag^{commit}")
  if ($check.Code -ne 0) { Stop-Release "The tag $Tag does not exist. Create it first: git tag $Tag" }
  $Commit = $check.Out.Trim()
  if (-not $Version) { $Version = $Tag }
} elseif ($Ref) {
  $check = Invoke-Tool $Git @("-C", $Root, "rev-parse", "--verify", "--quiet", "$Ref^{commit}")
  if ($check.Code -ne 0) { Stop-Release "$Ref is not a commit." }
  $Commit = $check.Out.Trim()
  if (-not $Version) { Stop-Release "-Ref needs -Version (the release name, for example twigo-test-1)." }
} else {
  $tags = @((Invoke-Git @("tag", "--points-at", "HEAD", "--list", "twigo-*", "--sort=-creatordate")) -split "`n" | Where-Object { $_.Trim() })
  if ($tags.Count -eq 0) {
    Stop-Release "The current commit has no twigo-* tag. Tag it first, for example: git tag twigo-rc5-$(Get-Date -Format yyyy-MM-dd)   then run this again (or pass -Tag)."
  }
  $Tag = $tags[0].Trim()
  $Version = $Tag
  $Commit = Invoke-Git @("rev-parse", "HEAD^{commit}")
}
if ($Version -notmatch '^twigo-[A-Za-z0-9][A-Za-z0-9._-]{0,80}$') {
  Stop-Release "The release name '$Version' must start with twigo- and use only letters, digits, '.', '_' and '-'."
}
$CommitDate = Invoke-Git @("show", "-s", "--format=%cI", $Commit)
$Subject = Invoke-Git @("show", "-s", "--format=%s", $Commit)

if (-not $OutDir) { $OutDir = Join-Path $Root "release" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$OutDir = (Resolve-Path -LiteralPath $OutDir).Path
$ArchiveName = "$Version.tar.gz"

Write-Host "Building release $Version from commit $($Commit.Substring(0, 12)) ($Subject)"

# ---------------------------------------------------------------- build everything in a staging folder
$Staging = Join-Path $OutDir (".staging-" + $Version + "-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Path $Staging | Out-Null
try {
  $archivePath = Join-Path $Staging $ArchiveName
  # core.autocrlf=false: the archive gets the files exactly as stored in git (LF), on any computer.
  $r = Invoke-Tool $Git @("-C", $Root, "-c", "core.autocrlf=false", "archive", "--format=tar.gz", "-o", $archivePath, $Commit)
  if ($r.Code -ne 0) { Stop-Release ("git archive failed: " + $r.Err.Trim()) }

  # The deployment script of the same commit, taken out of the archive itself.
  $x = Join-Path $Staging "x"
  New-Item -ItemType Directory -Path $x | Out-Null
  $r = Invoke-Tool $Tar @("-xzf", $archivePath, "-C", $x, "scripts/deploy/deploy-twigo.sh")
  $inner = Join-Path $x "scripts\deploy\deploy-twigo.sh"
  if ($r.Code -ne 0 -or -not (Test-Path -LiteralPath $inner)) { Stop-Release "The commit has no scripts/deploy/deploy-twigo.sh." }
  Copy-Item -LiteralPath $inner -Destination (Join-Path $Staging "deploy-twigo.sh")
  Remove-Item -LiteralPath $x -Recurse -Force

  $archiveHash = Get-Sha256 $archivePath
  $archiveBytes = (Get-Item -LiteralPath $archivePath).Length
  $sumName = "$ArchiveName.sha256"
  [System.IO.File]::WriteAllText((Join-Path $Staging $sumName), "$archiveHash  $ArchiveName`n", $Utf8)

  $manifest = [ordered]@{
    format       = "twigo-release-manifest/1"
    version      = $Version
    gitTag       = $(if ($Tag) { $Tag } else { "" })
    gitCommit    = $Commit
    commitDate   = $CommitDate
    createdAt    = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    archive      = [ordered]@{ file = $ArchiveName; sha256 = $archiveHash; bytes = $archiveBytes }
    checksumFile = [ordered]@{ file = $sumName; sha256 = (Get-Sha256 (Join-Path $Staging $sumName)) }
    deployScript = [ordered]@{ file = "deploy-twigo.sh"; sha256 = (Get-Sha256 (Join-Path $Staging "deploy-twigo.sh")); pathInArchive = "scripts/deploy/deploy-twigo.sh" }
  }
  $json = ($manifest | ConvertTo-Json -Depth 4) -replace "`r`n", "`n"
  [System.IO.File]::WriteAllText((Join-Path $Staging "release-manifest.json"), $json + "`n", $Utf8)

  # Same checks as before an upload (the commit may be older than this folder: that is checked at deployment).
  Write-Host "Checking the release with deploy-twigo.ps1 -CheckOnly..."
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Launcher -CheckOnly -ReleaseDir $Staging -AllowOlderRelease
  if ($LASTEXITCODE -ne 0) { Stop-Release "The new release did not pass the launcher's checks (see above). Nothing was replaced in $OutDir." }

  # Into place; the manifest last, so it never names files that are not there yet.
  foreach ($f in @($ArchiveName, $sumName, "deploy-twigo.sh")) {
    Move-Item -LiteralPath (Join-Path $Staging $f) -Destination (Join-Path $OutDir $f) -Force
  }
  Move-Item -LiteralPath (Join-Path $Staging "release-manifest.json") -Destination (Join-Path $OutDir "release-manifest.json") -Force
} finally {
  if (Test-Path -LiteralPath $Staging) { Remove-Item -LiteralPath $Staging -Recurse -Force -ErrorAction SilentlyContinue }
}

Write-Host ""
Write-Host "RELEASE READY: $Version" -ForegroundColor Green
Write-Host ("  {0}  {1:N1} MB  sha256 {2}" -f $ArchiveName, ($archiveBytes / 1MB), $archiveHash)
Write-Host "  $sumName"
Write-Host "  deploy-twigo.sh (from the same commit)"
Write-Host "  release-manifest.json  (in $OutDir)"
Write-Host "Deploy it with:  .\deploy-twigo.ps1"
exit 0
