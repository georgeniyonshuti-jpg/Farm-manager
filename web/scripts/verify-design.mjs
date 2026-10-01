/**
 * Design-system guardrail for the desktop manager shell.
 * Soft warnings by default; set VERIFY_DESIGN_STRICT=1 to fail the build.
 *
 * Checks (desktop pages + shared layout/ui only — field shell excluded):
 * - PageHeader/PageFrame subtitle= / SectionCard description= / StatCard subtext=
 * - Off-scale spacing classes (p-6, p-8, p-10, py-12, py-16, mb-8, space-y-8)
 * - Raw <button outside allowlisted primitive files
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const STRICT = process.env.VERIFY_DESIGN_STRICT === "1";

const FIELD_PATH_RE =
  /FieldView|FieldGlobalHeader|FieldPageHeader|FieldShellBottomNav|FieldNavHeader|laborer\/|field\/|FarmCheckinPage|DailyLogForm/;

const BUTTON_ALLOWLIST = new Set([
  "components/ui/Button.tsx",
  "components/ui/IconButton.tsx",
  "components/ui/ButtonGroup.tsx",
  "components/ui/Toolbar.tsx",
  "components/ui/TextLink.tsx",
  "components/ui/Field.tsx",
  "components/ui/Modal.tsx",
  "components/ui/ConfirmDialog.tsx",
  "components/ui/DataTable.tsx",
  "components/layout/AppTopBar.tsx",
  "components/layout/UserMenuChip.tsx",
  "components/layout/CommandPalette.tsx",
  "components/layout/AppShell.tsx",
  "components/layout/SidebarNav.tsx",
  "components/layout/GlobalHeader.tsx",
  "components/layout/FieldHeaderAction.tsx",
  "components/layout/FinancialRestrictedBanner.tsx",
  "components/AnnouncementBanner.tsx",
  "components/TrialBanner.tsx",
]);

const OFF_SCALE =
  /\b(p-6|p-8|p-10|px-8|py-8|py-12|py-16|mb-8|mt-8|space-y-8|gap-8)\b/g;
const BANNED_PROPS =
  /\b(subtitle|description|subtext)\s*=/g;
const RAW_BUTTON = /<button\b/g;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      walk(full, out);
    } else if (/\.(tsx|ts|jsx|js)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function rel(p) {
  return path.relative(SRC, p).split(path.sep).join("/");
}

function isDesktopScope(relPath) {
  if (FIELD_PATH_RE.test(relPath)) return false;
  if (relPath.startsWith("pages/public/") || relPath.startsWith("components/public/")) return false;
  if (relPath.startsWith("pages/auth/")) return false;
  if (relPath.includes("LoginPage") || relPath.includes("SignupPage")) return false;
  if (relPath.includes("ForgotPassword") || relPath.includes("ResetPassword")) return false;
  return (
    relPath.startsWith("pages/") ||
    relPath.startsWith("components/layout/") ||
    relPath.startsWith("components/ui/") ||
    relPath.startsWith("components/dashboard/") ||
    relPath === "components/PageHeader.tsx" ||
    relPath === "components/EmptyState.tsx"
  );
}

const issues = [];

for (const file of walk(SRC)) {
  const r = rel(file);
  if (!isDesktopScope(r)) continue;
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");

  lines.forEach((line, i) => {
    // Skip comments
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) return;

    if (BANNED_PROPS.test(line) && /PageHeader|PageFrame|SectionCard|StatCard|ChartPanel|DashboardCard/.test(line + lines[Math.max(0, i - 2)])) {
      // Reset lastIndex for global regex reuse
    }
    BANNED_PROPS.lastIndex = 0;
    OFF_SCALE.lastIndex = 0;
    RAW_BUTTON.lastIndex = 0;

    if (
      (r.includes("PageHeader") ||
        r.includes("PageFrame") ||
        r.includes("SectionCard") ||
        r.includes("StatCard") ||
        /\b(PageHeader|PageFrame|SectionCard|StatCard)\b/.test(line)) &&
      /\b(subtitle|description|subtext)\s*=/.test(line)
    ) {
      issues.push({ file: r, line: i + 1, kind: "banned-prop", text: line.trim().slice(0, 120) });
    }

    const off = line.match(OFF_SCALE);
    if (off) {
      issues.push({
        file: r,
        line: i + 1,
        kind: "off-scale-spacing",
        text: `${off.join(", ")} — ${line.trim().slice(0, 100)}`,
      });
    }

    if (RAW_BUTTON.test(line) && !BUTTON_ALLOWLIST.has(r)) {
      RAW_BUTTON.lastIndex = 0;
      issues.push({ file: r, line: i + 1, kind: "raw-button", text: line.trim().slice(0, 120) });
    }
    RAW_BUTTON.lastIndex = 0;
    OFF_SCALE.lastIndex = 0;
  });
}

const byKind = {};
for (const iss of issues) {
  byKind[iss.kind] = (byKind[iss.kind] || 0) + 1;
}

console.log(`verify-design: scanned desktop scope — ${issues.length} finding(s)`);
for (const [k, n] of Object.entries(byKind).sort()) {
  console.log(`  ${k}: ${n}`);
}

if (issues.length) {
  const sample = issues.slice(0, 40);
  for (const iss of sample) {
    console.log(`  [${iss.kind}] ${iss.file}:${iss.line}  ${iss.text}`);
  }
  if (issues.length > 40) console.log(`  … ${issues.length - 40} more`);
}

if (STRICT && issues.length) {
  console.error("verify-design: FAIL (VERIFY_DESIGN_STRICT=1)");
  process.exit(1);
}

console.log(STRICT ? "verify-design: OK" : "verify-design: OK (warn-only; set VERIFY_DESIGN_STRICT=1 to fail)");
process.exit(0);
