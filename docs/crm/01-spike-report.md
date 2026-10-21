# Spike report

Staging CRM: not installed from this repo.
Meta business verification: In review. Do not submit again.
Test number: not connected. Do not register 0796 683 323 for these tests.

How to run a spike: `infra/crm/SPIKES.md`.
Do not write a result you did not see. `not run` is the correct value until you have done the steps on `crm-staging.cleva.rw`.

## S1 — Unknown number

- Question: Does a message from an unknown number create a CRM Lead? If not, what is stored?
- How tested:
- Evidence:
- Result: not run
- Recommended fix:

## S2 — Link from message to lead

- Question: Which field links a WhatsApp Message to a Lead, and what makes the chat show on the lead?
- How tested:
- Evidence:
- Result: not run
- Recommended fix:

## S3 — Signature and duplicate delivery

- Question: Does the webhook check `X-Hub-Signature-256`? Does the same message id get stored twice?
- How tested:
- Evidence:
- Result: not run
- Recommended fix:

## S4 — Buttons and Flows

- Question: Can we send buttons or a Flow? Where are the answers stored?
- How tested:
- Evidence:
- Result: not run
- Recommended fix:

## S5 — Ad referral

- Question: Does a Click-to-WhatsApp message keep ad id, source URL, and click id?
- How tested:
- Evidence:
- Result: not run
- Recommended fix:

## S6 — Restricted role through the API

- Question: Can a restricted user fetch another person’s lead or messages by calling the API?
- How tested:
- Evidence:
- Result: not run
- Recommended fix:

## S7 — Media

- Question: Where are photos and voice notes stored, and can a logged-out person open them?
- How tested:
- Evidence:
- Result: not run
- Recommended fix:

## S8 — Template after 24 hours

- Question: Does an approved template send outside the 24-hour window, and is delivery status saved?
- How tested:
- Evidence:
- Result: not run
- Recommended fix:

The inbox app (`cleva_bridge` welcome, claim lock, and SLA) stays unbuilt until these eight results are filled from a real staging site. The numbered menu in `docs/crm/desk-playbook.md` is the fallback if S4 cannot send a Flow.
