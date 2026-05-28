/**
 * API origin for `fetch()` and report links. If unset, use same-origin `/api/...` so Vite **dev**
 * and **preview** proxies apply (see `vite.config.ts`). That avoids browser CORS for every page
 * when the UI and API are not on the same configured origin.
 *
 * For split hosting (production UI on one host, API on another), set `VITE_API_URL` at build time
 * and configure `FRONTEND_URL` / CORS on the server.
 */
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";
