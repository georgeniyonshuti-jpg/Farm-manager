# Cleva shared login (Farm Manager)

Cleva Farm supports native email/password login and **Continue with Cleva** side
by side. Shared login uses ERPNext/Frappe OAuth 2.0 Authorization Code flow,
matching Cleva POS.

Canonical PWA: `https://farm.cleva.rw`. Legacy `farm.clevacredit.com` redirects
there. Tenant vanity `{slug}.farm.cleva.rw` Traefik-redirects to
`https://farm.cleva.rw/login?idp=https://{slug}.cleva.rw`.

## Security model

- The OAuth client secret and code exchange stay on the Farm API
  (`farmapi.cleva.rw`; `farmapi.clevacredit.com` still serves the same API).
- The ERPNext access token is used only for the server-side userinfo request and
  is never stored by the browser.
- Farm sessions remain Bearer tokens in the PWA (same as password login).
- Because Farm web and API are on different hosts, OAuth `state` is kept in
  `sessionStorage` and embeds the chosen IdP origin. The browser callback is
  `https://farm.cleva.rw/auth/cleva/callback` (legacy callback still registered).
- Optional `idp` query/body (e.g. from desk Connect) selects the tenant Frappe
  site. Continue with Cleva does **not** guess from email. Unknown tenant →
  subdomain field. Platform ERP is the explicit operators-only control.

## Access rules

| Cleva identity | Farm role | Company scope |
|----------------|-----------|---------------|
| Any SSO user (including System Manager) | `company_admin` | Auto-provisioned / linked tenants for that IdP only |
| Local password superuser | unchanged | Platform (not via SSO) |

- Companies are upserted from userinfo `erp_companies` only, keyed by
  `(erpnext_company, erpnext_base_url)`.
- Empty `erp_companies` → refuse (`code: no_companies`).
- After login they go to `/app/{slug}/…` (`tenant_subdomain` preferred for slug).
- Cleva-linked users (`auth_source = cleva`) cannot use a Farm password; emails
  that exist as enabled ERPNext Users must use Login with Cleva.

## ERPNext setup

`clevafarm_integration` migration creates/repairs OAuth Client **Cleva Farm**.
When `farm_oauth_client_id` / `farm_oauth_client_secret` are set in site_config
(same values as Farm `CLEVA_OAUTH_CLIENT_*`), every tenant site shares that
client so Login with Cleva can use the tenant as IdP.

Callbacks (space-separated on the OAuth Client):

`https://farm.cleva.rw/auth/cleva/callback`
`https://farm.clevacredit.com/auth/cleva/callback`

Userinfo:

`/api/method/clevafarm_integration.api.farm_sso.userinfo`

Returns `is_admin`, `erp_companies`, `tenant_subdomain`, `idp_url`.

## Farm configuration

Set in Farm Manager env (see `server/.env.example`):

```
CLEVA_SSO_ENABLED=true
CLEVA_OAUTH_CLIENT_ID=
CLEVA_OAUTH_CLIENT_SECRET=
CLEVA_OAUTH_SCOPE=all
CLEVA_OAUTH_BASE_URL=https://erp.clevacredit.com
FRONTEND_URL=https://farm.cleva.rw
ERPNEXT_BASE_URL=https://erp.clevacredit.com
CLEVA_TENANT_BASE_DOMAIN=cleva.rw
```

Do not add `openid` to scope unless the OAuth Client scopes include it.

See also: platform repo `production/docs/SSO.md`.
