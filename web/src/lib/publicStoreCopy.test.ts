import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { storeCopyKeys } from "./publicStoreCopy.ts";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, acc);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) acc.push(path);
  }
  return acc;
}

describe("publicStoreCopy", () => {
  it("every EN key is referenced somewhere under src/", () => {
    const files = walk(SRC).filter((path) => !path.endsWith("publicStoreCopy.ts"));
    const haystack = files.map((path) => readFileSync(path, "utf8")).join("\n");
    const dangling = storeCopyKeys().filter(
      (key) => !haystack.includes(`"${key}"`) && !haystack.includes(`'${key}'`)
    );
    assert.deepEqual(dangling, [], `dangling store copy keys: ${dangling.join(", ")}`);
  });
});
