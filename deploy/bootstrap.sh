#!/usr/bin/env bash
# Taotus VPS bootstrap — Ubuntu 24.04, run once as root. Safe to re-run.
#
#   curl -fsSL https://raw.githubusercontent.com/francoshino/Taotus/main/deploy/bootstrap.sh -o /tmp/b.sh && bash /tmp/b.sh
#
# What it does: swap, admin user + SSH key, SSH hardening, firewall, fail2ban,
# auto security updates, nginx serving the site from git, Let's Encrypt TLS,
# PocketBase (RFQ submissions + email notification) and nightly DB backups.
#
# Overrides (environment): DOMAIN, REPO_URL, BRANCH, ADMIN_USER, LE_EMAIL, PUBKEY,
#                          PB_VERSION, RFQ_NOTIFY_TO
set -euo pipefail

DOMAIN="${DOMAIN:-taotus.com}"
REPO_URL="${REPO_URL:-https://github.com/francoshino/Taotus.git}"
BRANCH="${BRANCH:-main}"
ADMIN_USER="${ADMIN_USER:-deploy}"
LE_EMAIL="${LE_EMAIL:-}"
PUBKEY="${PUBKEY:-ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIN5ZF//DUl48oKzGjXy7E4YCcipO8KrvY4W9EvToIsZJ taotus-deploy}"

PB_VERSION="${PB_VERSION:-0.40.5}"
RFQ_NOTIFY_TO="${RFQ_NOTIFY_TO:-info@taotus.com}"

SRC_DIR=/opt/taotus
WEB_ROOT=/var/www/taotus
PB_DIR=/opt/pocketbase
PB_DATA=/var/lib/pocketbase
BACKUP_DIR=/var/backups/taotus

log() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\n\033[1;33m!! %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mxx %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root."
. /etc/os-release
[ "${ID:-}" = ubuntu ] || die "This script targets Ubuntu."
case "$REPO_URL" in *CHANGE_ME*) die "Set REPO_URL (or edit it in this script).";; esac
case "$PUBKEY" in ssh-*) ;; *) die "PUBKEY doesn't look like an SSH public key.";; esac

export DEBIAN_FRONTEND=noninteractive

# --- Swap (512 MB RAM is tight for apt/certbot) ------------------------------
if ! swapon --show | grep -q .; then
  log "Creating 1 GB swap file"
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# --- Packages ----------------------------------------------------------------
log "Installing packages"
apt-get update -qq
apt-get install -y -qq nginx ufw fail2ban unattended-upgrades certbot python3-certbot-nginx git rsync curl sqlite3 unzip </dev/null

# --- Admin user + key --------------------------------------------------------
log "Setting up user '$ADMIN_USER'"
id "$ADMIN_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$ADMIN_USER"
usermod -aG sudo "$ADMIN_USER"
echo "$ADMIN_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$ADMIN_USER"
chmod 440 "/etc/sudoers.d/90-$ADMIN_USER"
visudo -cf "/etc/sudoers.d/90-$ADMIN_USER" >/dev/null || die "sudoers check failed"

install -d -m 700 -o "$ADMIN_USER" -g "$ADMIN_USER" "/home/$ADMIN_USER/.ssh"
AK="/home/$ADMIN_USER/.ssh/authorized_keys"
touch "$AK"
grep -qxF "$PUBKEY" "$AK" || echo "$PUBKEY" >> "$AK"
chown "$ADMIN_USER:$ADMIN_USER" "$AK"
chmod 600 "$AK"

# --- SSH hardening (only once the key is definitely in place) ----------------
[ -s "$AK" ] || die "authorized_keys is empty; refusing to disable password login."
log "Hardening SSH (no root login, no passwords)"
cat > /etc/ssh/sshd_config.d/10-taotus.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
sshd -t || die "sshd config invalid; not reloading."
systemctl reload ssh

# --- Firewall + fail2ban + auto updates --------------------------------------
log "Firewall, fail2ban, unattended upgrades"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

cat > /etc/fail2ban/jail.d/taotus.local <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
bantime = 1h
EOF
systemctl enable --now fail2ban >/dev/null 2>&1
systemctl restart fail2ban

cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

# --- Site: clone, publish, update command ------------------------------------
log "Publishing the site from $REPO_URL"
cat > /usr/local/bin/taotus-update <<EOF
#!/usr/bin/env bash
# Pull the latest site and publish only the public files.
set -euo pipefail
OLD=""
if [ -d "$SRC_DIR/.git" ]; then
  OLD="\$(git -C "$SRC_DIR" rev-parse HEAD)"
  git -C "$SRC_DIR" fetch --quiet origin "$BRANCH"
  git -C "$SRC_DIR" reset --quiet --hard "origin/$BRANCH"
else
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$SRC_DIR"
fi
install -d "$WEB_ROOT"
rsync -a --delete \\
  --include='index.html' --include='styles.css' --include='app.js' --include='favicon.svg' \\
  --include='robots.txt' --include='sitemap.xml' --include='terms.html' \\
  --include='assets/' --include='assets/*' \\
  --exclude='*' "$SRC_DIR/" "$WEB_ROOT/"
NEW="\$(git -C "$SRC_DIR" rev-parse HEAD)"
# Restart PocketBase only when its hooks or migrations changed.
if [ -n "\$OLD" ] && [ "\$OLD" != "\$NEW" ] && ! git -C "$SRC_DIR" diff --quiet "\$OLD" "\$NEW" -- pocketbase; then
  systemctl restart pocketbase 2>/dev/null || true
fi
echo "Published \$(git -C "$SRC_DIR" log -1 --format='%h %s')"
EOF
chmod +x /usr/local/bin/taotus-update
/usr/local/bin/taotus-update

