Verify the recruitment analytics work. Do not change anything unless I ask.

1. Find the build, typecheck, lint and test commands (package.json or equivalent). Run typecheck, lint, and the analytics tests. Report pass/fail counts.
2. Run reconcile() / the reconciliation test and list every failed invariant id from docs/recruitment-analytics/SPEC.md section 6.9, with the numbers involved.
3. Start the dev server if needed. Using the browser tool, open the new recruitment route at 1440px and 390px wide. Take screenshots. Report any clipped text, overlapping elements, or horizontal page scroll.
4. For the current phase, go through the acceptance checklist in SPEC section 11 and print each item as PASS or FAIL with evidence (test name, screenshot, or query result).
5. List files changed since the last commit and anything you were unsure about.
