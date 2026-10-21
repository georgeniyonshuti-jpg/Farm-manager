/**
 * Prod demo cleanup for CIG (cleva-tech). Defaults to dry-run.
 *
 * Usage (from server/):
 *   node scripts/cleanupDemoData.js
 *   node scripts/cleanupDemoData.js --out ./demo-cleanup-report
 *   node scripts/cleanupDemoData.js --apply --confirm cleva-tech
 *   node scripts/cleanupDemoData.js --keep <userOrProfileUuid>,...
 *
 * Never deletes companies cleva-tech / default-farm.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  classifyCompanyForCleanup,
  classifyFarmProfileForCleanup,
  classifyUserForCleanup,
} from "../src/services/pipeline/demoCleanupClassifier.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  const candidates = [
    path.join(__dirname, "../.env"),
    path.join(__dirname, "../../.env"),
  ];
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] == null) process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const out = {
    apply: false,
    confirm: "",
    outDir: path.join(__dirname, `demo-cleanup-${new Date().toISOString().slice(0, 10)}`),
    keep: new Set(),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--confirm") out.confirm = String(argv[++i] || "");
    else if (a === "--out") out.outDir = String(argv[++i] || out.outDir);
    else if (a === "--keep") {
      for (const id of String(argv[++i] || "").split(",")) {
        if (id.trim()) out.keep.add(id.trim());
      }
    }
  }
  return out;
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  if (args.apply && args.confirm !== "cleva-tech") {
    console.error('Refusing --apply without --confirm cleva-tech');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const q = (sql, params = []) => pool.query(sql, params);

  try {
    const [users, profiles, companies, onboarding] = await Promise.all([
      q(
        `SELECT u.id::text AS id, u.email, u.full_name AS "fullName", u.role,
                u.company_id::text AS "companyId", c.slug AS "companySlug"
           FROM users u
           LEFT JOIN companies c ON c.id = u.company_id`
      ),
      q(
        `SELECT fp.id::text AS id, fp.display_name AS "displayName",
                fp.owner_user_id::text AS "ownerUserId",
                c.slug AS "companySlug",
                u.email AS "ownerEmail"
           FROM farm_profiles fp
           LEFT JOIN companies c ON c.id = fp.company_id
           LEFT JOIN users u ON u.id = fp.owner_user_id`
      ),
      q(`SELECT id::text AS id, name, slug FROM companies`),
      q(`SELECT user_id::text AS "userId" FROM people_onboarding`).catch(() => ({ rows: [] })),
    ]);

    const onboarded = new Set(onboarding.rows.map((r) => r.userId));
    const report = {
      generatedAt: new Date().toISOString(),
      apply: args.apply,
      users: [],
      profiles: [],
      companies: [],
    };

    for (const u of users.rows) {
      const decision = classifyUserForCleanup({
        ...u,
        hasMarketOnboarding: onboarded.has(u.id),
        keepIds: args.keep,
      });
      report.users.push({ ...u, ...decision });
    }
    for (const p of profiles.rows) {
      const decision = classifyFarmProfileForCleanup({ ...p, keepIds: args.keep });
      report.profiles.push({ ...p, ...decision });
    }
    for (const c of companies.rows) {
      const decision = classifyCompanyForCleanup({ ...c, keepIds: args.keep });
      report.companies.push({ ...c, ...decision });
    }

    fs.mkdirSync(args.outDir, { recursive: true });
    const jsonPath = path.join(args.outDir, "report.json");
    const csvPath = path.join(args.outDir, "report.csv");
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    const csvLines = ["kind,id,label,action,reason"];
    for (const u of report.users) {
      csvLines.push(
        ["user", u.id, u.email, u.action, u.reason].map(csvEscape).join(",")
      );
    }
    for (const p of report.profiles) {
      csvLines.push(
        ["profile", p.id, p.displayName, p.action, p.reason].map(csvEscape).join(",")
      );
    }
    for (const c of report.companies) {
      csvLines.push(
        ["company", c.id, c.slug || c.name, c.action, c.reason].map(csvEscape).join(",")
      );
    }
    fs.writeFileSync(csvPath, csvLines.join("\n"));

    const delUsers = report.users.filter((r) => r.action === "delete");
    const delProfiles = report.profiles.filter((r) => r.action === "delete");
    const delCompanies = report.companies.filter((r) => r.action === "delete");

    console.log(`Report written to ${args.outDir}`);
    console.log(
      `Dry summary: delete ${delUsers.length} users, ${delProfiles.length} profiles, ${delCompanies.length} companies (host protected).`
    );

    if (!args.apply) {
      console.log("Dry run only. Re-run with --apply --confirm cleva-tech after reviewing the CSV.");
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const p of delProfiles) {
        await client.query(`DELETE FROM farm_profile_claims WHERE farm_profile_id = $1::uuid`, [p.id]).catch(() => {});
        await client.query(
          `DELETE FROM pipeline_lots WHERE farm_profile_id = $1::uuid OR id IN (
             SELECT lot_id FROM farm_profile_lots WHERE farm_profile_id = $1::uuid
           )`,
          [p.id]
        ).catch(() => {});
        await client.query(`DELETE FROM farm_profiles WHERE id = $1::uuid`, [p.id]);
      }
      for (const u of delUsers) {
        await client.query(`DELETE FROM onboarding_touches WHERE user_id = $1::uuid`, [u.id]).catch(() => {});
        await client.query(`DELETE FROM people_onboarding WHERE user_id = $1::uuid`, [u.id]).catch(() => {});
        await client.query(`DELETE FROM scout_applications WHERE user_id = $1::uuid`, [u.id]).catch(() => {});
        await client.query(`UPDATE pipeline_buyers SET user_id = NULL WHERE user_id = $1::uuid`, [u.id]).catch(() => {});
        await client.query(`DELETE FROM users WHERE id = $1::uuid`, [u.id]);
      }
      for (const c of delCompanies) {
        // Soft skip if still has users; never touch protected host.
        const left = await client.query(
          `SELECT COUNT(*)::int AS n FROM users WHERE company_id = $1::uuid`,
          [c.id]
        );
        if (Number(left.rows[0]?.n || 0) > 0) continue;
        await client.query(`DELETE FROM companies WHERE id = $1::uuid`, [c.id]);
      }
      await client.query("COMMIT");
      console.log("Apply complete.");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
