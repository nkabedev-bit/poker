#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 server for the club: updates, a deploy user,
# key-only SSH, firewall, fail2ban, swap and Docker. Safe to run again.
#
#   ssh root@<server> 'bash -s' < deploy/server/bootstrap.sh
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

DEPLOY_USER=deploy
SWAP_SIZE=4G

echo "== packages"
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl git jq ufw fail2ban unattended-upgrades

echo "== deploy user (sudo without password, same SSH keys as root)"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/$DEPLOY_USER"
chmod 440 "/etc/sudoers.d/$DEPLOY_USER"

echo "== ssh: keys only"
# Files in sshd_config.d are read in name order and the first value wins, so 00- beats
# cloud-init's 50-cloud-init.conf, which turns password login on.
cat > /etc/ssh/sshd_config.d/00-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
# Ubuntu 24.04 starts sshd from a socket, so its runtime directory may not exist yet.
install -d -m 755 /run/sshd
sshd -t
systemctl reload-or-restart ssh

echo "== firewall: ssh, http, https"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "== fail2ban"
systemctl enable --now fail2ban

echo "== system journal: three days of logs (the app and Caddy log into it)"
# Retention deletes a whole file once its oldest entry is past three days. One file a
# day keeps the last days; left at a month per file, everything went at once.
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nMaxRetentionSec=3day\nMaxFileSec=1day\nSystemMaxUse=1G\n' > /etc/systemd/journald.conf.d/club-logs.conf
systemctl restart systemd-journald

echo "== swap $SWAP_SIZE"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l "$SWAP_SIZE" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
sysctl -q --system

echo "== docker (official repository)"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
# Container logs are capped, or a chatty container fills the disk.
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
systemctl restart docker
usermod -aG docker "$DEPLOY_USER"

echo "== done"
docker --version
docker compose version
ufw status | head -1
swapon --show
