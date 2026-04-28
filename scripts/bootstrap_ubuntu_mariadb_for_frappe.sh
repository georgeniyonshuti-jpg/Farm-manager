#!/usr/bin/env bash
# Run once on the host with sudo, after reviewing:
#   sudo env MDB_ROOT_PASS='your-password' bash scripts/bootstrap_ubuntu_mariadb_for_frappe.sh
# Or:  sudo -E ./scripts/bootstrap_ubuntu_mariadb_for_frappe.sh  (MDB_ROOT_PASS in environment)
set -euo pipefail

if [ "${1:-}" != "doit" ] || [ "$(id -u)" -ne 0 ]; then
	echo "Run as: sudo MDB_ROOT_PASS='...' $0 doit"
	exit 1
fi

: "${MDB_ROOT_PASS:?Set MDB_ROOT_PASS to the desired MariaDB root password}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
	redis-server redis-tools \
	python3-venv python3-dev python3-setuptools \
	libffi-dev libssl-dev pkg-config \
	libmariadb-dev libmariadb-dev-compat \
	xvfb wkhtmltopdf

FCONF="/etc/mysql/mariadb.conf.d/99-frappe.cnf"
if [ ! -f "$FCONF" ]; then
	cat >"$FCONF" <<'EOF'
[mysqld]
character-set-client-handshake = FALSE
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci

[mysql]
default-character-set = utf8mb4
EOF
fi

# Set root to password auth (works with bench new-site --mariadb-root-password)
mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '${MDB_ROOT_PASS}'; FLUSH PRIVILEGES;"

systemctl restart mariadb
systemctl enable --now redis-server
redis-cli ping

mysql -uroot -p"${MDB_ROOT_PASS}" -e "SHOW VARIABLES LIKE 'character_set_server';" | grep -E utf8mb4

HOSTS_LINE="127.0.0.1 dev.local"
if ! grep -qF "dev.local" /etc/hosts 2>/dev/null; then
	echo "$HOSTS_LINE" >>/etc/hosts
fi

echo "OK: MariaDB, Redis, hosts. Next: run bench (see repo README or your bring-up plan)."
