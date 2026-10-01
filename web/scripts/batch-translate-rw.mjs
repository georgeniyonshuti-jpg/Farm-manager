#!/usr/bin/env node
/**
 * Scan useLaborerT keys, diff against rwDictionary.ts, optionally fill via Gemini.
 * Never overwrites existing dictionary entries.
 *
 * Usage:
 *   node scripts/batch-translate-rw.mjs --check
 *   GEMINI_API_KEY=... node scripts/batch-translate-rw.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(WEB_ROOT, "src");
const DICT_PATH = path.join(SRC_DIR, "i18n/rwDictionary.ts");
const CSV_PATH = path.resolve(WEB_ROOT, "..", "laborer_kinyarwanda_translation_sheet.csv");

const CHECK_ONLY = process.argv.includes("--check");
const FIELD_ONLY = process.argv.includes("--field-only");

const FIELD_PATH_MARKERS = [
  "/pages/dashboards/VetFieldHub",
  "/pages/dashboards/LaborerHome",
  "/pages/farm/",
  "/pages/laborer/",
  "/components/field/",
  "/components/layout/Field",
  "/components/farm/VetLog",
  "/pages/LoginPage",
  "/components/LaborerLanguageToggle",
];

function walk(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== "node_modules") walk(p, files);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) files.push(p);
  }
  return files;
}

function unescapeKey(s) {
  return s.replace(/\\u2026/g, "\u2026").replace(/\\n/g, "\n").replace(/\\"/g, '"');
}

function escapeTs(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\u2026/g, "\\u2026");
}

function collectKeys() {
  const re = /useLaborerT\(["']((?:\\.|[^"'\\])*)["']\)/g;
  const preRe = /usePreLoginRwT\(["']((?:\\.|[^"'\\])*)["']/g;
  const byKey = new Map();
  for (const f of walk(SRC_DIR)) {
    const rel = f.slice(SRC_DIR.length);
    const src = fs.readFileSync(f, "utf8");
    for (const reFn of [re, preRe]) {
      let m;
      while ((m = reFn.exec(src))) {
        const key = unescapeKey(m[1]);
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(rel);
      }
    }
  }
  return byKey;
}

function parseDictionary() {
  const raw = fs.readFileSync(DICT_PATH, "utf8");
  const dict = {};
  for (const m of raw.matchAll(/"((?:\\.|[^"\\])*)":\s*"((?:\\.|[^"\\])*)"/g)) {
    dict[unescapeKey(m[1])] = unescapeKey(m[2]);
  }
  return dict;
}

function glossaryExcerpt(dict) {
  const picks = [
    "Home", "Flock", "Feed", "Mortality", "Vet", "Meds", "Round check-in",
    "Start round check-in", "No flock available", "Try again", "Back to home",
    "Vet logs", "Medicine tracking", "Clinical notes", "Submit vet log",
  ];
  return picks.filter((k) => dict[k]).map((k) => `${k} → ${dict[k]}`).join("\n");
}

async function geminiTranslate(text, glossary) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const prompt =
    "Translate the following user interface line for a junior poultry vet field app in Rwanda.\n" +
    "Target language: Kinyarwanda (Ikinyarwanda).\n" +
    "Audience: junior vet working in barns with a phone.\n" +
    "Keep numbers, units (kg, L, h, °C, %), placeholders like {max}, {type}, {count}, {days}, {time}, {kg}, {approved}, {pending} exactly as in the source.\n" +
    "Match the tone of these approved examples:\n" +
    glossary +
    "\n\nOutput only the Kinyarwanda translation, no quotes or explanation.\n\n" +
    `Text:\n${text}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.15, maxOutputTokens: 1024 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json();
  let out = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? text;
  return out.replace(/^["“”']+|["“”']+$/g, "");
}

function writeDictionary(dict) {
  const lines = [
    "/**",
    " * Static Kinyarwanda dictionary generated from laborer_kinyarwanda_translation_sheet.csv",
    " * plus batch-translate-rw.mjs (Gemini). Key = exact English source for useLaborerT.",
    " */",
    "const RW_DICTIONARY: Record<string, string> = {",
  ];
  const keys = Object.keys(dict).sort((a, b) => a.localeCompare(b));
  for (const k of keys) {
    lines.push(`  "${escapeTs(k)}": "${escapeTs(dict[k])}",`);
  }
  lines.push(
    "};",
    "",
    "export function lookupRw(english: string): string | undefined {",
    "  return RW_DICTIONARY[english];",
    "}",
    "",
    "export default RW_DICTIONARY;",
    ""
  );
  fs.writeFileSync(DICT_PATH, lines.join("\n"));
}

function appendCsv(rows) {
  if (!rows.length || !fs.existsSync(CSV_PATH)) return;
  const id = fs.readFileSync(CSV_PATH, "utf8").trim().split("\n").length;
  const lines = rows.map((r, i) =>
    [id + i, `"${r.en.replace(/"/g, '""')}"`, `"${r.rw.replace(/"/g, '""')}"`, "", "gemini_batch", "gemini_batch"].join(",")
  );
  fs.appendFileSync(CSV_PATH, "\n" + lines.join("\n") + "\n");
}

function isFieldKey(paths) {
  return paths.some((p) => FIELD_PATH_MARKERS.some((m) => p.includes(m)));
}

async function main() {
  const byKey = collectKeys();
  const dict = parseDictionary();
  let missing = [...byKey.keys()].filter((k) => !dict[k]);
  if (FIELD_ONLY) {
    missing = missing.filter((k) => isFieldKey(byKey.get(k)));
  }
  missing.sort();

  console.log(`Keys in source: ${byKey.size}, dictionary: ${Object.keys(dict).length}, missing: ${missing.length}`);

  if (CHECK_ONLY) {
    if (missing.length) {
      console.error("Missing dictionary entries:");
      missing.forEach((k) => console.error(" -", JSON.stringify(k)));
      process.exit(1);
    }
    console.log("All keys covered.");
    return;
  }

  if (!missing.length) {
    console.log("Nothing to translate.");
    return;
  }

  const glossary = glossaryExcerpt(dict);
  const added = [];
  for (const en of missing) {
    console.log(`Translating: ${en.slice(0, 60)}${en.length > 60 ? "…" : ""}`);
    const rw = await geminiTranslate(en, glossary);
    dict[en] = rw;
    added.push({ en, rw });
    await new Promise((r) => setTimeout(r, 500));
  }

  writeDictionary(dict);
  appendCsv(added);
  console.log(`Added ${added.length} entries to ${DICT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
