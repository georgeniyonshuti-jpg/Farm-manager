# Deploying Cleva Farm Manager

Production runs on the Hetzner server `erp-prod-01` (178.105.103.228) as two Docker containers from `~/gitops/clevafarm.yaml`:

| Container | Serves |
|---|---|
| `clevafarm-farm-web-1` (image `cleva-farm-web`) | farm.cleva.rw, market.cleva.rw |
| `clevafarm-farm-api-1` (image `cleva-farm-api`) | farmapi.cleva.rw |
| `clevafarm-farm-postgres-1` | the farm database (never restarted by a deploy) |

Deploys go through GitHub only. Do not build or copy code to the server from Cursor or a laptop.

## Everyday use

**Tests.** Every push to `main` runs the server tests, web tests and typecheck (GitHub > Actions > Tests). A red X means do not deploy that commit.

**Deploy.** GitHub > Actions > **Deploy** > Run workflow. Leave `main`, or type a branch, tag or commit. It:

1. runs the tests again for that exact commit, and stops if any fail;
2. builds both images on GitHub's machine, not on the server;
3. checks the server's Docker disk has at least 6 GB free, and stops if not;
4. uploads that commit to `~/apps/farm-manager/releases/<commit>` and streams the images into Docker on the server;
5. backs up the farm database to `~/backups/farm/` (the last 5 are kept);
6. keeps the running images as `:previous`;
7. restarts only farm-api and farm-web on the new images;
8. waits until both are healthy and farmapi.cleva.rw/health, farm.cleva.rw and market.cleva.rw answer;
9. if they do not, puts `:previous` back by itself and the run shows red.

A deploy takes about 10 minutes.

**Rollback.** GitHub > Actions > **Rollback** > Run workflow with `previous`, or with the first 12 characters of an earlier deployed commit (the last 5 are kept). This puts the old code back. It does **not** undo database changes.

**What is live?** On the server, `cat ~/apps/farm-manager/current`. Every deploy and rollback is listed in `~/apps/farm-manager/deploys.log`.

## Database migrations

The API applies every new file in `database/migrations/` when it starts, and records it by file name in `schema_migrations`. So **deploying a commit with a new migration runs that migration in production**. Because of that:

- Never rename a migration that production has already run. It would run again under the new name.
- Write migrations so they are safe to run twice (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
- A migration that changes or deletes existing data needs a person to read it before the deploy. The deploy takes a backup first, but restoring it is manual.

Restoring a backup is a manual, careful job. Stop farm-api first, then `pg_restore --clean` the chosen file into `clevafarm-farm-postgres-1`. Ask before doing it.

## One-time setup

You do these steps once. They need your GitHub and server access.

### 1. Make a key that only GitHub uses

On your Mac:

```bash
ssh-keygen -t ed25519 -N "" -C "github-actions-farm-deploy" -f ~/.ssh/cleva_farm_deploy
```

### 2. Let that key into the server

```bash
ssh-copy-id -i ~/.ssh/cleva_farm_deploy.pub deploy@178.105.103.228
```

### 3. Add four secrets to GitHub

GitHub > the Farm-manager repo > Settings > Secrets and variables > Actions > New repository secret:

| Name | Value |
|---|---|
| `DEPLOY_HOST` | `178.105.103.228` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | the whole content of `~/.ssh/cleva_farm_deploy` (the file **without** `.pub`) |
| `DEPLOY_KNOWN_HOSTS` | the output of the command below |

```bash
ssh-keyscan -t ed25519 178.105.103.228
```

The server's key fingerprint is `SHA256:j2Nua58nkwtm5BGEHdbSBsGrroWn6PC5Hz4yX99D4js`. If `ssh-keyscan` prints a different one, stop and ask before going on.

Or with the GitHub CLI, from the repo folder:

```bash
gh secret set DEPLOY_HOST --body 178.105.103.228
```

```bash
gh secret set DEPLOY_USER --body deploy
```

```bash
gh secret set DEPLOY_SSH_KEY < ~/.ssh/cleva_farm_deploy
```

```bash
ssh-keyscan -t ed25519 178.105.103.228 | gh secret set DEPLOY_KNOWN_HOSTS
```

### 4. Optional: a second person approves each deploy

Settings > Environments > `production` (created by the first deploy run) > Required reviewers.

### 5. Stop the old ways

- Do not deploy from Cursor any more. `.cursor/rules/deploy.mdc` tells Cursor the same.
- Do not run `production/scripts/deploy-clevafarm-stack.sh` from the ERPNext repo. Unless `SKIP_DB_MIGRATE=1` is set, it re-imports the database from Supabase and would replace production data.
- The old copy in `~/Farm-manager-Legacy` on the server is no longer used once GitHub deploys work. Leave it until the first deploy has run well, then remove it.

## Later

- **Staging.** A second copy (for example staging.market.cleva.rw with its own database) that GitHub deploys first, so changes are clicked through before production.
- **Disk.** Docker's disk on the server (`/mnt/HC_Volume_106255492`, 49 GB) is shared by every stack. On 4 Nov 2026 the first deploy built images on the server, the disk filled, and the farm and ERPNext databases stopped until the build cache was cleared. Images are now built on GitHub and the deploy refuses to run below 6 GB free. Old `cleva-farm-*:before-*` images from the Cursor deploys can be removed once the GitHub deploys have run well, or the volume can be made larger in the Hetzner console.
- **Secrets file.** `~/gitops/clevafarm.yaml` holds passwords inline and other users in its group can read it (`rw-rw-r--`). Run `chmod 600 ~/gitops/clevafarm.yaml`, or move the values into `clevafarm.env`, which is already private.
