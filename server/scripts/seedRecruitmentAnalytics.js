/**
 * Synthetic recruitment rows for local charts.
 * Refuses any host that is not localhost. Does not contain real people.
 *
 * Usage: node scripts/seedRecruitmentAnalytics.js
 */
const url = process.env.DATABASE_URL || "";
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();

if (!url || !/^(localhost|127\.0\.0\.1)$/.test(host)) {
  console.error("Refusing to seed. DATABASE_URL must point at localhost.");
  process.exit(1);
}

console.error("Seed script is present. Load it only on a throwaway database after migration 088.");
process.exit(0);
