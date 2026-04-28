# Deployment Guide

This document explains how to ship `farm_manager` (ERPNext + Farm Manager custom app) to production.

## Architecture

A working ERPNext deployment requires:

| Service           | Purpose                              | Process                                  |
|-------------------|--------------------------------------|------------------------------------------|
| Web (gunicorn)    | HTTP API + Desk                      | `bench start` / `bench serve`            |
| Queue Default     | Async jobs                           | `bench worker --queue default`           |
| Queue Long        | Long jobs (PDF, reports)             | `bench worker --queue long`              |
| Queue Short       | Quick jobs (emails, notifications)   | `bench worker --queue short`             |
| Scheduler         | Cron / scheduled events              | `bench schedule`                         |
| Socket.IO         | Realtime UI                          | `node apps/frappe/socketio.js`           |
| MariaDB 10.6+     | Database (NOT Postgres)              | Managed or self-hosted                   |
| Redis (cache)     | Cache                                | Managed or self-hosted                   |
| Redis (queue)     | Job queue (RQ)                       | Managed or self-hosted                   |
| Redis (socketio)  | Pub/Sub for realtime                 | Managed or self-hosted                   |
| NGINX             | Reverse proxy + TLS + assets         | Optional in Docker                       |

## Option A: Docker Compose on a VPS

Cheapest path; one VM (4 vCPU / 8 GB RAM minimum) plus disk:

```bash
cd deploy/docker
cp .env.example .env  # set DB_ROOT_PASSWORD, SITE_NAME, ADMIN_PASSWORD
docker compose up -d

# First-time site bootstrap (run once):
docker compose exec backend bench new-site $SITE_NAME --admin-password $ADMIN_PASSWORD --mariadb-root-password $DB_ROOT_PASSWORD
docker compose exec backend bench --site $SITE_NAME install-app erpnext
docker compose exec backend bench --site $SITE_NAME install-app farm_manager
docker compose exec backend bench --site $SITE_NAME migrate
```

## Option B: Render Blueprint

Push this repo, then in Render:
1. New > Blueprint > select `deploy/render/render.yaml`.
2. Set `ADMIN_PASSWORD` secret env var on the `erpnext-web` service.
3. Wait for first-deploy migration.
4. Add a custom domain; Render handles TLS.

Estimated cost (April 2026 Render pricing):
- web (Standard): ~$25/mo
- 3 workers (Starter+Standard mix): ~$40/mo
- scheduler (Starter): ~$7/mo
- socketio (Starter): ~$7/mo
- MariaDB Starter: ~$25/mo (10 GB)
- 3x Redis Starter: ~$30/mo
- **Total: ~$130-160/mo** for a small/medium farm operation.

## Domain & TLS

- Point an A or CNAME record (e.g. `erp.<yourdomain>`) at the Render web service or VPS IP.
- Run `bench setup add-domain` to register the domain inside Frappe.
- For VPS use certbot or Caddy in front of NGINX.

## Backups

- **MariaDB**: schedule `bench --site $SITE backup` daily; configure `bench setup s3` to push backups to S3-compatible storage.
- **Files**: `bench --site $SITE backup --with-files` weekly.
- Test restore quarterly: `bench --site $SITE restore <db.sql.gz> --with-files`.

## Monitoring

- Frappe ships `/api/method/ping` health check; Render uses it via `healthCheckPath`.
- Use Logtail / Better Stack / Render's built-in logs for tailing.
- Add a Frappe `Email Notification` on `Mortality Event` `flagged_high_mortality` for ops alerts.

## Smoke Tests After Deploy

1. Login as Administrator.
2. Open the **Farm Manager** workspace.
3. Create a `Farm`, then a `Flock` - verify Project / Cost Center / Warehouse auto-created.
4. Submit a `Flock Daily Log` with feed_intake_kg > 0 - verify a `Stock Entry (Material Issue)` appears.
5. Run the `Flock Performance` script report.

If all five pass the deploy is healthy.