# --- PocketBase: RFQ submissions ---------------------------------------------
log "Setting up PocketBase $PB_VERSION"
[ "$(uname -m)" = x86_64 ] || die "PocketBase install here assumes x86_64."
if [ "$("$PB_DIR/pocketbase" --version 2>/dev/null | awk '{print $3}')" != "$PB_VERSION" ]; then
  tmp="$(mktemp -d)"
  base="https://github.com/pocketbase/pocketbase/releases/download/v$PB_VERSION"
  zip="pocketbase_${PB_VERSION}_linux_amd64.zip"
  curl -fsSL "$base/$zip" -o "$tmp/$zip"
  curl -fsSL "$base/checksums.txt" -o "$tmp/checksums.txt"
  (cd "$tmp" && grep " $zip\$" checksums.txt | sha256sum -c -) || die "PocketBase checksum mismatch."
  install -d "$PB_DIR"
  unzip -qo "$tmp/$zip" pocketbase -d "$PB_DIR"
  chmod 755 "$PB_DIR/pocketbase"
  rm -rf "$tmp"
fi

id pocketbase >/dev/null 2>&1 || adduser --system --group --no-create-home --home "$PB_DATA" pocketbase
install -d -m 750 -o pocketbase -g pocketbase "$PB_DATA"

cat > /etc/systemd/system/pocketbase.service <<EOF
[Unit]
Description=PocketBase (Taotus RFQ)
After=network.target

[Service]
User=pocketbase
Group=pocketbase
Environment=RFQ_NOTIFY_TO=$RFQ_NOTIFY_TO
Environment=GOMEMLIMIT=150MiB
ExecStart=$PB_DIR/pocketbase serve --http=127.0.0.1:8090 --dir=$PB_DATA --hooksDir=$SRC_DIR/pocketbase/pb_hooks --migrationsDir=$SRC_DIR/pocketbase/pb_migrations
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$PB_DATA

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable pocketbase >/dev/null 2>&1
systemctl restart pocketbase

# Nightly SQLite backup, 14 days kept (on this server; copy off-box for real safety).
install -d -m 700 "$BACKUP_DIR"
cat > /usr/local/bin/taotus-backup <<EOF
#!/usr/bin/env bash
set -euo pipefail
out="$BACKUP_DIR/data-\$(date +%F).db"
sqlite3 "$PB_DATA/data.db" ".backup '\$out'"
gzip -f "\$out"
find "$BACKUP_DIR" -name 'data-*.db.gz' -mtime +14 -delete
EOF
chmod +x /usr/local/bin/taotus-backup
echo '15 3 * * * root /usr/local/bin/taotus-backup' > /etc/cron.d/taotus-backup

# --- nginx -------------------------------------------------------------------
log "Configuring nginx for $DOMAIN"
cat > /etc/nginx/conf.d/taotus-ratelimit.conf <<'EOF'
limit_req_zone $binary_remote_addr zone=rfq:10m rate=6r/m;
limit_req_status 429;
EOF
rm -f /etc/nginx/sites-enabled/default
cat > /etc/nginx/sites-available/taotus <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

    root $WEB_ROOT;
    index index.html;
    server_tokens off;

    gzip on;
    gzip_types text/css application/javascript image/svg+xml;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location / {
        try_files \$uri \$uri/ =404;
    }

    # The only public door to PocketBase: creating an RFQ. Admin UI and the rest
    # of its API stay on localhost (reach them through an SSH tunnel).
    location = /api/rfq {
        limit_except POST { deny all; }
        limit_req zone=rfq burst=3 nodelay;
        client_max_body_size 32k;
        proxy_pass http://127.0.0.1:8090/api/collections/rfq/records;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location ~* \.(css|js|svg)\$ {
        expires 1h;
        add_header Cache-Control "public";
        add_header X-Content-Type-Options nosniff always;
    }
}
EOF
ln -sf /etc/nginx/sites-available/taotus /etc/nginx/sites-enabled/taotus
nginx -t
systemctl enable --now nginx >/dev/null 2>&1
systemctl reload nginx

# --- TLS (only if DNS already points here) -----------------------------------
SERVER_IP="$(curl -4fsS https://api.ipify.org || true)"
DNS_IP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)"
if [ -n "$SERVER_IP" ] && [ "$SERVER_IP" = "$DNS_IP" ]; then
  log "Requesting Let's Encrypt certificate"
  if [ -n "$LE_EMAIL" ]; then EMAIL_ARGS=(-m "$LE_EMAIL"); else EMAIL_ARGS=(--register-unsafely-without-email); fi
  DOMAINS=(-d "$DOMAIN")
  [ "$(getent ahostsv4 "www.$DOMAIN" | awk 'NR==1{print $1}')" = "$SERVER_IP" ] && DOMAINS+=(-d "www.$DOMAIN")
  certbot --nginx --non-interactive --agree-tos --redirect "${EMAIL_ARGS[@]}" "${DOMAINS[@]}"
else
  warn "DNS for $DOMAIN is '${DNS_IP:-unresolved}', this server is '${SERVER_IP:-unknown}'. Skipping TLS."
  warn "Point the A record at this server, then re-run this script."
fi

log "Done."
cat <<EOF

  Log in:   ssh $ADMIN_USER@${SERVER_IP:-<server-ip>}
  Update:   sudo taotus-update
  Admin UI: ssh -L 8090:localhost:8090 $ADMIN_USER@${SERVER_IP:-<server-ip>}  then  http://localhost:8090/_/
  1st time: sudo -u pocketbase $PB_DIR/pocketbase superuser upsert EMAIL PASSWORD --dir $PB_DATA
            then in the admin UI: Settings > Mail > set the SMTP password for info@taotus.com
  Backups:  $BACKUP_DIR (nightly, 14 days)
  Root SSH and password login are now disabled.
EOF
