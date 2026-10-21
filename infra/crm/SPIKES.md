# Spike script (S1–S8)

Run this on the staging CRM only, after Frappe CRM and Frappe WhatsApp are installed and a Meta **test** number is connected. Do not use 0796 683 323. Write results in `docs/crm/01-spike-report.md`. Leave a spike blank if you did not run it. Do not guess.

You need: an admin login on `crm-staging.cleva.rw`, a phone that is on the Meta test allow-list, and a second staff user with a restricted CRM role.

## S1 — Unknown number

1. From the allow-listed phone, send `Hi` to the test number.
2. In CRM, open Leads and search the phone.
3. Open WhatsApp Messages and see whether a document was created.

Record: was a Lead created? If not, what document exists, and which phone field does it store?

## S2 — Message linked to the lead

1. Use the same chat. Send a second line: `Test two`.
2. Open the Lead. Look for a WhatsApp tab or a link field on the message.
3. In the database, open the WhatsApp Message row and note the field that points at the Lead (name the column).

Record: which field links the message to the lead, and what you had to do for the chat to show on the lead page.

## S3 — Webhook signature and retries

1. In Meta, confirm the callback is `https://crm-staging.cleva.rw/api/method/frappe_whatsapp.utils.webhook.webhook`.
2. Send one more message. In the site logs, see whether the request includes `X-Hub-Signature-256`.
3. If you can replay the same webhook body (Meta’s test button, or a saved request), send it again.

Record: does a bad or missing signature get rejected? Does the same message id create a second WhatsApp Message row?

## S4 — Buttons and Flows

1. From a Lead, try to send an interactive button or list (sell / buy / scout).
2. If the screen has WhatsApp Flows, send a one-screen flow with name, district, bird count, and date.
3. Submit it from the phone.

Record: what you were able to send. Where the answers were stored (doctype and field names). If send failed, paste the error without tokens.

## S5 — Ad referral

1. If you have a Click-to-WhatsApp test ad, send a message from that ad. If you do not, write "no ad available" and stop this spike.
2. Open the stored message. Look for referral, ad id, source URL, or click id.

Record: which of those fields were saved. If none, say whether the raw webhook still contained `referral`.

## S6 — Restricted role, via the API

1. Create a user who is not an admin. Assign only the restricted sales role. Give them one lead.
2. Log in as that user in a private window. Confirm the lead list shows only their leads.
3. Copy their API key. Request another user’s lead by name: `GET /api/resource/CRM Lead/<other-lead-name>`.
4. Request WhatsApp Messages the same way.

Record: HTTP status and whether any other person’s phone or message text came back. This is a fail if the API returns another user’s data.

## S7 — Media

1. From the phone, send a photo, then a short voice note.
2. Find the file on the CRM site (private files or the message attachment).
3. Open the file URL in a browser while logged out.

Record: storage path, whether a logged-out person can open the file, and any size error you hit.

## S8 — Template outside 24 hours

1. Use a phone that has not messaged the test number in the last 24 hours (or wait).
2. Send an approved template, not a free-form reply.
3. Watch the message status on the CRM document until it says sent, delivered, or failed.

Record: did it arrive on the phone? Which status fields changed?

## Result table

Copy this into the spike report and fill one row per spike.

| Spike | Run on (date) | Result (yes / no / not run) | Evidence (screenshot or log name) | Fix if no |
|---|---|---|---|---|
| S1 | | not run | | |
| S2 | | not run | | |
| S3 | | not run | | |
| S4 | | not run | | |
| S5 | | not run | | |
| S6 | | not run | | |
| S7 | | not run | | |
| S8 | | not run | | |
