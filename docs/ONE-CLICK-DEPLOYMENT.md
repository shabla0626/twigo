# Twigo: one-click deployment from Windows

## 1. How to run

In PowerShell on this computer:

```powershell
cd D:\MyProject\Co_work
.\deploy-twigo.ps1
```

That is the only command. It deploys the release named in `release\release-manifest.json` to
`shabla@162.35.23.106`, folder `/home/shabla/Server`.

If PowerShell says that running scripts is disabled, run it this way instead (this changes no setting):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-twigo.ps1
```

Started from File Explorer (right-click `deploy-twigo.ps1` → Run with PowerShell), the window waits for
Enter at the end, so the result stays readable.

Options (rarely needed):

- `.\deploy-twigo.ps1 -CheckOnly` checks the release on this computer and connects to nothing.
- `.\deploy-twigo.ps1 -AllowOlderRelease` deploys an older release on purpose (to go back to it).

**A new version** needs a new release first. Commit the code, tag it, and build the release:

```powershell
git tag twigo-rc5-2026-12-01
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy\new-release.ps1 -Tag twigo-rc5-2026-12-01
```

This writes `release\<tag>.tar.gz`, its `.sha256`, the `deploy-twigo.sh` of the same commit and the
manifest that names exactly these three files. Then run `.\deploy-twigo.ps1` again. The launcher never
picks an archive by its name or date, and it refuses a release that is older than the committed code in
this folder or than the release already running on the server.

## 2. What happens

The launcher shows four stages.

**[1/4] Checks on this computer.** Nothing is sent if any check fails.

- The manifest, the deploy script, the archive and the `.sha256` file exist.
- Each file matches the SHA-256 recorded in the manifest.
- The archive can be read to the end and has no unsafe paths or links.
- The archive holds no `.env` file (only the examples), no keys, no backups, uploaded files or database.
- The archive holds every file the server needs, including the same `deploy-twigo.sh` as the release folder.
- Windows OpenSSH (`ssh.exe`, `scp.exe`) is available.
- The release version is shown.

**[2/4] SSH connection.** It uses your normal SSH setup: keys, `ssh-agent`, `~/.ssh/config` and
`known_hosts`. OpenSSH verifies the server's host key as usual. If a password or key passphrase is
needed, OpenSSH asks for it. Then it:

- makes sure `/home/shabla/Server` and its upload folder exist and are writable;
- checks that no other deployment is running;
- checks that there is space for the upload;
- shows which release the server runs now.

**[3/4] Upload.** Exactly three files go to `/home/shabla/Server/.twigo-upload/`: `deploy-twigo.sh`,
`<release>.tar.gz` and `<release>.tar.gz.sha256`.

**[4/4] Deployment, with live output.**

1. On the server, all three files are checked again with `sha256sum -c` and moved into
   `/home/shabla/Server/`.
2. The tested server script runs: `bash ~/Server/deploy-twigo.sh`, with that exact archive. Its ten
   steps are described in [ONE-COMMAND-DEPLOYMENT.md](ONE-COMMAND-DEPLOYMENT.md).
3. Its questions reach you as usual: the owner account on the first run, `PUBLISH` for the legal
   documents.
4. After a successful run, `http://127.0.0.1:1010/api/health` must report `status ok` and `db ok`.

The launcher never uploads or changes:

- `.env.production`;
- the PostgreSQL data;
- uploaded files or persistent storage;
- existing backups;
- any secret.

It stores no password or key, and it does not touch Caddy, Cloudflare or the firewall.

## 3. How to read success or failure

The last block is the summary:

```
==================================================================
TWIGO DEPLOYMENT: SUCCESS                (or: FAILED at: <stage>)
==================================================================
Release:            twigo-rc5-2026-11-23 (commit ..., built ...)
Uploaded files:     deploy-twigo.sh, twigo-rc5-2026-11-23.tar.gz, ....sha256 (uploaded and verified on the server)
SSH:                connected to shabla@162.35.23.106 (host key verified by OpenSSH)
Server script:      exit code 0: the deployment succeeded and the health check passed
Application health: healthy (status ok, database ok ...)
Port:               127.0.0.1:1010 on the server ...
Public address:     https://twigo.space - answers from this computer / does not answer yet
Exit code:          0
Remaining manual actions ...
```

**SUCCESS** appears only when the server script finished without an error and the health check after it
passed. "Public address ... does not answer yet" means only that Caddy or Cloudflare is not set up yet
(section 5).

On failure, **FAILED at** names the stage. The server script's own `ERROR:` line, a few lines above the
summary, says what to fix. The launcher ends with the same exit code shown in the summary:

