import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverJs = await readFile(path.resolve(__dirname, "../server.js"), "utf8");

/**
 * Static analysis tests: verify that CSV report SQL queries reference
 * correct table and column names, matching the PostgreSQL schema.
 */

describe("CSV report SQL correctness", () => {
  it("mortality CSV references f.code (not f.flock_code)", () => {
    const mortalityCsvBlock = extractRouteBlock(serverJs, "/api/reports/mortality.csv");
    assert.ok(mortalityCsvBlock, "mortality.csv route must exist");
    assert.ok(!mortalityCsvBlock.includes("f.flock_code"), "Must not reference nonexistent f.flock_code");
    assert.ok(mortalityCsvBlock.includes("f.code"), "Must reference f.code for flock code");
  });

  it("feed inventory CSV references f.code (not f.flock_code)", () => {
    const feedCsvBlock = extractRouteBlock(serverJs, "/api/reports/feed-inventory.csv");
    assert.ok(feedCsvBlock, "feed-inventory.csv route must exist");
    assert.ok(!feedCsvBlock.includes("f.flock_code"), "Must not reference nonexistent f.flock_code");
    assert.ok(feedCsvBlock.includes("f.code"), "Must reference f.code for flock code");
  });

  it("flocks CSV references f.code (not f.flock_code)", () => {
    const flocksCsvBlock = extractRouteBlock(serverJs, "/api/reports/flocks.csv");
    assert.ok(flocksCsvBlock, "flocks.csv route must exist");
    assert.ok(!flocksCsvBlock.includes("f.flock_code"), "Must not reference nonexistent f.flock_code");
  });

  it("medicine tracking CSV references flock_treatments (not poultry_treatments)", () => {
    const medCsvBlock = extractRouteBlock(serverJs, "/api/reports/medicine-tracking.csv");
    assert.ok(medCsvBlock, "medicine-tracking.csv route must exist");
    assert.ok(!medCsvBlock.includes("poultry_treatments"), "Must not reference nonexistent poultry_treatments table");
    assert.ok(medCsvBlock.includes("flock_treatments"), "Must reference flock_treatments table");
  });

  it("medicine tracking CSV references t.dose and t.dose_unit (not dosage_value/dosage_unit)", () => {
    const medCsvBlock = extractRouteBlock(serverJs, "/api/reports/medicine-tracking.csv");
    assert.ok(medCsvBlock, "medicine-tracking.csv route must exist");
    assert.ok(medCsvBlock.includes("t.dose"), "Must reference t.dose column");
    assert.ok(medCsvBlock.includes("t.dose_unit"), "Must reference t.dose_unit column");
  });

  it("all SQL queries reference u.full_name (not u.name) for user display names", () => {
    const uNameRegex = /u\.name\b(?!\s*,\s*u\.email)/g;
    const matches = serverJs.match(uNameRegex) ?? [];
    const filtered = matches.filter((m) => !m.includes("full_name"));
    assert.equal(
      filtered.length,
      0,
      `Found ${filtered.length} references to u.name (should be u.full_name). Users table has full_name, not name.`
    );
  });
});

describe("feed total calculation respects submission_status", () => {
  it("totalFeedKgForFlock contains rejection filter for checkins", () => {
    const feedBlock = extractFunctionBlock(serverJs, "function totalFeedKgForFlock");
    assert.ok(feedBlock, "totalFeedKgForFlock must exist");
    assert.ok(
      feedBlock.includes("rejected"),
      "totalFeedKgForFlock must filter out rejected entries"
    );
  });
});

describe("check-in review cascades to linked mortality", () => {
  it("check-in rejection handler updates linked mortality events", () => {
    const reviewBlock = extractRouteBlock(serverJs, "/api/check-ins/:id/review");
    assert.ok(reviewBlock, "check-in review route must exist");
    assert.ok(
      reviewBlock.includes("linked_checkin_id"),
      "Check-in rejection must cascade to linked mortality events via linked_checkin_id"
    );
  });
});

describe("linked mortality inherits check-in submission_status", () => {
  it("round check-in handler passes submission_status to linked mortality INSERT", () => {
    const checkinBlock = extractRouteBlock(serverJs, "/api/flocks/:id/round-checkins");
    assert.ok(checkinBlock, "round-checkins route must exist");
    const mortalityInsertSection = checkinBlock.slice(
      checkinBlock.indexOf("INSERT INTO flock_mortality_events")
    );
    assert.ok(
      mortalityInsertSection.includes("submission_status"),
      "Linked mortality INSERT must include submission_status column"
    );
  });
});

function extractRouteBlock(source, routePattern) {
  const idx = source.indexOf(`"${routePattern}"`);
  if (idx === -1) return null;
  let depth = 0;
  let start = -1;
  for (let i = idx; i < source.length; i++) {
    if (source[i] === "{") {
      if (start === -1) start = i;
      depth++;
    }
    if (source[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        return source.slice(idx, i + 1);
      }
    }
  }
  return source.slice(idx, Math.min(idx + 5000, source.length));
}

function extractFunctionBlock(source, functionSignature) {
  const idx = source.indexOf(functionSignature);
  if (idx === -1) return null;
  let depth = 0;
  let start = -1;
  for (let i = idx; i < source.length; i++) {
    if (source[i] === "{") {
      if (start === -1) start = i;
      depth++;
    }
    if (source[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        return source.slice(idx, i + 1);
      }
    }
  }
  return source.slice(idx, Math.min(idx + 2000, source.length));
}
