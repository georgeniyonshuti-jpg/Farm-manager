# Local bench (Frappe v15) after MariaDB is ready

This project lives next to a standard bench at `~/frappe-bench` with `frappe`, `erpnext` (from https://github.com/frappe/erpnext `version-15`), and this app in `apps/farm_manager`.

## 1) One-time host setup (requires sudo; run in your own terminal)

Set MariaDB `root` password, Frappe `utf8mb4`, and `dev.local` in hosts:

```bash
cd "/home/george/Documents/Dev projects/farm_manager"
sudo MDB_ROOT_PASS='YOUR_MARIADB_ROOT_PASSWORD' \
  ./scripts/bootstrap_ubuntu_mariadb_for_frappe.sh doit
```

If you use the password you chose for the bench, the next script can connect.

## 2) Create site, install apps, migrate

```bash
export PATH="$HOME/.local/bin:$PATH"
export DB_ROOT='YOUR_MARIADB_ROOT_PASSWORD'
export ADMIN_PASS='a-strong-admin-password'
cd "$HOME/frappe-bench"
bench new-site dev.local --admin-password "$ADMIN_PASS" --mariadb-root-password "$DB_ROOT"
bench --site dev.local install-app erpnext
bench --site dev.local install-app farm_manager
bench --site dev.local migrate
bench use dev.local
```

## 3) Run

In one terminal:

```bash
export PATH="$HOME/.local/bin:$PATH"
cd "$HOME/frappe-bench"
bench use dev.local
bench start
```

Open `http://dev.local:8000` and log in as `Administrator` / `$ADMIN_PASS`.

## Notes

- `sites/apps.txt` must list `frappe`, `erpnext`, and `farm_manager` (Frappe v15 `esbuild` reads this list to resolve `public` paths). If you init a new bench, append `farm_manager` after adding the app to `apps/`.
- The bench `sites/common_site_config.json` on this machine was pointed at non-default Redis ports; for the stock `redis-server` on `6379`, set `redis_cache`, `redis_queue`, and `redis_socketio` to `redis://127.0.0.1:6379`.
- Port **3306** may conflict with OnlyOffice: `sudo snap stop onlyoffice-ds.mysql` while developing, or use Docker for the DB instead of host MariaDB.
