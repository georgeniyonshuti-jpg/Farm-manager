/**
 * Gemini translation helper: rate-limited (~4 req/s), 429 exponential backoff,
 * optional batching to reduce parallel API pressure. Logs: [translate]
 */
import crypto from "node:crypto";

const TRANSLATE_CACHE_MAX = 2000;
const translateCache = new Map();
const MIN_INTERVAL_MS = 260; // ~3.8 requests/s (stay under 5/s)
const MAX_GEMINI_RETRIES = 4;
const MAX_BATCH = 12;
const MODEL = "gemini-2.0-flash";

let lastGeminiCallAt = 0;
/** @type {Promise<unknown>} */
let geminiQueue = Promise.resolve();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Serialize Gemini calls and enforce minimum spacing (prevents 429 bursts).
 * Single attempt; retries are inside the scheduled fetch.
 */
function scheduleGemini(fn) {
  const run = geminiQueue.then(async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastGeminiCallAt));
    if (wait) await sleep(wait);
    lastGeminiCallAt = Date.now();
    return fn();
  });
  geminiQueue = run.catch((e) => {
    console.error("[translate]", "queue continuation error:", e?.message ?? e);
  });
  return run;
}

async function fetchGeminiJson(url, body) {
  let backoffMs = 800;
  for (let attempt = 0; attempt < MAX_GEMINI_RETRIES; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      console.warn("[translate]", `Gemini HTTP 429; backoff ${backoffMs}ms (attempt ${attempt + 1}/${MAX_GEMINI_RETRIES})`);
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, 10_000);
      continue;
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[translate]", "Gemini HTTP", res.status, errText.slice(0, 200));
      return { ok: false, status: res.status, data: null };
    }
    const data = await res.json();
    return { ok: true, status: res.status, data };
  }
  console.error("[translate]", "Gemini: max retries after 429");
  return { ok: false, status: 429, data: null };
}

function cacheKeyFor(text) {
  return `rw:${crypto.createHash("sha256").update(String(text).trim()).digest("hex")}`;
}

function stripQuotes(s) {
  return String(s ?? "").replace(/^["“”']+|["“”']+$/g, "").trim();
}

/**
 * Batch translate: one Gemini call for up to MAX_BATCH strings (fewer round-trips).
 * @param {string[]} texts Original strings (order preserved in response)
 * @returns {Promise<{ translations: string[], usedGemini: boolean, cached: boolean }>}
 */
export async function geminiTranslateManyKinyarwanda(texts) {
  const list = texts.map((t) => String(t ?? "").trim());
  if (!list.length) return { translations: [], usedGemini: false, cached: false };
  if (!list.some((s) => s.length > 0)) {
    return { translations: list, usedGemini: false, cached: false };
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("[translate]", "GEMINI_API_KEY is not set; returning originals");
    return { translations: list, usedGemini: false, cached: false };
  }

  /** @type {string[]} */
  const out = list.slice();
  let anyCached = false;
  let needGemini = false;

  for (let i = 0; i < list.length; i++) {
    if (!list[i]) continue;
    const ck = cacheKeyFor(list[i]);
    if (translateCache.has(ck)) {
      out[i] = translateCache.get(ck);
      anyCached = true;
    } else {
      needGemini = true;
    }
  }

  if (!needGemini) {
    return { translations: out, usedGemini: true, cached: anyCached };
  }

  /** @type {number[]} */
  const pendingIdx = [];
  /** @type {string[]} */
  const pendingTexts = [];
  for (let i = 0; i < list.length; i++) {
    if (!list[i]) continue;
    const ck = cacheKeyFor(list[i]);
    if (translateCache.has(ck)) continue;
    pendingIdx.push(i);
    pendingTexts.push(list[i]);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;

  for (let start = 0; start < pendingTexts.length; start += MAX_BATCH) {
    const chunkIdx = pendingIdx.slice(start, start + MAX_BATCH);
    const chunkText = pendingTexts.slice(start, start + MAX_BATCH);
    const payloadJson = JSON.stringify(chunkText);

    const prompt =
      "Translate UI strings for a poultry farm laborer app in Rwanda to Kinyarwanda (Ikinyarwanda).\n" +
      "Rules: Keep numbers, units (kg, L, h, degrees C, percent) and ISO dates exactly as in the source.\n" +
      "Input is a JSON array of strings (same order as output). Output ONLY a JSON array of translated strings, same length, no markdown.\n" +
      `INPUT:\n${payloadJson}`;

    const body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.15, maxOutputTokens: 8192 },
    };

    const result = await scheduleGemini(() => fetchGeminiJson(url, body));
    if (!result.ok || !result.data) {
      for (let k = 0; k < chunkIdx.length; k++) {
        out[chunkIdx[k]] = chunkText[k];
      }
      continue;
    }

    let raw = result.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    /** @type {string[]} */
    let parsed = [];
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("[translate]", "batch JSON parse failed; falling back to originals for chunk");
      for (let k = 0; k < chunkIdx.length; k++) {
        out[chunkIdx[k]] = chunkText[k];
      }
      continue;
    }
    if (!Array.isArray(parsed) || parsed.length !== chunkText.length) {
      console.error("[translate]", "batch length mismatch; falling back to originals");
      for (let k = 0; k < chunkIdx.length; k++) {
        out[chunkIdx[k]] = chunkText[k];
      }
      continue;
    }

    for (let k = 0; k < chunkIdx.length; k++) {
      const translated = stripQuotes(parsed[k]) || chunkText[k];
      out[chunkIdx[k]] = translated;
      const ck = cacheKeyFor(chunkText[k]);
      if (translateCache.size > TRANSLATE_CACHE_MAX) translateCache.clear();
      translateCache.set(ck, translated);
    }
  }

  return { translations: out, usedGemini: true, cached: anyCached };
}

/**
 * Single string (wraps batch of one; uses cache + queue).
 */
export async function geminiTranslateToKinyarwanda(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return { translation: "", usedGemini: false, cached: false };
  const { translations, usedGemini, cached } = await geminiTranslateManyKinyarwanda([trimmed]);
  return {
    translation: translations[0] ?? trimmed,
    usedGemini,
    cached,
  };
}