| Exit code | Meaning | What changed |
| --- | --- | --- |
| 0 | deployed, health check passed | new version running |
| 1 | unexpected error in the launcher itself | stops where it was; the summary shows how far it got |
| 2 | release check failed on this computer | nothing sent |
| 3 | upload damaged on the server | nothing deployed |
| 4 | server unreachable | nothing |
| 5 | SSH sign-in refused | nothing |
| 6 | host key unknown or changed | nothing (see section 4) |
| 7 | server folder not usable | nothing |
| 8 | upload failed | nothing deployed |
| 9 | server script finished, but `/api/health` failed right after | new version installed, not healthy |
| 10 | server script stopped before its first step | nothing |
| 11-14 | server step 1-4 failed (checks, archive, settings, backups) | nothing, apart from backups |
| 15-20 | server step 5-10 failed (install, build, database, migrations, owner, start) | previous version put back |
| 30 | another deployment is running on the server | nothing |
| 129, 130, 141, 143 | server script interrupted (connection closed, Ctrl+C, output closed, stopped) | previous version put back |
| 255 | SSH connection lost during the deployment | the server stops and puts the previous version back |

After a failure the server also reports, in the same connection, whether the site still answers there
(the `TWIGO-HEALTH:` line above the summary), so no further password is asked.

`Timeout, server ... not responding` (exit 255) means the server or the network stopped answering for
two minutes. Check your internet connection, and on the server `uptime` and `free -h`; then run again.
If the old run is still going, the launcher says another deployment is running: wait a few minutes.

`close - IO is still pending on closed socket` after the upload is a harmless message of Windows OpenSSH.

Logs on the server:

- deployment logs: `~/Server/logs/twigo-deploy-<date_time>.log` (no secret values);
- backups of each run: `~/Server/backups/twigo/<date_time>/`.

Database migrations are not undone automatically. If a run failed at step 8 or later, see
`docs/DEPLOYMENT.md` section 8 to restore the database backup made in that run.

## 4. SSH sign-in problems

First try the same connection by hand, in the same PowerShell window:

```powershell
ssh shabla@162.35.23.106
```

If that does not work, the launcher cannot work either. Fix it with the advice below.

- **`Permission denied (publickey)`** (exit 5). The server did not accept any of your keys.
  - Check that your key file exists, for example `C:\Users\<you>\.ssh\id_ed25519`.
  - Check that its `.pub` line is in `~/.ssh/authorized_keys` on the server.
  - If the key has another name, add a `Host` entry with `IdentityFile` to `C:\Users\<you>\.ssh\config`.
    The launcher uses that file automatically.
- **Asked for a password three times.** The launcher makes three connections (check, upload,
  deployment) and says before each one that OpenSSH may ask. Nothing is shown while you type; press
  Enter. Never type the password after the `PS>` prompt: PowerShell saves it in its history (if that
  happened, change the password on the server with `passwd`). To stop the questions, use an SSH key:
  `ssh-keygen -t ed25519` (Enter at each question), then once
  `type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh shabla@162.35.23.106 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"`.
- **Asked for a key passphrase several times.** Load the key into `ssh-agent` once:
  `ssh-add $env:USERPROFILE\.ssh\id_ed25519`. If that fails, the `OpenSSH Authentication Agent`
  service must be started first (Windows Services, as administrator). Then nothing is asked.
- **`REMOTE HOST IDENTIFICATION HAS CHANGED` / `Host key verification failed`** (exit 6). Do not work
  around this. If the VPS was reinstalled, compare the new key's fingerprint with the one shown in the
  provider's console. Then remove the old entry with `ssh-keygen -R 162.35.23.106` and connect once by
  hand to accept the new key. If nothing was reinstalled, stop: the connection may be intercepted.
- **First connection ever.** OpenSSH shows the server's key fingerprint and asks `yes/no`. Answer `yes`
  only if it matches the fingerprint in the provider's console.
- **`Connection timed out` / `Connection refused` / `Could not resolve hostname`** (exit 4). Check the
  internet connection and that the VPS is running. Check that the provider's firewall allows SSH (port
  22).
- **`UNPROTECTED PRIVATE KEY FILE`.** Windows OpenSSH refuses a key file that other users can read.
  Remove the other users in the file's Properties → Security.
- **`ssh.exe` not found** (exit 2). Install the OpenSSH Client: Settings → System → Optional features.

## 5. What stays manual

These are not automated on purpose. The summary lists them after every run.

1. **Central Caddy.** Register `twigo.space` with upstream `127.0.0.1:1010` (WebSocket on;
   `www.twigo.space` redirects to `https://twigo.space`). Do not install another Caddy.
2. **Cloudflare.** Confirm that the `twigo.space` DNS record is proxied and that SSL/TLS mode is Full
   (strict).
3. **A real test email through Resend.** Sign in as the owner, then Admin → Email → Check connection →
   Send a test email to me.
4. **Off-server backup copies.** Copy `~/Server/backups/twigo/` and the volume backups somewhere else.
5. **Legal documents.** Type `PUBLISH` only if a lawyer actually reviewed exactly these texts.
   Otherwise they stay "Draft awaiting legal review".
6. **The server's settings file (first time only).** `~/Server/twigo/.env.production` is created and
   filled in on the server, never by the launcher. The server script stops at step 3 and names what is
   missing.
