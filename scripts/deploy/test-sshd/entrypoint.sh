#!/bin/bash
# Test SSH server: user "shabla" (same uid as the WSL user, member of the Docker socket's group) with
# key-only sign-in on 127.0.0.1:2222, and the same on 127.0.0.1:2223 without SFTP (uploads fail there).
set -euo pipefail
: "${TEST_UID:?}" "${DOCKER_GID:?}" "${TEST_HOME:?}" "${KEYS:?}"
userdel -r ubuntu >/dev/null 2>&1 || true
getent group "$DOCKER_GID" >/dev/null || groupadd -g "$DOCKER_GID" hostdocker
useradd -u "$TEST_UID" -d "$TEST_HOME" -M -s /bin/bash -G "$(getent group "$DOCKER_GID" | cut -d: -f1)" shabla
usermod -p '*' shabla                       # no password, but not a locked account
install -d -m 700 -o shabla -g shabla "$TEST_HOME/.ssh"
install -m 600 -o shabla -g shabla "$KEYS/authorized_keys" "$TEST_HOME/.ssh/authorized_keys"
install -m 600 -o root -g root "$KEYS/ssh_host_ed25519_key" /etc/ssh/test_host_key
ENVLINE="SetEnv TWIGO_COMPOSE_PROJECT=twigolaunchtest TWIGO_ASSUME_NO=1 TWIGO_OWNER_EMAIL=founder@launchtest.dev TWIGO_OWNER_NAME=LaunchTest ADMIN_PASSWORD=$(cat "$KEYS/admin_password")"
for port in 2222 2223; do
  sftp=/usr/lib/openssh/sftp-server; [[ $port == 2223 ]] && sftp=/bin/false
  cat > /etc/ssh/sshd_$port <<CFG
Port $port
ListenAddress 127.0.0.1
HostKey /etc/ssh/test_host_key
PidFile /run/sshd-$port.pid
AuthorizedKeysFile .ssh/authorized_keys
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
UsePAM no
AllowUsers shabla
Subsystem sftp $sftp
$ENVLINE
CFG
  chmod 600 /etc/ssh/sshd_$port
done
/usr/sbin/sshd -t -f /etc/ssh/sshd_2222
/usr/sbin/sshd -D -e -f /etc/ssh/sshd_2223 &
exec /usr/sbin/sshd -D -e -f /etc/ssh/sshd_2222
