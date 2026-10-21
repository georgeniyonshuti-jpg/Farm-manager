# Staging CRM install (human runbook)

This folder does not install Frappe. The Cleva app cannot reach your server. Do these steps on a **new** machine, not on the ERPNext server that keeps the books (decision D2 in `docs/crm/MASTER_PLAN.md`).

Anything marked **VERIFY** must be checked against the current Frappe and Meta docs before you run it. Commands change between Frappe versions.

## 1. What you set up yourself

1. Meta business verification, a WhatsApp Business Account, and a developer app. Start this first. It can take days.
2. In staging, use Meta's test number. It only messages numbers you put on the allow-list.
3. A system user and a permanent token. Put the token in the server secret store. Do not paste it into git or chat.
4. A payment method on the WhatsApp account before template messages.
5. DNS and HTTPS for `crm-staging.cleva.rw`.

## 2. Install (VERIFY)

On the staging bench only:

```
bench get-app crm
bench new-site crm-staging.cleva.rw --install-app crm
bench get-app https://github.com/shridarpatil/frappe_whatsapp
bench --site crm-staging.cleva.rw install-app frappe_whatsapp
```

**VERIFY** the app names, branches, and `bench` syntax against current Frappe docs. Pin `frappe_whatsapp` to a commit after you have read it. Do not install this on the production accounting site.

## 3. Webhook (VERIFY)

In the Frappe WhatsApp account screen, set a webhook verify token (a long random string in site config, not in git).

In the Meta app, set the callback to:

```
https://crm-staging.cleva.rw/api/method/frappe_whatsapp.utils.webhook.webhook
```

Subscribe at least to `messages`. **VERIFY** the path against the pinned Frappe WhatsApp README.

## 4. Secrets

Cleva side (this repo), in the API environment, never in git:

- `CRM_INTEGRATION_ENABLED` — leave `false` until staging is ready
- `CRM_BASE_URL` — `https://crm-staging.cleva.rw`
- `CRM_INBOUND_SECRET` — HMAC for calls CRM makes into Cleva
- `CRM_OUTBOX_SECRET` — HMAC for calls Cleva makes into CRM
- `CRM_SSO_PRIVATE_KEY` — base64 PEM private key for the 60-second login token

The matching public key and the inbound secret live in Frappe site config when `cleva_bridge` exists. That app is not built in this slice.

## 5. Backups

Before any production use:

- Daily dump of the CRM site database and the `sites/crm-staging.cleva.rw` files (private files included).
- A restore onto a spare site, once, to prove the dump works.
- **VERIFY** the exact `bench backup` flags for your Frappe version.

Do not point this backup at the ERPNext accounting site.

## 6. Not in this runbook

Spikes S1–S8 (does an unknown number create a lead, webhook signature, Flows, and so on) need a running staging site. Do not fill those answers in from guesswork. When the site exists, record results in `docs/crm/01-spike-report.md`.
