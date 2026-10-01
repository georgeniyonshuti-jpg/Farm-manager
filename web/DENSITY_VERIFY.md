# Density redesign — verification notes

## Automated
- `npm run verify:design` — warn-only guardrail (raw buttons, off-scale spacing, banned subtitle props)
- `npx tsc --noEmit` — must pass
- `npm test` — existing unit tests
- `npm run build` runs verify:design → tsc → vite build

## Expected chrome height (desktop manager shell, 1440×900)
| State | Approx. height above first content |
|-------|-------------------------------------|
| Before | ~205px (header + page title + subtitle + margins) |
| After (no tabs) | ~65px (48px AppTopBar + shell-y) |
| After (with tabs) | ~102px (48px + 36px tab row + shell-y) |

## Manual matrix
- Density: Comfortable (default) / Compact (avatar menu)
- Theme: Light / Dark
- Roles: manager, company_admin, vet_manager
- Spot-check: Today, Trends, Flocks, Vet logs, Medicine (treatments/rounds/inventory), Accounting Approvals

## Intentionally remaining raw `<button>`
- Full-screen backdrop dismiss controls
- Mobile list-card chrome on FarmVetLogsPage
