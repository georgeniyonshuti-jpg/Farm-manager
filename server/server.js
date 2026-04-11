import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import session from "express-session";
import pgSession from "connect-pg-simple";
import pg from "pg";
import { pgClientConfigFromDatabaseUrlAsync } from "./pgConnFromUrl.js";
import { runMigrations } from "./migrate.js";
import { checkinSchema, dailyLogSchema, feedEntrySchema, loginSchema, vetLogSchema } from "./utils/validation.js";
import * as systemConfig from "./systemConfig.js";
import {
  defaultPaygoInputs,
  mergePaygoInputs,
  replacePaygoInputs,
  runProjection,
  summarizeProjection,
  profitMilestones,
  leverScenarioRows,
} from "./business-model/paygoCore.js";
import { defaultPaygoCtl, ctlToInputs, mergePaygoCtl, BUILD_KEYS } from "./business-model/paygoBuilder.js";
import { buildPaygoHeatmaps } from "./business-model/paygoHeatmaps.js";
import { capitalStackForReport, capitalSplitFromCtl } from "./business-model/paygoMemorandum.js";
import { buildVarianceFrame, extractModelKpis } from "./business-model/budgetingCore.js";
import {
  defaultBroilerInputs,
  mergeBroilerInputs,
  broilerSummary,
  dailyTrajectory,
  insightMessagesBroiler,
  weeklyMortalityRates,
} from "./business-model/broilerCore.js";
import * as budgetDb from "./business-model/budgetDb.js";
import * as broilerOpsDb from "./business-model/broilerOpsDb.js";
import { parseActualsCsv } from "./business-model/csvParse.js";
import { loadSuggestedActuals } from "./business-model/productionSuggestedActuals.js";
import { buildInvestorPdfBuffer } from "./business-model/pdfInvestor.js";
import { buildBroilerPdfBuffer } from "./business-model/pdfBroiler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const ENABLE_DEMO_USERS = String(process.env.ENABLE_DEMO_USERS ?? "").toLowerCase() === "true";
const DEMO_USERS_ENABLED = !IS_PRODUCTION || ENABLE_DEMO_USERS;
// FIX: move hardcoded values to environment variables
const PEPPER = process.env.AUTH_PEPPER ?? "";
const PgStore = pgSession(session);
const { Pool } = pg;
const dbPool = process.env.DATABASE_URL
  ? new Pool(await pgClientConfigFromDatabaseUrlAsync(process.env.DATABASE_URL))
  : null;

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
].filter(Boolean);

/** @param {string} origin */
function isDevBrowserHttpOrigin(origin) {
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:") return false;
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    const parts = u.hostname.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  } catch {
    return false;
  }
}

// FIX: setup CORS for frontend connection (non-prod: local + typical LAN http origins for Vite / device testing)
app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    if (!IS_PRODUCTION && isDevBrowserHttpOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "20mb" }));
app.set("trust proxy", 1); // required for Render
app.use(session({
  // PROD-FIX: persistent session store for multi-instance deployment (reuse dbPool so IPv4 + ssl match migrate/main queries)
  store: dbPool ? new PgStore({ pool: dbPool }) : new PgStore({ conString: process.env.DATABASE_URL }),
  // ENV: moved to environment variable
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
}));

app.use(
  "/api/auth/login",
  systemConfig.ipWindowRateLimitMiddleware(
    () => systemConfig.getAppSettingNumber("rate_limit_login_max", 10),
    () => systemConfig.getAppSettingNumber("rate_limit_login_window_ms", 15 * 60 * 1000),
    { error: "Too many login attempts. Try again in 15 minutes." },
  ),
);

app.use(
  "/api/laborer/translate",
  systemConfig.ipWindowRateLimitMiddleware(
    () => systemConfig.getAppSettingNumber("rate_limit_translate_max", 30),
    () => systemConfig.getAppSettingNumber("rate_limit_translate_window_ms", 60 * 1000),
    { error: "Translation limit reached. Wait a moment." },
  ),
);

app.use(
  "/api/",
  systemConfig.ipWindowRateLimitMiddleware(
    () => systemConfig.getAppSettingNumber("rate_limit_api_max", 200),
    () => systemConfig.getAppSettingNumber("rate_limit_api_window_ms", 60 * 1000),
    { error: "Too many requests. Wait a moment." },
  ),
);

function hashPassword(pw) {
  return crypto.createHash("sha256").update(`${PEPPER}:${pw}`).digest("hex");
}

function imageDataUrlMeta(value) {
  const raw = String(value ?? "");
  const m = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1]?.toLowerCase() ?? "";
  const base64 = m[2] ?? "";
  const byteLength = Buffer.byteLength(base64, "base64");
  return { mime, byteLength };
}

function validateImageDataUrls(photos, maxBytes) {
  const cap =
    maxBytes ?? systemConfig.getAppSettingNumber("max_image_upload_bytes", 5 * 1024 * 1024);
  for (const p of photos) {
    const meta = imageDataUrlMeta(p);
    if (!meta) return "Invalid image format. Use image data URLs.";
    // PROD-FIX: prevents malicious uploads
    if (!meta.mime.startsWith("image/")) return "Only image uploads are allowed.";
    // PROD-FIX: prevents malicious uploads
    if (meta.byteLength > cap) return `Image too large (max ${Math.round(cap / (1024 * 1024))}MB).`;
  }
  return null;
}

function sanitizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    businessUnitAccess: row.businessUnitAccess,
    canViewSensitiveFinancial: row.canViewSensitiveFinancial,
    departmentKeys: row.departmentKeys ?? [],
    pageAccess: row.pageAccess ?? [],
  };
}

const PAGE_ACCESS_KEYS = [
  "dashboard_laborer",
  "dashboard_vet",
  "dashboard_management",
  "laborer_earnings",
  "farm_checkin",
  "farm_feed",
  "farm_mortality_log",
  "farm_daily_log",
  "farm_mortality",
  "farm_inventory",
  "farm_flocks",
  "farm_batch_schedule",
  "farm_schedule_settings",
  "farm_payroll",
  "farm_checkin_review",
  "farm_vet_logs",
  "farm_treatments",
  "farm_slaughter",
  "cleva_portfolio",
  "cleva_business_model",
  "cleva_investor_memos",
  "cleva_credit_scoring",
  "admin_system_config",
  "admin_users",
];
const PAGE_ACCESS_KEY_SET = new Set(PAGE_ACCESS_KEYS);

function normalizePageAccess(input, fallback) {
  if (Array.isArray(input)) {
    const out = input.map(String).filter((k) => PAGE_ACCESS_KEY_SET.has(k));
    return [...new Set(out)];
  }
  const raw = Array.isArray(fallback) ? fallback : PAGE_ACCESS_KEYS;
  if (!Array.isArray(raw) || raw.length === 0) return [...PAGE_ACCESS_KEYS];
  const out = raw.map(String).filter((k) => PAGE_ACCESS_KEY_SET.has(k));
  return out.length > 0 ? [...new Set(out)] : [...PAGE_ACCESS_KEYS];
}

function hasUserPageAccess(user, key) {
  if (!user) return false;
  if (user.role === "superuser") return true;
  if (!PAGE_ACCESS_KEY_SET.has(String(key))) return true;
  const access = Array.isArray(user.pageAccess) ? user.pageAccess.map(String) : [];
  if (access.length === 0) return true;
  return access.includes(String(key));
}

function requirePageAccess(pageKey) {
  return (req, res, next) => {
    if (!hasUserPageAccess(req.authUser, pageKey)) {
      res.status(403).json({ error: "Page access denied", pageKey: String(pageKey) });
      return;
    }
    next();
  };
}

function requireAnyPageAccess(pageKeys) {
  const list = Array.isArray(pageKeys) ? pageKeys.map(String) : [];
  return (req, res, next) => {
    if (req.authUser?.role === "superuser") {
      next();
      return;
    }
    const ok = list.some((k) => hasUserPageAccess(req.authUser, k));
    if (!ok) {
      res.status(403).json({ error: "Page access denied", pageKeys: list });
      return;
    }
    next();
  };
}

/** @type {Map<string, { userId: string, exp: number }>} */
const sessions = new Map();

/** @type {Map<string, object>} */
const usersById = new Map();

/** @type {Map<string, string>} */
const usersByEmail = new Map();

let auditSeq = 0;
/** @type {Array<{ id: string, at: string, actor_id: string, role: string, action: string, resource: string, resource_id: string | null, metadata?: object }>} */
const auditEvents = [];

async function persistAuditToDb(row) {
  if (!hasDb()) return;
  await dbQuery(
    `INSERT INTO audit_events (
      id, at, actor_id, role, action, resource, resource_id, metadata
    )
    VALUES (
      $1, $2::timestamptz, $3::text, $4::text, $5::text, $6::text, $7::text, $8::jsonb
    )
    ON CONFLICT (id) DO NOTHING`,
    [
      String(row.id),
      String(row.at),
      row.actor_id != null ? String(row.actor_id) : null,
      String(row.role ?? "unknown"),
      String(row.action ?? ""),
      String(row.resource ?? ""),
      row.resource_id != null ? String(row.resource_id) : null,
      JSON.stringify(row.metadata ?? {}),
    ]
  );
}

async function backfillAuditEventsToDb() {
  if (!hasDb() || auditEvents.length === 0) return 0;
  let inserted = 0;
  for (const event of auditEvents) {
    try {
      await persistAuditToDb(event);
      inserted += 1;
    } catch (e) {
      console.error("[ERROR]", "[startup] audit backfill row:", e instanceof Error ? e.message : e);
    }
  }
  return inserted;
}

/**
 * FIX: audit payload shape { actor_id, role, action, resource, resource_id, timestamp } compatible
 */
function appendAudit(actorUserId, role, action, resource, resourceId, metadata) {
  auditSeq += 1;
  const id = `aud_${auditSeq}`;
  const at = new Date().toISOString();
  const row = {
    id,
    at,
    actor_id: actorUserId,
    role: role ?? "unknown",
    action,
    resource: resource ?? "",
    resource_id: resourceId ?? null,
    metadata: metadata ?? {},
  };
  auditEvents.unshift(row);
  if (hasDb()) {
    persistAuditToDb(row).catch((e) => {
      console.error("[ERROR]", "[db] audit insert:", e instanceof Error ? e.message : e);
    });
  }
  return row;
}

/** @type {Map<string, number>} FIX: mortality duplicate window (5 min) */
const mortalityRecentByKey = new Map();
const MORTALITY_DEBOUNCE_MS = 5 * 60 * 1000;

function upsertUser(u) {
  if (!Array.isArray(u.pageAccess) || u.pageAccess.length === 0) {
    u.pageAccess = [...PAGE_ACCESS_KEYS];
  } else {
    u.pageAccess = normalizePageAccess(u.pageAccess, PAGE_ACCESS_KEYS);
  }
  usersById.set(u.id, u);
  usersByEmail.set(u.email.toLowerCase(), u.id);
}

function parseStringArray(value, fallback = []) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

async function persistUserToDb(row) {
  if (!hasDb()) return;
  await dbQuery(
    `INSERT INTO users (
      id, email, full_name, role, password_hash, business_unit_access,
      can_view_sensitive_financial, department_keys, page_access
    )
    VALUES (
      $1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      password_hash = EXCLUDED.password_hash,
      business_unit_access = EXCLUDED.business_unit_access,
      can_view_sensitive_financial = EXCLUDED.can_view_sensitive_financial,
      department_keys = EXCLUDED.department_keys,
      page_access = EXCLUDED.page_access`,
    [
      row.id,
      row.email,
      row.displayName,
      row.role,
      row.passwordHash,
      row.businessUnitAccess,
      Boolean(row.canViewSensitiveFinancial),
      JSON.stringify(Array.isArray(row.departmentKeys) ? row.departmentKeys : []),
      JSON.stringify(normalizePageAccess(row.pageAccess, PAGE_ACCESS_KEYS)),
    ]
  );
}

async function syncUsersFromDbToMemory() {
  if (!hasDb()) return 0;
  const result = await dbQuery(
    `SELECT
      id::text AS id,
      COALESCE(email, '') AS email,
      COALESCE(full_name, email, 'User') AS "displayName",
      COALESCE(role, 'laborer') AS role,
      COALESCE(password_hash, '') AS "passwordHash",
      COALESCE(business_unit_access, 'farm') AS "businessUnitAccess",
      COALESCE(can_view_sensitive_financial, false) AS "canViewSensitiveFinancial",
      COALESCE(department_keys, '[]'::jsonb) AS "departmentKeys",
      COALESCE(page_access, '[]'::jsonb) AS "pageAccess"
    FROM users
    ORDER BY created_at ASC NULLS LAST`
  );
  usersById.clear();
  usersByEmail.clear();
  for (const row of result.rows) {
    upsertUser({
      id: String(row.id),
      email: String(row.email).toLowerCase(),
      displayName: String(row.displayName),
      passwordHash: String(row.passwordHash ?? ""),
      role: String(row.role ?? "laborer"),
      businessUnitAccess: String(row.businessUnitAccess ?? "farm"),
      canViewSensitiveFinancial: Boolean(row.canViewSensitiveFinancial),
      departmentKeys: parseStringArray(row.departmentKeys, []),
      pageAccess: normalizePageAccess(parseStringArray(row.pageAccess, []), PAGE_ACCESS_KEYS),
    });
  }
  return result.rowCount ?? 0;
}

function updateUserRecord(existing, patch) {
  const next = {
    ...existing,
    ...patch,
  };
  usersById.set(next.id, next);
  if (String(existing.email).toLowerCase() !== String(next.email).toLowerCase()) {
    usersByEmail.delete(String(existing.email).toLowerCase());
    usersByEmail.set(String(next.email).toLowerCase(), next.id);
  }
  return next;
}

function seedUsers() {
  const seed = [
    {
      id: "usr_super",
      email: "superuser@demo.com",
      displayName: "Superuser",
      passwordHash: hashPassword("demo"),
      role: "superuser",
      businessUnitAccess: "both",
      canViewSensitiveFinancial: true,
      departmentKeys: [],
    },
    {
      id: "usr_mgr",
      email: "manager@demo.com",
      displayName: "Operations Manager",
      passwordHash: hashPassword("demo"),
      role: "manager",
      businessUnitAccess: "both",
      canViewSensitiveFinancial: false,
      departmentKeys: [],
    },
    {
      id: "usr_lab",
      email: "laborer@demo.com",
      displayName: "Coop Laborer",
      passwordHash: hashPassword("demo"),
      role: "laborer",
      businessUnitAccess: "farm",
      canViewSensitiveFinancial: false,
      departmentKeys: ["dispatch"],
    },
    {
      id: "usr_vet",
      email: "vet@demo.com",
      displayName: "Lead Vet",
      passwordHash: hashPassword("demo"),
      role: "vet_manager",
      businessUnitAccess: "farm",
      canViewSensitiveFinancial: false,
      departmentKeys: [],
    },
    {
      id: "usr_inv",
      email: "investor@demo.com",
      displayName: "LP Investor",
      passwordHash: hashPassword("demo"),
      role: "investor",
      businessUnitAccess: "clevacredit",
      canViewSensitiveFinancial: true,
      departmentKeys: ["investor_memo"],
    },
  ];
  seed.forEach(upsertUser);
}

function ensureDemoUsersForNonProd() {
  if (!DEMO_USERS_ENABLED) return;
  seedUsers();
}

if (DEMO_USERS_ENABLED) {
  ensureDemoUsersForNonProd();
}

function newSessionId() {
  return crypto.randomBytes(32).toString("hex");
}

function getUserFromRequest(req) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return null;
  const sid = h.slice("Bearer ".length).trim();
  const s = sessions.get(sid);
  if (!s || s.exp < Date.now()) return null;
  return usersById.get(s.userId) ?? null;
}

function requireAuth(req, res, next) {
  const u = getUserFromRequest(req);
  if (!u) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.authUser = u;
  next();
}

function requireSuperuser(req, res, next) {
  if (req.authUser?.role !== "superuser") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

function requireManagerOrSuperuser(req, res, next) {
  const r = req.authUser?.role;
  if (r === "superuser" || r === "manager") {
    next();
    return;
  }
  res.status(403).json({ error: "Forbidden" });
}

function requireLeadVetUp(req, res, next) {
  const r = req.authUser?.role;
  if (r === "vet_manager" || r === "manager" || r === "superuser") {
    next();
    return;
  }
  res.status(403).json({ error: "Forbidden" });
}

function requireLaborer(req, res, next) {
  const r = req.authUser?.role;
  if (r !== "laborer" && r !== "dispatcher") {
    res.status(403).json({ error: "Only field operations accounts may use this translation endpoint" });
    return;
  }
  next();
}

/** Gemini (Google AI) — set GEMINI_API_KEY in the environment for Kinyarwanda UI translation */
const translateCache = new Map();
const TRANSLATE_CACHE_MAX = 2000;

async function geminiTranslateToKinyarwanda(text) {
  const key = process.env.GEMINI_API_KEY;
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return { translation: "", usedGemini: false, cached: false };

  if (!key) {
    // PROD-SAFE: sanitized logging
    console.error("[ERROR]", "[translate] GEMINI_API_KEY is not set; returning original text");
    return { translation: trimmed, usedGemini: false, cached: false };
  }

  const cacheKey = `rw:${crypto.createHash("sha256").update(trimmed).digest("hex")}`;
  if (translateCache.has(cacheKey)) {
    return { translation: translateCache.get(cacheKey), usedGemini: true, cached: true };
  }

  const prompt =
    "Translate the following user interface line for a poultry farm laborer app in Rwanda.\n" +
    "Target language: Kinyarwanda (Ikinyarwanda).\n" +
    "Keep numbers, units (kg, L, h, °C, %) and ISO dates exactly as in the source. Do not explain; output only the translation.\n\n" +
    `Text:\n${trimmed}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.15, maxOutputTokens: 1024 },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      // PROD-SAFE: sanitized logging
      console.error("[ERROR]", "[translate] Gemini HTTP", res.status);
      return { translation: trimmed, usedGemini: false, cached: false };
    }

    const data = await res.json();
    let out = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? trimmed;
    out = out.replace(/^["“”']+|["“”']+$/g, "");

    if (translateCache.size > TRANSLATE_CACHE_MAX) translateCache.clear();
    translateCache.set(cacheKey, out);

    return { translation: out || trimmed, usedGemini: true, cached: false };
  } catch (e) {
    // PROD-SAFE: sanitized logging
    console.error("[ERROR]", "[translate] Gemini fetch error");
    return { translation: trimmed, usedGemini: false, cached: false };
  }
}

function hasFarmAccess(user) {
  if (!user) return false;
  const a = user.businessUnitAccess;
  return a === "farm" || a === "both";
}

function requireFarmAccess(req, res, next) {
  if (!hasFarmAccess(req.authUser)) {
    res.status(403).json({ error: "Farm access required" });
    return;
  }
  next();
}

function hasClevaWorkspace(user) {
  if (!user) return false;
  if (user.role === "superuser") return true;
  const a = user.businessUnitAccess;
  return a === "clevacredit" || a === "both";
}

function requireClevaWorkspace(req, res, next) {
  if (!hasClevaWorkspace(req.authUser)) {
    res.status(403).json({ error: "Clevafarm Finance workspace access required" });
    return;
  }
  next();
}

const FLOCK_ACTION_MIN_ROLE = {
  "flock.view": "laborer",
  "flock.create": "vet_manager",
  "treatment.execute": "vet",
  "weighin.record": "vet",
  "mortality.record": "laborer",
  "slaughter.schedule": "vet_manager",
  "slaughter.record": "vet_manager",
  "flock.close": "vet_manager",
  "alert.acknowledge": "vet_manager",
};

const ROLE_RANK = {
  laborer: 1,
  dispatcher: 1,
  procurement_officer: 1,
  sales_coordinator: 1,
  vet: 2,
  vet_manager: 3,
  manager: 3,
  investor: 0,
  superuser: 99,
};

function actionAllowed(user, action) {
  if (!user) return false;
  if (user.role === "superuser") return true;
  const minRole = FLOCK_ACTION_MIN_ROLE[action];
  if (!minRole) return false;
  const userRank = ROLE_RANK[user.role] ?? -1;
  const minRank = ROLE_RANK[minRole] ?? 999;
  return userRank >= minRank;
}

function denyAction(res, action, blockedBy = null) {
  const requiredRole = FLOCK_ACTION_MIN_ROLE[action] ?? "manager";
  res.status(403).json({
    error: `Forbidden for action ${action}`,
    requiredRole,
    blockedBy,
    suggestedAction: `Request a ${requiredRole} or higher user to perform this action.`,
  });
}

function requireAction(action, blockedByResolver = null) {
  return (req, res, next) => {
    if (!actionAllowed(req.authUser, action)) {
      const blockedBy = typeof blockedByResolver === "function" ? blockedByResolver(req) : blockedByResolver;
      denyAction(res, action, blockedBy ?? null);
      return;
    }
    next();
  };
}

function needsApproval(user) {
  if (!user) return true;
  const r = ROLE_RANK[user.role] ?? -1;
  return r < ROLE_RANK["vet_manager"];
}

function isVetOrAbove(user) {
  if (!user) return false;
  return (ROLE_RANK[user.role] ?? -1) >= ROLE_RANK["vet"];
}

/** Laborer / dispatcher / junior vet (vet + department) need manager review on round check-ins. */
function needsFieldCheckinApproval(user) {
  if (!user) return true;
  if (user.role === "laborer" || user.role === "dispatcher") return true;
  if (user.role === "vet" && Array.isArray(user.departmentKeys) && user.departmentKeys.includes("junior_vet")) {
    return true;
  }
  return false;
}

function canEditCheckinSchedule(user) {
  if (!user) return false;
  return ["superuser", "manager", "vet_manager", "vet"].includes(user.role);
}

function requireCheckinScheduleEditor(req, res, next) {
  if (!canEditCheckinSchedule(req.authUser)) {
    res.status(403).json({ error: "Only management, vet, or superuser can edit schedule" });
    return;
  }
  next();
}

function canManageLogScheduleAndPayroll(user) {
  if (!user) return false;
  return ["superuser", "manager", "vet_manager"].includes(user.role);
}

function requireLogScheduleEditor(req, res, next) {
  if (!canManageLogScheduleAndPayroll(req.authUser)) {
    res.status(403).json({ error: "Only manager, vet manager, or superuser" });
    return;
  }
  next();
}

function requirePayrollApprover(req, res, next) {
  if (!canManageLogScheduleAndPayroll(req.authUser)) {
    res.status(403).json({ error: "Only manager, vet manager, or superuser can approve payroll" });
    return;
  }
  next();
}

/** Africa/Kigali calendar date YYYY-MM-DD */
function kigaliYmd(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function minutesSinceMidnightKigali(d) {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kigali",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  const [hh, mm] = String(s).split(/[.:]/).map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

function parseTimeToMinutes(t) {
  const s = String(t ?? "00:00");
  const [h, m] = s.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

/** Submission instant is on-time if its Kigali time-of-day falls in [open, close] (supports overnight). */
function isSubmissionWithinPayrollWindow(submittedAtIso, windowOpen, windowClose) {
  const d = new Date(submittedAtIso);
  const sub = minutesSinceMidnightKigali(d);
  const o = parseTimeToMinutes(windowOpen);
  const c = parseTimeToMinutes(windowClose);
  if (c >= o) return sub >= o && sub <= c;
  return sub >= o || sub <= c;
}

function windowHasEndedForKigaliDay(sched, now = new Date()) {
  const sub = minutesSinceMidnightKigali(now);
  const o = parseTimeToMinutes(sched.windowOpen);
  const c = parseTimeToMinutes(sched.windowClose);
  if (c >= o) return sub > c;
  return sub > c && sub < o;
}

/** @type {Array<{ id: string, flockId: string, role: string, intervalHours: number, windowOpen: string, windowClose: string, createdAt: string }>} */
const logSchedules = [];

/** @type {Array<{ id: string, userId: string, logId: string, logType: string, rwfDelta: number, reason: string, periodStart: string, periodEnd: string, approvedBy: string | null, approvedAt: string | null, createdAt: string, submittedAt: string, onTime: boolean | null }>} */
const payrollImpacts = [];

/** @type {Array<{ id: string, flockId: string, at: string, diseaseOrReason: string, medicineName: string, dose: number, doseUnit: string, route: string, durationDays: number, withdrawalDays: number, notes: string, administeredByUserId: string }>} */
const flockTreatments = [];

/** @type {Array<{ id: string, flockId: string, at: string, birdsSlaughtered: number, avgLiveWeightKg: number, avgCarcassWeightKg: number | null, notes: string, enteredByUserId: string }>} */
const slaughterEvents = [];

/** @type {Array<{ id: string, type: "procurement_receipt"|"feed_consumption"|"adjustment", flockId: string, at: string, quantityKg: number, deltaKg: number, unitCostRwfPerKg: number | null, reason: string, reference: string, actorUserId: string, approvedByUserId: string | null, approvedAt: string | null }>} */
const inventoryTransactions = [];

const payrollMissedKeys = new Set();

function seedLogScheduleDemo() {
  logSchedules.push({
    id: "ls_demo_001",
    flockId: "flock_demo_001",
    role: "laborer",
    intervalHours: 8,
    windowOpen: "06:00",
    windowClose: "20:00",
    createdAt: new Date().toISOString(),
  });
}
if (!IS_PRODUCTION) {
  seedLogScheduleDemo();
}

function isFieldPayrollViewer(user) {
  if (!user) return false;
  if (user.role === "laborer" || user.role === "dispatcher" || user.role === "vet") return true;
  if (Array.isArray(user.departmentKeys) && user.departmentKeys.includes("junior_vet")) return true;
  return false;
}

/** @param {"check_in"|"feed_entry"} bucket */
function findFieldDayPayrollRow(userId, flockId, ymd, bucket) {
  return payrollImpacts.find(
    (p) =>
      p.userId === userId &&
      sameFlockId(p.flockId, flockId) &&
      p.periodStart === ymd &&
      p.logType === bucket &&
      typeof p.reason === "string" &&
      !p.reason.startsWith("Missed")
  );
}

function findPayrollByLog(userId, logId, logType) {
  return payrollImpacts.find(
    (p) => p.userId === userId && p.logId === logId && p.logType === logType
  );
}

/** Remove auto payroll lines tied to a specific log (e.g. reject a pending check-in that wrongly accrued credit). */
async function removePayrollImpactByLog(logId, logType) {
  if (hasDb()) {
    try {
      await dbQuery(`DELETE FROM payroll_impact WHERE log_id = $1 AND log_type = $2`, [String(logId), String(logType)]);
    } catch (e) {
      console.error("[ERROR]", "[db] payroll_impact DELETE by log:", e instanceof Error ? e.message : e);
    }
  }
  for (let i = payrollImpacts.length - 1; i >= 0; i--) {
    if (String(payrollImpacts[i].logId) === String(logId) && payrollImpacts[i].logType === logType) {
      payrollImpacts.splice(i, 1);
    }
  }
}

/** @param {"check_in"|"feed_entry"} bucket */
function hasPayrollFieldCreditForBucket(userId, flockId, ymd, bucket) {
  return Boolean(findFieldDayPayrollRow(userId, flockId, ymd, bucket));
}

/**
 * @param {"check_in"|"feed_entry"} bucket
 */
function hasMissedFieldPayroll(userId, flockId, ymd, bucket) {
  return payrollImpacts.some((p) => {
    if (p.userId !== userId || !sameFlockId(p.flockId, flockId) || p.periodStart !== ymd) return false;
    if (typeof p.reason !== "string" || !p.reason.startsWith("Missed")) return false;
    const lid = String(p.logId ?? "");
    if (bucket === "check_in") {
      if (p.logType !== "check_in") return false;
      if (lid.startsWith("missed_checkin_")) return true;
      if (lid.startsWith("missed_feed_")) return false;
      return lid.startsWith("missed_");
    }
    if (bucket === "feed_entry") {
      if (p.logType !== "feed_entry") return false;
      return lid.startsWith("missed_feed_");
    }
    return false;
  });
}

function hasCheckinInWindowForUserOnDay(userId, flockId, ymd, sched) {
  for (const c of roundCheckins) {
    if (!sameFlockId(c.flockId, flockId) || c.laborerId !== userId) continue;
    if (kigaliYmd(new Date(c.at)) !== ymd) continue;
    if (isSubmissionWithinPayrollWindow(c.at, sched.windowOpen, sched.windowClose)) return true;
  }
  return false;
}

function hasFeedInWindowForUserOnDay(userId, flockId, ymd, sched) {
  for (const e of flockFeedEntries) {
    if (!sameFlockId(e.flockId, flockId) || e.enteredByUserId !== userId) continue;
    if (kigaliYmd(new Date(e.recordedAt)) !== ymd) continue;
    if (isSubmissionWithinPayrollWindow(e.recordedAt, sched.windowOpen, sched.windowClose)) return true;
  }
  return false;
}

async function updatePayrollImpactAutoFieldsDb(row) {
  if (!hasDb() || !isPersistableUuid(row.id)) return;
  try {
    const fUuid = row.flockId && isPersistableUuid(row.flockId) ? row.flockId : null;
    await dbQuery(
      `UPDATE payroll_impact
          SET log_id = $2,
              log_type = $3,
              rwf_delta = $4::numeric,
              reason = $5,
              submitted_at = $6::timestamptz,
              on_time = $7,
              flock_id = COALESCE($8::uuid, flock_id)
        WHERE id = $1::uuid`,
      [row.id, row.logId, row.logType, row.rwfDelta, row.reason, row.submittedAt, row.onTime, fUuid]
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[WARN] PAYROLL PERSISTENCE FAILED — payroll_impact UPDATE (auto)", {
      payrollImpactId: row.id,
      message: msg,
    });
    console.error("[ERROR]", "[db] payroll_impact UPDATE (auto):", msg);
    throw e;
  }
}

async function updatePayrollImpactApprovalDb(row) {
  if (!hasDb() || !isPersistableUuid(row.id)) return;
  try {
    await dbQuery(
      `UPDATE payroll_impact SET approved_by = $2::uuid, approved_at = $3::timestamptz WHERE id = $1::uuid`,
      [row.id, row.approvedBy, row.approvedAt]
    );
  } catch (e) {
    console.error("[ERROR]", "[db] payroll_impact UPDATE (approve):", e instanceof Error ? e.message : e);
  }
}

async function createPayrollEntry({
  userId,
  logId,
  logType,
  submittedAtIso,
  flockId,
  onTime,
  rwfDelta,
  reason,
}) {
  const ymd = kigaliYmd(new Date(submittedAtIso));
  let id = `pi_${crypto.randomBytes(6).toString("hex")}`;
  const createdAtIso = new Date().toISOString();
  const row = {
    id,
    userId,
    logId,
    logType,
    rwfDelta,
    reason,
    periodStart: ymd,
    periodEnd: ymd,
    approvedBy: null,
    approvedAt: null,
    createdAt: createdAtIso,
    submittedAt: submittedAtIso,
    onTime,
    flockId: flockId ?? null,
  };
  if (hasDb() && isPersistableUuid(userId)) {
    try {
      const fUuid = flockId && isPersistableUuid(flockId) ? flockId : null;
      const ins = await dbQuery(
        `INSERT INTO payroll_impact (user_id, log_id, log_type, rwf_delta, reason, period_start, period_end, submitted_at, on_time, flock_id)
         VALUES ($1::uuid, $2, $3, $4::numeric, $5, $6::date, $7::date, $8::timestamptz, $9, $10::uuid)
         RETURNING id::text AS id, created_at AS "createdAt"`,
        [userId, logId, logType, rwfDelta, reason, ymd, ymd, submittedAtIso, onTime, fUuid]
      );
      const r0 = ins.rows[0];
      if (!r0?.id) {
        throw new Error("payroll_impact INSERT returned no row id");
      }
      row.id = String(r0.id);
      const ca = r0.createdAt;
      if (ca) row.createdAt = ca instanceof Date ? ca.toISOString() : String(ca);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[ERROR]", "[db] payroll_impact INSERT:", msg);
      throw new Error(msg);
    }
  }
  payrollImpacts.unshift(row);
  appendAudit(userId, usersById.get(userId)?.role ?? "unknown", "payroll.impact.auto", "payroll_impact", row.id, {
    logType,
    logId,
    flockId,
    rwfDelta,
    onTime,
  });
  return row;
}

/**
 * @returns {{ payrollImpact: object | null, payrollSaved: boolean }}
 */
async function maybeAutoPayrollForSubmit(reqUser, flockId, logType, logId, submittedAtIso) {
  if (logType !== "check_in" && logType !== "feed_entry") {
    return { payrollImpact: null, payrollSaved: true };
  }
  const scheds = logSchedules.filter((s) => sameFlockId(s.flockId, flockId) && s.role === reqUser.role);
  const rates = systemConfig.getFieldPayrollRates();
  const comm = systemConfig.getCheckinCommissionRates();
  const ymd = kigaliYmd(new Date(submittedAtIso));
  const bucket = logType;

  if (logType === "check_in") {
    const baseOnTime = comm.onTimeRwf > 0 ? comm.onTimeRwf : rates.checkInRwf;
    const lateDed = comm.lateDeductionRwf;
    let onTime = true;
    let creditRwf = baseOnTime;
    let reason = "Round check-in credit (no payroll window configured for your role on this flock)";
    if (scheds.length > 0) {
      const s = scheds[0];
      onTime = isSubmissionWithinPayrollWindow(submittedAtIso, s.windowOpen, s.windowClose);
      creditRwf = onTime ? baseOnTime : Math.max(0, baseOnTime - lateDed);
      reason = onTime
        ? "On-time: round check-in within payroll window"
        : "Late round check-in: commission reduced per policy";
    }
    if (creditRwf <= 0) return { payrollImpact: null, payrollSaved: true };

    const byLog = findPayrollByLog(reqUser.id, logId, logType);
    if (byLog) {
      return { payrollImpact: byLog, payrollSaved: true };
    }

    try {
      const row = await createPayrollEntry({
        userId: reqUser.id,
        logId,
        logType,
        submittedAtIso,
        flockId,
        onTime,
        rwfDelta: creditRwf,
        reason,
      });
      return { payrollImpact: row, payrollSaved: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`PAYROLL PERSISTENCE FAILED for user ${reqUser.id}: ${msg}`);
      return { payrollImpact: null, payrollSaved: false };
    }
  }

  /* feed_entry */
  const creditRwf = rates.feedRwf;
  if (creditRwf <= 0) return { payrollImpact: null, payrollSaved: true };
  let onTime = true;
  let reason = "Feed log credit (no payroll window configured for your role on this flock)";
  if (scheds.length > 0) {
    const s = scheds[0];
    onTime = isSubmissionWithinPayrollWindow(submittedAtIso, s.windowOpen, s.windowClose);
    if (!onTime) return { payrollImpact: null, payrollSaved: true };
    reason = "On-time: feed entry within payroll window";
  }

  const existing = findFieldDayPayrollRow(reqUser.id, flockId, ymd, bucket);
  if (existing) {
    if (existing.onTime && existing.rwfDelta > 0) return { payrollImpact: existing, payrollSaved: true };
    if (creditRwf > 0) {
      existing.logId = logId;
      existing.logType = logType;
      existing.submittedAt = submittedAtIso;
      existing.onTime = true;
      existing.rwfDelta = creditRwf;
      existing.reason = reason;
      if (!(existing.flockId != null)) existing.flockId = flockId;
      appendAudit(reqUser.id, reqUser.role, "payroll.impact.auto_upgrade", "payroll_impact", existing.id, {
        logType,
        logId,
        flockId,
        rwfDelta: creditRwf,
      });
      try {
        await updatePayrollImpactAutoFieldsDb(existing);
        return { payrollImpact: existing, payrollSaved: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`PAYROLL PERSISTENCE FAILED for user ${reqUser.id}: ${msg}`);
        return { payrollImpact: existing, payrollSaved: false };
      }
    }
    return { payrollImpact: existing, payrollSaved: true };
  }

  try {
    const row = await createPayrollEntry({
      userId: reqUser.id,
      logId,
      logType,
      submittedAtIso,
      flockId,
      onTime,
      rwfDelta: creditRwf,
      reason,
    });
    return { payrollImpact: row, payrollSaved: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`PAYROLL PERSISTENCE FAILED for user ${reqUser.id}: ${msg}`);
    return { payrollImpact: null, payrollSaved: false };
  }
}

function logOpsPipeline(action, step, meta = {}) {
  console.info("[OPS_PIPELINE]", action, step, meta);
}

async function handleRoundCheck({ reqUser, flockId, checkinId, submittedAtIso, submissionStatus = "approved" }) {
  logOpsPipeline("round_check", "start", { flockId, checkinId, userId: reqUser?.id ?? null, submissionStatus });
  let payrollImpact = null;
  let payrollSaved = true;
  if (submissionStatus === "approved") {
    const payroll = await maybeAutoPayrollForSubmit(reqUser, flockId, "check_in", checkinId, submittedAtIso);
    payrollImpact = payroll.payrollImpact;
    payrollSaved = payroll.payrollSaved;
    logOpsPipeline("round_check", "payroll_done", { flockId, checkinId, payrollSaved });
  } else {
    logOpsPipeline("round_check", "payroll_deferred", { flockId, checkinId, submissionStatus });
  }
  const flock = flocksById.get(flockId);
  const status = flock
    ? ((await checkinStatusPayloadWithFcrHint(flockId, reqUser?.role ?? null)) ?? checkinStatusPayload(flock, reqUser?.role ?? null))
    : null;
  logOpsPipeline("round_check", "schedule_recomputed", { flockId, hasStatus: Boolean(status) });
  return { payrollImpact, payrollSaved, status };
}

async function handleMortalityLog({ flockId, mortalityId, submissionStatus, role = null }) {
  logOpsPipeline("mortality_log", "start", { flockId, mortalityId, submissionStatus });
  const flock = flocksById.get(flockId);
  const status = flock ? checkinStatusPayload(flock, role) : null;
  const performance = await buildFlockPerformanceSummary(flockId);
  logOpsPipeline("mortality_log", "derived_recomputed", {
    flockId,
    mortalityId,
    mortalityToDate: performance?.mortalityToDate ?? null,
    birdsLiveEstimate: performance?.birdsLiveEstimate ?? null,
  });
  return { status, performance };
}

function canLogTreatments(user) {
  return actionAllowed(user, "treatment.execute");
}

function canCreateProcurement(user) {
  if (!user) return false;
  return ["superuser", "manager", "vet_manager", "procurement_officer"].includes(user.role);
}

function canCreateFeedConsumption(user) {
  if (!user) return false;
  return ["superuser", "manager", "vet_manager", "laborer", "dispatcher"].includes(user.role);
}

function canCreateInventoryAdjustment(user) {
  if (!user) return false;
  return ["superuser", "manager"].includes(user.role);
}

function canEditInventoryRow(user, row) {
  if (!user || !row) return false;
  if (user.role === "superuser" || user.role === "manager") return true;
  if (user.role === "procurement_officer" && row.type === "procurement_receipt" && row.actorUserId === user.id) {
    const sameKigaliDay = kigaliYmd(new Date(row.at)) === kigaliYmd(new Date());
    return sameKigaliDay;
  }
  if ((user.role === "laborer" || user.role === "dispatcher") && row.type === "feed_consumption" && row.actorUserId === user.id) {
    const sameKigaliDay = kigaliYmd(new Date(row.at)) === kigaliYmd(new Date());
    return sameKigaliDay;
  }
  return false;
}

function requireTreatmentLogger(req, res, next) {
  if (!actionAllowed(req.authUser, "treatment.execute")) {
    denyAction(res, "treatment.execute");
    return;
  }
  next();
}

function requireSlaughterEventLogger(req, res, next) {
  if (!actionAllowed(req.authUser, "slaughter.record")) {
    denyAction(res, "slaughter.record");
    return;
  }
  next();
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvFromRows(headers, rows) {
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
  ];
  return lines.join("\n");
}

const INVENTORY_REASON_CODES = {
  procurement: ["supplier_delivery", "internal_transfer_in", "returned_stock", "other"],
  consumption: ["round_feed", "catchup_feed", "spillage_adjusted", "other"],
  adjustment: ["stock_count_correction", "damage_loss", "expired_feed", "other"],
};

const TREATMENT_REASON_CODES = [
  "routine_prevention",
  "suspected_infection",
  "confirmed_infection",
  "vet_directive",
  "other",
];

const SLAUGHTER_REASON_CODES = [
  "planned_market",
  "target_weight_reached",
  "emergency_cull",
  "partial_harvest",
  "other",
];

function hasDb() {
  return Boolean(dbPool);
}

async function dbQuery(sql, params = []) {
  if (!dbPool) throw new Error("Database pool not configured");
  return dbPool.query(sql, params);
}

function parseOptionalIsoDate(value) {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function runMissedPayrollScan() {
  const now = new Date();
  const ymd = kigaliYmd(now);
  const rates = systemConfig.getFieldPayrollRates();
  const missCheck = -rates.missedCheckInRwf;
  const missFeed = -rates.missedFeedRwf;
  for (const sched of logSchedules) {
    if (!flocksById.has(String(sched.flockId ?? ""))) continue;
    if (!windowHasEndedForKigaliDay(sched, now)) continue;
    for (const u of usersById.values()) {
      if (u.role !== sched.role) continue;
      if (!hasFarmAccess(u)) continue;

      const missCheckinKey = `missed_checkin|${sched.id}|${u.id}|${ymd}`;
      if (!payrollMissedKeys.has(missCheckinKey)) {
        if (!hasCheckinInWindowForUserOnDay(u.id, sched.flockId, ymd, sched)) {
          if (!hasPayrollFieldCreditForBucket(u.id, sched.flockId, ymd, "check_in")) {
            if (!hasMissedFieldPayroll(u.id, sched.flockId, ymd, "check_in")) {
              if (missCheck !== 0) {
                try {
                  await createPayrollEntry({
                    userId: u.id,
                    logId: `missed_checkin_${sched.id}_${ymd}`,
                    logType: "check_in",
                    submittedAtIso: now.toISOString(),
                    flockId: sched.flockId,
                    onTime: false,
                    rwfDelta: missCheck,
                    reason: "Missed: no round check-in in payroll window",
                  });
                  payrollMissedKeys.add(missCheckinKey);
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  console.warn(`PAYROLL PERSISTENCE FAILED for user ${u.id}: ${msg}`);
                }
              }
            }
          }
        }
      }

      const missFeedKey = `missed_feed|${sched.id}|${u.id}|${ymd}`;
      if (!payrollMissedKeys.has(missFeedKey)) {
        if (!hasFeedInWindowForUserOnDay(u.id, sched.flockId, ymd, sched)) {
          if (!hasPayrollFieldCreditForBucket(u.id, sched.flockId, ymd, "feed_entry")) {
            if (!hasMissedFieldPayroll(u.id, sched.flockId, ymd, "feed_entry")) {
              if (missFeed !== 0) {
                try {
                  await createPayrollEntry({
                    userId: u.id,
                    logId: `missed_feed_${sched.id}_${ymd}`,
                    logType: "feed_entry",
                    submittedAtIso: now.toISOString(),
                    flockId: sched.flockId,
                    onTime: false,
                    rwfDelta: missFeed,
                    reason: "Missed: no feed entry in payroll window",
                  });
                  payrollMissedKeys.add(missFeedKey);
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  console.warn(`PAYROLL PERSISTENCE FAILED for user ${u.id}: ${msg}`);
                }
              }
            }
          }
        }
      }
    }
  }
}

setInterval(() => {
  void runMissedPayrollScan().catch((e) =>
    console.error("[ERROR]", "[payroll] missed scan:", e instanceof Error ? e.message : e)
  );
}, 5 * 60 * 1000);

/** Until day (exclusive): for ageDays ∈ [prevUntil, untilDay) — first matching band wins */
const DEFAULT_CHECKIN_BANDS = [
  { untilDay: 7, intervalHours: 1 },
  { untilDay: 14, intervalHours: 2 },
  { untilDay: 21, intervalHours: 4 },
  { untilDay: 28, intervalHours: 6 },
  { untilDay: 40, intervalHours: 8 },
  { untilDay: 50, intervalHours: 12 },
  { untilDay: 9999, intervalHours: 24 },
];

/** @type {Map<string, object>} */
const flocksById = new Map();

/** @type {object | null} */
let breedStandardsFileCache = null;
function loadBreedStandardsFileOnly() {
  if (breedStandardsFileCache !== null) return breedStandardsFileCache;
  try {
    const p = path.join(__dirname, "..", "data", "breed_standards.json");
    breedStandardsFileCache = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    breedStandardsFileCache = { breeds: {} };
  }
  return breedStandardsFileCache;
}

function getMergedBreedStandards() {
  return systemConfig.mergeBreedStandardsFileWithDb(loadBreedStandardsFileOnly(), systemConfig.getBreedStandardsOverride());
}

function chickWeightKgDay0(breedCode) {
  const j = getMergedBreedStandards();
  const code = String(breedCode ?? "").trim() || "generic_broiler";
  const breeds = j.breeds ?? {};
  const b = breeds[code] ?? breeds.generic_broiler ?? {};
  const curve = b.curve_kg_avg_weight_by_day ?? {};
  const w = curve["0"] ?? curve[0];
  const n = Number(w);
  return Number.isFinite(n) && n > 0 ? n : 0.04;
}

function initialTotalWeightKgForFlock(flock) {
  const raw = Number(flock.initialWeightKg);
  if (Number.isFinite(raw) && raw > 0) return raw;
  const n = Math.max(1, Number(flock.initialCount) || 1);
  return n * chickWeightKgDay0(flock.breedCode);
}

/** @type {Array<object>} */
const roundCheckins = [];

/** @type {Array<object>} */
const flockFeedEntries = [];

/** @type {Array<object>} */
const mortalityEvents = [];

function totalFeedKgForFlock(flockId, cutoffMs = Number.POSITIVE_INFINITY) {
  const fid = String(flockId);
  let s = 0;
  for (const c of roundCheckins) {
    if (!sameFlockId(c.flockId, fid)) continue;
    if (new Date(c.at).getTime() > cutoffMs) continue;
    s += Number(c.feedKg) || 0;
  }
  for (const e of flockFeedEntries) {
    if (!sameFlockId(e.flockId, fid)) continue;
    if (new Date(e.recordedAt).getTime() > cutoffMs) continue;
    s += Number(e.feedKg) || 0;
  }
  return s;
}

function shouldCountMortalityForLiveEstimate(event) {
  if (!event) return false;
  if (event.affectsLiveCount === false) return false;
  const status = String(event.submissionStatus ?? "approved");
  return status !== "rejected";
}

/** Daily log mortality (legacy) — count toward live estimate when not draft/rejected. */
function shouldCountDailyLogMortality(log) {
  if (!log) return false;
  const vs = String(log.validationStatus ?? "draft");
  if (vs === "draft" || vs === "rejected") return false;
  const n = Number(log.mortality);
  return Number.isFinite(n) && n > 0;
}

function sameFlockId(a, b) {
  return String(a ?? "") === String(b ?? "");
}

async function syncFlockFeedEntriesFromDb() {
  if (!hasDb()) return;
  const preservedMemory = flockFeedEntries.filter((e) => !isPersistableUuid(String(e.id ?? "")));
  const r = await dbQuery(
    `SELECT id::text AS id,
            flock_id::text AS "flockId",
            recorded_at AS "recordedAt",
            feed_kg AS "feedKg",
            COALESCE(notes, '') AS notes,
            entered_by_user_id::text AS "enteredByUserId",
            COALESCE(submission_status, 'approved') AS "submissionStatus",
            reviewed_by_user_id::text AS "reviewedByUserId",
            reviewed_at AS "reviewedAt",
            review_notes AS "reviewNotes"
       FROM flock_feed_entries
       ORDER BY recorded_at ASC`
  );
  flockFeedEntries.length = 0;
  for (const row of r.rows) {
    const ra = row.recordedAt;
    flockFeedEntries.push({
      id: String(row.id),
      flockId: String(row.flockId),
      recordedAt: ra instanceof Date ? ra.toISOString() : String(ra),
      feedKg: Number(row.feedKg) || 0,
      notes: String(row.notes ?? ""),
      enteredByUserId: String(row.enteredByUserId),
      submissionStatus: String(row.submissionStatus ?? "approved"),
      reviewedByUserId: row.reviewedByUserId != null ? String(row.reviewedByUserId) : null,
      reviewedAt: row.reviewedAt instanceof Date ? row.reviewedAt.toISOString() : row.reviewedAt != null ? String(row.reviewedAt) : null,
      reviewNotes: row.reviewNotes != null ? String(row.reviewNotes) : null,
    });
  }
  if (preservedMemory.length > 0) {
    flockFeedEntries.push(...preservedMemory);
  }
}

function isPersistableUuid(s) {
  if (s == null || typeof s !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s).trim());
}

function ymdFromPgDate(d) {
  if (d == null) return "";
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const t = String(d);
  return t.length >= 10 ? t.slice(0, 10) : t;
}

function normalizePgTimeToHhMm(t) {
  const s = String(t ?? "").trim();
  if (!s) return "00:00";
  const parts = s.split(":");
  const h = String(parts[0] ?? "0").padStart(2, "0");
  const m = String(parts[1] ?? "0").padStart(2, "0");
  return `${h}:${m}`;
}

async function syncLogSchedulesFromDb() {
  if (!hasDb()) return;
  const r = await dbQuery(
    `SELECT id::text AS id,
            flock_id::text AS "flockId",
            role,
            interval_hours AS "intervalHours",
            window_open::text AS "windowOpen",
            window_close::text AS "windowClose",
            created_at AS "createdAt"
       FROM log_schedule
      ORDER BY created_at ASC`
  );
  logSchedules.length = 0;
  for (const row of r.rows) {
    logSchedules.push({
      id: String(row.id),
      flockId: String(row.flockId),
      role: String(row.role),
      intervalHours: Number(row.intervalHours) || 24,
      windowOpen: normalizePgTimeToHhMm(row.windowOpen),
      windowClose: normalizePgTimeToHhMm(row.windowClose),
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? new Date().toISOString()),
    });
  }
}

async function syncCheckInsFromDb() {
  if (!hasDb()) return;
  const preservedMemory = roundCheckins.filter((c) => !isPersistableUuid(String(c.id ?? "")));
  const r = await dbQuery(
    `SELECT id::text AS id,
            flock_id::text AS "flockId",
            laborer_id::text AS "laborerId",
            at AS at,
            photo_url AS "photoUrl",
            photo_urls AS "photoUrls",
            feed_kg AS "feedKg",
            water_l AS "waterL",
            COALESCE(notes, '') AS notes,
            mortality_at_checkin AS "mortalityAtCheckin",
            COALESCE(feed_available, false) AS "feedAvailable",
            COALESCE(water_available, false) AS "waterAvailable",
            COALESCE(mortality_reported_in_mortality_log, false) AS "mortalityReportedInMortalityLog",
            COALESCE(submission_status, 'approved') AS "submissionStatus",
            reviewed_by_user_id::text AS "reviewedByUserId",
            reviewed_at AS "reviewedAt",
            review_notes AS "reviewNotes"
       FROM check_ins
       ORDER BY at ASC`
  );
  roundCheckins.length = 0;
  for (const row of r.rows) {
    let photos = [];
    const urls = row.photoUrls;
    if (Array.isArray(urls)) photos = urls.map(String);
    else if (urls && typeof urls === "object") photos = Object.values(urls).map(String);
    if (!photos.length && row.photoUrl) photos = [String(row.photoUrl)];
    const ra = row.at;
    roundCheckins.push({
      id: String(row.id),
      flockId: String(row.flockId),
      laborerId: String(row.laborerId),
      at: ra instanceof Date ? ra.toISOString() : String(ra),
      photos,
      photoUrl: row.photoUrl != null ? String(row.photoUrl) : photos[0] ?? null,
      feedKg: Number(row.feedKg) || 0,
      waterL: Number(row.waterL) || 0,
      notes: String(row.notes ?? ""),
      mortalityAtCheckin: Math.max(0, Number(row.mortalityAtCheckin) || 0),
      feedAvailable: Boolean(row.feedAvailable),
      waterAvailable: Boolean(row.waterAvailable),
      mortalityReportedInMortalityLog: Boolean(row.mortalityReportedInMortalityLog),
      submissionStatus: String(row.submissionStatus ?? "approved"),
      reviewedByUserId: row.reviewedByUserId != null ? String(row.reviewedByUserId) : null,
      reviewedAt: row.reviewedAt instanceof Date ? row.reviewedAt.toISOString() : row.reviewedAt != null ? String(row.reviewedAt) : null,
      reviewNotes: row.reviewNotes != null ? String(row.reviewNotes) : null,
    });
  }
  if (preservedMemory.length > 0) {
    roundCheckins.push(...preservedMemory);
  }
}

async function syncMortalityEventsFromDb() {
  if (!hasDb()) return;
  const preservedMemory = mortalityEvents.filter((m) => !isPersistableUuid(String(m.id ?? "")));
  const r = await dbQuery(
    `SELECT id::text AS id,
            flock_id::text AS "flockId",
            laborer_id::text AS "laborerId",
            at AS at,
            count,
            is_emergency AS "isEmergency",
            photos,
            COALESCE(notes, '') AS notes,
            linked_checkin_id::text AS "linkedCheckinId",
            source,
            COALESCE(submission_status, 'approved') AS "submissionStatus",
            COALESCE(affects_live_count, true) AS "affectsLiveCount",
            reviewed_by_user_id::text AS "reviewedByUserId",
            reviewed_at AS "reviewedAt",
            review_notes AS "reviewNotes"
       FROM flock_mortality_events
       ORDER BY at ASC`
  );
  mortalityEvents.length = 0;
  for (const row of r.rows) {
    const ph = row.photos;
    let photos = [];
    if (Array.isArray(ph)) photos = ph.map((x) => String(x));
    else if (ph && typeof ph === "object") photos = Object.values(ph).map(String);
    const ra = row.at;
    mortalityEvents.push({
      id: String(row.id),
      flockId: String(row.flockId),
      laborerId: String(row.laborerId),
      at: ra instanceof Date ? ra.toISOString() : String(ra),
      count: Math.max(1, Number(row.count) || 0),
      isEmergency: Boolean(row.isEmergency),
      photos,
      notes: String(row.notes ?? ""),
      linkedCheckinId: row.linkedCheckinId != null ? String(row.linkedCheckinId) : null,
      source: String(row.source ?? "adhoc"),
      submissionStatus: String(row.submissionStatus ?? "approved"),
      affectsLiveCount: Boolean(row.affectsLiveCount),
      reviewedByUserId: row.reviewedByUserId != null ? String(row.reviewedByUserId) : null,
      reviewedAt: row.reviewedAt instanceof Date ? row.reviewedAt.toISOString() : row.reviewedAt != null ? String(row.reviewedAt) : null,
      reviewNotes: row.reviewNotes != null ? String(row.reviewNotes) : null,
    });
  }
  if (preservedMemory.length > 0) {
    mortalityEvents.push(...preservedMemory);
  }
}

async function syncDailyLogsFromDb() {
  if (!hasDb()) return;
  const preservedMemory = dailyLogs.filter((log) => !isPersistableUuid(String(log.id ?? "")));
  const r = await dbQuery(
    `SELECT id::text AS id,
            flock_id::text AS "flockId",
            laborer_id::text AS "enteredByUserId",
            log_date::text AS "logDate",
            mortality,
            feed_intake_kg AS "feedIntakeKg",
            water_liters AS "waterLiters",
            temp_min_c AS "tempMinC",
            temp_max_c AS "tempMaxC",
            avg_weight_sample_kg AS "avgWeightSampleKg",
            COALESCE(notes, '') AS notes,
            mortality_pct_of_initial AS "mortalityPct",
            flagged_high_mortality AS "flaggedHighMortality",
            validation_status::text AS "validationStatus",
            submitted_at AS "submittedAt",
            created_at AS "createdAt"
       FROM poultry_daily_logs
       ORDER BY log_date ASC, created_at ASC`
  );
  dailyLogs.length = 0;
  for (const row of r.rows) {
    const pct = row.mortalityPct != null ? Number(row.mortalityPct) : 0;
    const warnings = [];
    if (pct >= 0.5) {
      warnings.push(`Mortality is ${pct.toFixed(2)}% of initial flock (≥ 0.5%).`);
    }
    if (pct >= 2) {
      warnings.push("Very high single-day mortality — would require vet manager approval in production.");
    }
    const validation = { warnings, mortalityPct: pct };
    const sa = row.submittedAt;
    const receivedAt =
      sa instanceof Date ? sa.toISOString() : sa != null ? String(sa) : new Date().toISOString();
    dailyLogs.push({
      id: String(row.id),
      flockId: String(row.flockId),
      logDate: String(row.logDate).slice(0, 10),
      mortality: Math.max(0, Number(row.mortality) || 0),
      feedIntakeKg: Number(row.feedIntakeKg) || 0,
      waterLiters: Number(row.waterLiters) || 0,
      tempMinC: row.tempMinC != null ? Number(row.tempMinC) : null,
      tempMaxC: row.tempMaxC != null ? Number(row.tempMaxC) : null,
      avgWeightSampleKg: row.avgWeightSampleKg != null ? Number(row.avgWeightSampleKg) : null,
      notes: String(row.notes ?? ""),
      receivedAt,
      validation,
      enteredByUserId: String(row.enteredByUserId),
      flaggedHighMortality: Boolean(row.flaggedHighMortality),
      validationStatus: row.validationStatus != null ? String(row.validationStatus) : "draft",
    });
  }
  if (preservedMemory.length > 0) {
    dailyLogs.push(...preservedMemory);
  }
}

async function syncPayrollImpactsFromDb() {
  if (!hasDb()) return;
  const r = await dbQuery(
    `SELECT id::text AS id,
            user_id::text AS "userId",
            log_id AS "logId",
            log_type AS "logType",
            rwf_delta::float AS "rwfDelta",
            COALESCE(reason, '') AS reason,
            period_start AS "periodStart",
            period_end AS "periodEnd",
            approved_by::text AS "approvedBy",
            approved_at AS "approvedAt",
            created_at AS "createdAt",
            submitted_at AS "submittedAt",
            on_time AS "onTime",
            flock_id::text AS "flockId"
       FROM payroll_impact
       ORDER BY created_at DESC`
  );
  payrollImpacts.length = 0;
  for (const row of r.rows) {
    const s = row.submittedAt;
    const c = row.createdAt;
    const a = row.approvedAt;
    payrollImpacts.push({
      id: String(row.id),
      userId: String(row.userId),
      logId: String(row.logId ?? ""),
      logType: String(row.logType ?? "daily_log"),
      rwfDelta: Number(row.rwfDelta) || 0,
      reason: String(row.reason ?? ""),
      periodStart: ymdFromPgDate(row.periodStart),
      periodEnd: ymdFromPgDate(row.periodEnd),
      approvedBy: row.approvedBy != null ? String(row.approvedBy) : null,
      approvedAt: a instanceof Date ? a.toISOString() : a != null ? String(a) : null,
      createdAt: c instanceof Date ? c.toISOString() : c != null ? String(c) : new Date().toISOString(),
      submittedAt: s instanceof Date ? s.toISOString() : s != null ? String(s) : new Date().toISOString(),
      onTime: row.onTime == null ? null : Boolean(row.onTime),
      flockId: row.flockId != null ? String(row.flockId) : null,
    });
  }
}

function mapInventoryRowFromDb(row) {
  const at = row.recordedAt;
  const approvedAt = row.approvedAt;
  return {
    id: String(row.id),
    type: String(row.type),
    flockId: String(row.flockId),
    at: at instanceof Date ? at.toISOString() : String(at),
    quantityKg: Number(row.quantityKg) || 0,
    deltaKg: Number(row.deltaKg) || 0,
    unitCostRwfPerKg:
      row.unitCostRwfPerKg == null ? null : Number(row.unitCostRwfPerKg),
    reason: String(row.reason ?? ""),
    reference: String(row.reference ?? ""),
    actorUserId: String(row.actorUserId),
    approvedByUserId:
      row.approvedByUserId != null ? String(row.approvedByUserId) : null,
    approvedAt:
      approvedAt instanceof Date
        ? approvedAt.toISOString()
        : approvedAt != null
          ? String(approvedAt)
          : null,
  };
}

async function syncInventoryTransactionsFromDb() {
  if (!hasDb()) return;
  const preservedMemory = inventoryTransactions.filter((r) => !isPersistableUuid(String(r.id ?? "")));
  const r = await dbQuery(
    `SELECT id::text AS id,
            transaction_type AS type,
            flock_id::text AS "flockId",
            recorded_at AS "recordedAt",
            quantity_kg AS "quantityKg",
            delta_kg AS "deltaKg",
            unit_cost_rwf_per_kg AS "unitCostRwfPerKg",
            reason,
            reference,
            actor_user_id::text AS "actorUserId",
            approved_by_user_id::text AS "approvedByUserId",
            approved_at AS "approvedAt"
       FROM farm_inventory_transactions
      ORDER BY recorded_at DESC, created_at DESC`
  );
  inventoryTransactions.length = 0;
  for (const row of r.rows) {
    inventoryTransactions.push(mapInventoryRowFromDb(row));
  }
  if (preservedMemory.length > 0) {
    inventoryTransactions.push(...preservedMemory);
  }
}

function rebuildPayrollMissedKeysFromLoadedPayroll() {
  payrollMissedKeys.clear();
  for (const p of payrollImpacts) {
    if (typeof p.reason !== "string" || !p.reason.startsWith("Missed")) continue;
    const lid = String(p.logId ?? "");
    const ymd = p.periodStart;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue;

    if (lid.startsWith("missed_checkin_")) {
      const rest = lid.slice("missed_checkin_".length);
      const ymd2 = rest.slice(-10);
      if (ymd2 !== ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd2)) continue;
      const schedId = rest.slice(0, -11);
      if (!schedId) continue;
      payrollMissedKeys.add(`missed_checkin|${schedId}|${p.userId}|${ymd}`);
      continue;
    }
    if (lid.startsWith("missed_feed_")) {
      const rest = lid.slice("missed_feed_".length);
      const ymd2 = rest.slice(-10);
      if (ymd2 !== ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd2)) continue;
      const schedId = rest.slice(0, -11);
      if (!schedId) continue;
      payrollMissedKeys.add(`missed_feed|${schedId}|${p.userId}|${ymd}`);
      continue;
    }
    if (lid.startsWith("missed_")) {
      const rest = lid.slice("missed_".length);
      const ymd2 = rest.slice(-10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd2) || ymd2 !== ymd) continue;
      const schedId = rest.slice(0, -11);
      if (!schedId) continue;
      payrollMissedKeys.add(`missed_checkin|${schedId}|${p.userId}|${ymd}`);
      payrollMissedKeys.add(`missed_feed|${schedId}|${p.userId}|${ymd}`);
    }
  }
}

function normalizeBands(bands) {
  if (!Array.isArray(bands) || bands.length === 0) return null;
  const out = bands
    .map((b) => ({
      untilDay: Math.max(1, Number(b.untilDay) || 0),
      intervalHours: Math.max(0.5, Math.min(168, Number(b.intervalHours) || 1)),
    }))
    .sort((a, b) => a.untilDay - b.untilDay);
  return out.length ? out : null;
}

function intervalHoursForAge(ageDays, flock) {
  const bands = flock.checkinBands?.length ? flock.checkinBands : DEFAULT_CHECKIN_BANDS;
  for (const b of bands) {
    if (ageDays < b.untilDay) return b.intervalHours;
  }
  return 24;
}

function flockAgeDays(flock, at = new Date()) {
  const p = new Date(`${flock?.placementDate ?? ""}T00:00:00`);
  const pMs = p.getTime();
  if (!Number.isFinite(pMs)) return 0;
  const ms = at.getTime() - pMs;
  return Math.max(0, Math.floor(ms / 86400000));
}

/** Avoid RangeError from `new Date(NaN).toISOString()` when upstream ms is invalid. */
function safeMsToIso(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return new Date().toISOString();
  const d = new Date(n);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

function lastCheckinMs(flockId) {
  let best = -Infinity;
  let any = false;
  for (const c of roundCheckins) {
    if (!sameFlockId(c.flockId, flockId)) continue;
    const t = new Date(c.at).getTime();
    if (!Number.isFinite(t)) continue;
    any = true;
    if (t > best) best = t;
  }
  if (!any) return null;
  return best;
}

function scheduleIntervalHoursForFlockRole(flockId, role) {
  if (!role) return null;
  const entries = logSchedules.filter((s) => sameFlockId(s.flockId, flockId) && s.role === role);
  if (!entries.length) return null;
  const h = Number(entries[0].intervalHours);
  return Number.isFinite(h) && h > 0 ? h : null;
}

function computeNextDueMs(flock, now = Date.now(), role = null) {
  const ageDays = flockAgeDays(flock, new Date(now));
  const roleInterval = scheduleIntervalHoursForFlockRole(flock.id, role);
  const h = roleInterval ?? intervalHoursForAge(ageDays, flock);
  const intervalMs = h * 3600000;
  const last = lastCheckinMs(flock.id);
  if (last == null || !Number.isFinite(last)) {
    const p = new Date(`${flock?.placementDate ?? ""}T00:00:00`).getTime();
    if (!Number.isFinite(p)) return now + intervalMs;
    return p + intervalMs;
  }
  const out = last + intervalMs;
  return Number.isFinite(out) ? out : now + intervalMs;
}

function checkinStatusPayload(flock, role = null) {
  const now = Date.now();
  const ageDays = flockAgeDays(flock, new Date(now));
  const intervalHours = scheduleIntervalHoursForFlockRole(flock.id, role) ?? intervalHoursForAge(ageDays, flock);
  const nextDueMsRaw = computeNextDueMs(flock, now, role);
  const intervalMsFallback = (Number.isFinite(intervalHours) ? intervalHours : 24) * 3600000;
  const nextDueMs = Number.isFinite(nextDueMsRaw) ? nextDueMsRaw : now + intervalMsFallback;
  const lastMs = lastCheckinMs(flock.id);
  const lastCheckinAt =
    lastMs != null && Number.isFinite(lastMs) && Number.isFinite(new Date(lastMs).getTime())
      ? new Date(lastMs).toISOString()
      : null;
  const overdueMs = Math.max(0, now - nextDueMs);
  const isOverdue = now > nextDueMs;
  const msUntilDue = nextDueMs - now;
  // FIX: age-based interval — overdue vs within 1h of due (upcoming)
  let checkinBadge = "ok";
  if (isOverdue) checkinBadge = "overdue";
  else if (msUntilDue > 0 && msUntilDue <= 3600000) checkinBadge = "upcoming";
  const bands = (flock.checkinBands?.length ? flock.checkinBands : DEFAULT_CHECKIN_BANDS).map((b) => ({
    untilDay: b.untilDay,
    intervalHours: b.intervalHours,
  }));

  return {
    flockId: flock.id,
    label: flock.label,
    placementDate: flock.placementDate,
    ageDays,
    targetSlaughterDays: { min: flock.targetSlaughterDayMin, max: flock.targetSlaughterDayMax },
    intervalHours,
    intervalSource: scheduleIntervalHoursForFlockRole(flock.id, role) != null ? "role_schedule" : (flock.checkinBands?.length ? "batch_custom" : "default_age_curve"),
    lastCheckinAt,
    nextDueAt: safeMsToIso(nextDueMs),
    overdueMs,
    isOverdue,
    checkinBadge,
    photosRequiredPerRound: flock.photosRequiredPerRound ?? 1,
    bands,
  };
}

async function checkinStatusPayloadWithFcrHint(flockId, role = null) {
  const f = flocksById.get(flockId);
  if (!f) return null;
  const base = checkinStatusPayload(f, role);
  let fcrCheckinHint = null;
  let feedToDateKg = null;
  try {
    const summary = await buildFlockPerformanceSummary(flockId);
    if (summary?.feedToDateKg != null) feedToDateKg = summary.feedToDateKg;
    const b = summary?.fcrBroiler;
    if (
      b?.fcrCumulative != null &&
      Number.isFinite(b.fcrCumulative) &&
      Number.isFinite(b.fcrTargetMax) &&
      b.fcrCumulative > b.fcrTargetMax
    ) {
      fcrCheckinHint = {
        severity: b.fcrCumulative > b.fcrTargetMax * 1.08 ? "warning" : "watch",
        message: `Cycle FCR ${b.fcrCumulative.toFixed(2)} is above the day-${b.ageDays} target ceiling (${b.fcrTargetMax.toFixed(2)}). Check feed loss, water, and house temperature.`,
      };
    }
  } catch {
    /* optional */
  }
  if (feedToDateKg == null) {
    feedToDateKg = Number(totalFeedKgForFlock(flockId).toFixed(2));
  }
  return { ...base, fcrCheckinHint, feedToDateKg };
}

function seedFlock() {
  const placement = new Date();
  placement.setUTCDate(placement.getUTCDate() - 10);
  const placementDate = placement.toISOString().slice(0, 10);
  const id = "flock_demo_001";
  flocksById.set(id, {
    id,
    label: "Demo batch — Barn A",
    placementDate,
    targetSlaughterDayMin: 45,
    targetSlaughterDayMax: 50,
    initialCount: 1000,
    initialWeightKg: 0,
    breedCode: "generic_broiler",
    checkinBands: null,
    photosRequiredPerRound: 1,
  });
}
if (!IS_PRODUCTION) {
  seedFlock();
}

// FIX: add root and health endpoints
app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    message: "Clevafarm API running",
    version: process.env.APP_VERSION ?? "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// FIX: add root and health endpoints
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION ?? "1.0.0",
  });
});

app.post("/api/auth/login", (req, res) => {
  // PROD-FIX: prevents malformed data and injection
  const loginParsed = loginSchema.safeParse(req.body ?? {});
  if (!loginParsed.success) {
    res.status(400).json({ error: loginParsed.error.issues[0]?.message ?? "Invalid login payload" });
    return;
  }
  const payload = loginParsed.data;
  const email = payload.email.trim().toLowerCase();
  const password = payload.password;
  const uid = usersByEmail.get(email);
  const u = uid ? usersById.get(uid) : null;
  if (!u || u.passwordHash !== hashPassword(password)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const token = newSessionId();
  sessions.set(token, { userId: u.id, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 });
  appendAudit(u.id, u.role, "auth.login", "session", null, { email: u.email });
  res.json({ token, user: sanitizeUser(u) });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  const h = req.headers.authorization;
  const sid = h?.startsWith("Bearer ") ? h.slice("Bearer ".length).trim() : null;
  if (sid) sessions.delete(sid);
  appendAudit(req.authUser.id, req.authUser.role, "auth.logout", "session", null, {});
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: sanitizeUser(req.authUser) });
});

app.get("/api/users", requireAuth, requireSuperuser, requirePageAccess("admin_users"), async (_req, res) => {
  if (hasDb()) {
    try {
      await syncUsersFromDbToMemory();
      if (DEMO_USERS_ENABLED) ensureDemoUsersForNonProd();
    } catch (e) {
      console.error("[ERROR]", "[db] GET /api/users sync:", e instanceof Error ? e.message : e);
    }
  }
  res.json({ users: [...usersById.values()].map(sanitizeUser) });
});

app.post("/api/users", requireAuth, requireSuperuser, requirePageAccess("admin_users"), async (req, res) => {
  if (!hasDb()) {
    res.status(503).json({ error: "Database unavailable. Configure DATABASE_URL." });
    return;
  }
  const body = req.body ?? {};
  const email = String(body.email ?? "").trim().toLowerCase();
  const displayName = String(body.displayName ?? "").trim();
  const password = String(body.password ?? "");
  const role = String(body.role ?? "laborer");
  const businessUnitAccess = String(body.businessUnitAccess ?? "farm");
  const canViewSensitiveFinancial = Boolean(body.canViewSensitiveFinancial);
  const departmentKeys = Array.isArray(body.departmentKeys) ? body.departmentKeys.map(String) : [];
  const pageAccess = normalizePageAccess(body.pageAccess, PAGE_ACCESS_KEYS);
  for (const dk of departmentKeys) {
    if (!systemConfig.validateAgainstCategory("department_key", dk, systemConfig.getStaticFallbackCodes("department_key"))) {
      res.status(400).json({ error: `Invalid department key: ${dk}` });
      return;
    }
  }

  if (!email || !displayName || !password) {
    res.status(400).json({ error: "email, displayName, password required" });
    return;
  }
  if (usersByEmail.has(email)) {
    res.status(409).json({ error: "User already exists" });
    return;
  }

  const id = crypto.randomUUID();
  const row = {
    id,
    email,
    displayName,
    passwordHash: hashPassword(password),
    role,
    businessUnitAccess,
    canViewSensitiveFinancial,
    departmentKeys,
    pageAccess,
  };
  try {
    await persistUserToDb(row);
  } catch (e) {
    console.error("[ERROR]", "[db] POST /api/users:", e instanceof Error ? e.message : e);
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
    return;
  }
  upsertUser(row);
  appendAudit(req.authUser.id, req.authUser.role, "user.create", "user", id, {
    email,
    role,
    businessUnitAccess,
    canViewSensitiveFinancial,
  });
  res.json({ user: sanitizeUser(row) });
});

app.put("/api/users/:id", requireAuth, requireSuperuser, requirePageAccess("admin_users"), async (req, res) => {
  if (!hasDb()) {
    res.status(503).json({ error: "Database unavailable. Configure DATABASE_URL." });
    return;
  }
  const id = String(req.params.id ?? "");
  const existing = usersById.get(id);
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const body = req.body ?? {};
  const email = String(body.email ?? existing.email).trim().toLowerCase();
  const displayName = String(body.displayName ?? existing.displayName).trim();
  const role = String(body.role ?? existing.role);
  const businessUnitAccess = String(body.businessUnitAccess ?? existing.businessUnitAccess);
  const canViewSensitiveFinancial = Boolean(body.canViewSensitiveFinancial ?? existing.canViewSensitiveFinancial);
  const departmentKeys = Array.isArray(body.departmentKeys) ? body.departmentKeys.map(String) : existing.departmentKeys;
  const pageAccess = normalizePageAccess(body.pageAccess, existing.pageAccess ?? PAGE_ACCESS_KEYS);
  for (const dk of departmentKeys) {
    if (!systemConfig.validateAgainstCategory("department_key", dk, systemConfig.getStaticFallbackCodes("department_key"))) {
      res.status(400).json({ error: `Invalid department key: ${dk}` });
      return;
    }
  }
  if (!email || !displayName) {
    res.status(400).json({ error: "email and displayName are required" });
    return;
  }
  const existingByEmail = usersByEmail.get(email);
  if (existingByEmail && existingByEmail !== id) {
    res.status(409).json({ error: "User already exists" });
    return;
  }
  const password = body.password == null ? "" : String(body.password);
  const updatedDraft = {
    ...existing,
    email,
    displayName,
    role,
    businessUnitAccess,
    canViewSensitiveFinancial,
    departmentKeys,
    pageAccess,
    ...(password.trim() ? { passwordHash: hashPassword(password) } : {}),
  };
  try {
    await persistUserToDb(updatedDraft);
  } catch (e) {
    console.error("[ERROR]", "[db] PUT /api/users/:id:", e instanceof Error ? e.message : e);
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
    return;
  }
  const updated = updateUserRecord(existing, updatedDraft);
  appendAudit(req.authUser.id, req.authUser.role, "user.update", "user", id, {
    role,
    businessUnitAccess,
    passwordReset: Boolean(password.trim()),
  });
  res.json({ user: sanitizeUser(updated) });
});

app.patch("/api/users/:id/page-access", requireAuth, requireSuperuser, requirePageAccess("admin_users"), async (req, res) => {
  if (!hasDb()) {
    res.status(503).json({ error: "Database unavailable. Configure DATABASE_URL." });
    return;
  }
  const id = String(req.params.id ?? "");
  const existing = usersById.get(id);
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const body = req.body ?? {};
  const pageAccess = normalizePageAccess(body.pageAccess, existing.pageAccess ?? PAGE_ACCESS_KEYS);
  const updatedDraft = {
    ...existing,
    pageAccess,
  };
  try {
    await persistUserToDb(updatedDraft);
  } catch (e) {
    console.error("[ERROR]", "[db] PATCH /api/users/:id/page-access:", e instanceof Error ? e.message : e);
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
    return;
  }
  const updated = updateUserRecord(existing, { pageAccess });
  appendAudit(req.authUser.id, req.authUser.role, "user.page_access.update", "user", id, {
    pageAccessCount: pageAccess.length,
  });
  res.json({ user: sanitizeUser(updated) });
});

app.get("/api/audit", requireAuth, requireSuperuser, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const roleFilter = String(req.query.role ?? "").trim();
  const actionFilter = String(req.query.action ?? "").trim();

  if (hasDb()) {
    try {
      const where = [];
      const params = [];
      let idx = 1;
      if (roleFilter) {
        where.push(`role = $${idx++}`);
        params.push(roleFilter);
      }
      if (actionFilter) {
        where.push(`action ILIKE $${idx++}`);
        params.push(`%${actionFilter}%`);
      }
      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const countRes = await dbQuery(`SELECT COUNT(*)::int AS total FROM audit_events ${whereSql}`, params);
      const total = Number(countRes.rows?.[0]?.total ?? 0);
      const start = (page - 1) * pageSize;
      const rowsRes = await dbQuery(
        `SELECT id, at, actor_id, role, action, resource, resource_id, metadata
           FROM audit_events
           ${whereSql}
          ORDER BY at DESC
          LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, pageSize, start]
      );
      const events = rowsRes.rows.map((r) => ({
        id: String(r.id),
        at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
        actor_id: r.actor_id == null ? null : String(r.actor_id),
        role: String(r.role ?? "unknown"),
        action: String(r.action ?? ""),
        resource: String(r.resource ?? ""),
        resource_id: r.resource_id == null ? null : String(r.resource_id),
        metadata: r.metadata && typeof r.metadata === "object" ? r.metadata : {},
      }));
      res.json({ events, total, page, pageSize });
      return;
    } catch (e) {
      console.error("[ERROR]", "[db] GET /api/audit:", e instanceof Error ? e.message : e);
    }
  }

  let list = auditEvents;
  if (roleFilter) list = list.filter((e) => e.role === roleFilter);
  if (actionFilter) list = list.filter((e) => e.action.includes(actionFilter));

  const total = list.length;
  const start = (page - 1) * pageSize;
  const events = list.slice(start, start + pageSize);
  res.json({ events, total, page, pageSize });
});

/** FIX: explicit audit POST (actor must match session; superuser may supply any actor_id for tooling) */
app.post("/api/audit", requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const actorId = String(body.actor_id ?? req.authUser.id);
  if (req.authUser.role !== "superuser" && actorId !== req.authUser.id) {
    res.status(403).json({ error: "actor_id must match authenticated user" });
    return;
  }
  const role = String(body.role ?? req.authUser.role);
  const action = String(body.action ?? "");
  const resource = String(body.resource ?? "unknown");
  const resourceId = body.resource_id != null ? String(body.resource_id) : null;
  const timestamp = body.timestamp ? String(body.timestamp) : null;
  if (!action) {
    res.status(400).json({ error: "action is required" });
    return;
  }
  auditSeq += 1;
  const id = `aud_${auditSeq}`;
  const at = timestamp && !Number.isNaN(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : new Date().toISOString();
  const row = {
    id,
    at,
    actor_id: actorId,
    role,
    action,
    resource,
    resource_id: resourceId,
    metadata: {},
  };
  auditEvents.unshift(row);
  if (hasDb()) {
    try {
      await persistAuditToDb(row);
    } catch (e) {
      console.error("[ERROR]", "[db] POST /api/audit:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Database unavailable. Please retry shortly." });
      return;
    }
  }
  res.status(201).json({ event: row });
});

app.get("/api/reference-options", requireAuth, requireFarmAccess, (_req, res) => {
  res.json({ categories: systemConfig.getActiveReferenceOptionsGrouped() });
});

app.get("/api/admin/system-config", requireAuth, requireLeadVetUp, requirePageAccess("admin_system_config"), (_req, res) => {
  res.json(systemConfig.packAdminSystemConfigPayload(loadBreedStandardsFileOnly));
});

app.put("/api/admin/system-config", requireAuth, requireLeadVetUp, requirePageAccess("admin_system_config"), async (req, res) => {
  try {
    const rawBody = req.body ?? {};
    const isSuper = req.authUser.role === "superuser";
    const sanitizedBody = isSuper
      ? rawBody
      : {
          version: rawBody.version,
          referenceOptions: Array.isArray(rawBody.referenceOptions)
            ? rawBody.referenceOptions.filter((x) => {
                const c = String(x?.category ?? "");
                return c === "medicine_category" || c === "feed_type";
              })
            : [],
        };
    await systemConfig.applyAdminSystemConfigPut(
      sanitizedBody,
      dbPool,
      dbQuery,
      hasDb,
      appendAudit,
      req.authUser.id,
      req.authUser.role,
    );
    res.json(systemConfig.packAdminSystemConfigPayload(loadBreedStandardsFileOnly));
  } catch (e) {
    if (e?.code === "CONFLICT") {
      res.status(409).json({
        error: "Configuration was updated elsewhere. Reload and try again.",
        version: e.currentVersion,
      });
      return;
    }
    if (e?.code === "INVALID_BREED" || e?.code === "INVALID_REFERENCE" || e?.code === "EMPTY") {
      res.status(400).json({ error: String(e.message ?? "Invalid request") });
      return;
    }
    console.error("[ERROR]", "[admin] PUT /api/admin/system-config:", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "Unable to save configuration." });
  }
});

app.get("/api/admin/field-payroll-rates", requireAuth, requireFarmAccess, requireManagerOrSuperuser, (_req, res) => {
  const r = systemConfig.getFieldPayrollRates();
  res.json({
    checkInRwf: r.checkInRwf,
    feedRwf: r.feedRwf,
    missedCheckInRwf: r.missedCheckInRwf,
    missedFeedRwf: r.missedFeedRwf,
  });
});

app.put("/api/admin/field-payroll-rates", requireAuth, requireFarmAccess, requireManagerOrSuperuser, async (req, res) => {
  const b = req.body ?? {};
  for (const key of ["checkInRwf", "feedRwf", "missedCheckInRwf", "missedFeedRwf"]) {
    const x = Number(b[key]);
    if (!Number.isFinite(x) || x < 0) {
      res.status(400).json({ error: "Each rate must be a non-negative number" });
      return;
    }
  }
  try {
    await systemConfig.persistFieldPayrollRates(dbQuery, hasDb, {
      checkInRwf: b.checkInRwf,
      feedRwf: b.feedRwf,
      missedCheckInRwf: b.missedCheckInRwf,
      missedFeedRwf: b.missedFeedRwf,
    });
  } catch (e) {
    console.error("[ERROR]", "[admin] PUT field-payroll-rates:", e instanceof Error ? e.message : e);
    res.status(503).json({ error: "Could not save field payroll rates." });
    return;
  }
  appendAudit(req.authUser.id, req.authUser.role, "field_payroll_rates.update", "app_settings", null, {});
  res.json(systemConfig.getFieldPayrollRates());
});

/** Rate-limited public translation (login screen when laborer_ui_locale is rw). Same Gemini cache as authenticated. */
const publicTranslateHits = new Map();
function publicTranslateLimiter(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const windowMs = 60_000;
  const maxPerWindow = 60;
  let e = publicTranslateHits.get(ip);
  if (!e || now - e.start > windowMs) e = { start: now, n: 0 };
  e.n += 1;
  publicTranslateHits.set(ip, e);
  if (e.n > maxPerWindow) {
    res.status(429).json({ error: "Too many translation requests" });
    return;
  }
  next();
}

app.post("/api/i18n/translate-public", publicTranslateLimiter, async (req, res) => {
  const body = req.body ?? {};
  const targetLang = String(body.targetLang ?? "rw");
  const text = String(body.text ?? "");
  if (targetLang !== "rw") {
    res.json({ translation: text, usedGemini: false });
    return;
  }
  if (text.length > 4000) {
    res.status(400).json({ error: "Text too long" });
    return;
  }
  const out = await geminiTranslateToKinyarwanda(text);
  res.json({ translation: out.translation, usedGemini: out.usedGemini, cached: Boolean(out.cached) });
});

app.post("/api/laborer/translate", requireAuth, requireLaborer, async (req, res) => {
  const body = req.body ?? {};
  const targetLang = String(body.targetLang ?? "rw");
  const text = String(body.text ?? "");

  if (targetLang !== "rw") {
    res.json({ translation: text, usedGemini: false });
    return;
  }
  if (text.length > 8000) {
    res.status(400).json({ error: "Text too long" });
    return;
  }

  const out = await geminiTranslateToKinyarwanda(text);
  appendAudit(req.authUser.id, req.authUser.role, "laborer.translate", "gemini", null, {
    chars: text.length,
    usedGemini: out.usedGemini,
    cached: Boolean(out.cached),
  });
  res.json({ translation: out.translation, usedGemini: out.usedGemini, cached: Boolean(out.cached) });
});

async function ensurePoultryFlockCodeSequence() {
  if (!hasDb()) return;
  try {
    await dbQuery("CREATE SEQUENCE IF NOT EXISTS poultry_flock_code_seq");
  } catch (e) {
    console.error("[ERROR]", "[db] ensurePoultryFlockCodeSequence:", e instanceof Error ? e.message : e);
    throw e;
  }
}

async function syncFlocksFromDbToMemory() {
  if (!hasDb()) return;
  const r = await dbQuery(
    `SELECT id::text AS id,
            code AS "code",
            COALESCE(code, CONCAT('Flock ', LEFT(id::text, 8))) AS label,
            placement_date::text AS "placementDate",
            initial_count AS "initialCount",
            target_weight_kg AS "targetWeightKg",
            initial_weight_kg AS "initialWeightKg",
            breed_code AS "breedCode",
            verified_live_count AS "verifiedLiveCount",
            verified_live_note AS "verifiedLiveNote",
            verified_live_at AS "verifiedLiveAt",
            checkin_bands AS "checkinBands",
            photos_required_per_round AS "photosRequiredPerRound",
            target_slaughter_day_min AS "targetSlaughterDayMin",
            target_slaughter_day_max AS "targetSlaughterDayMax",
            status
       FROM poultry_flocks
      WHERE status IN ('active','planned')
      ORDER BY placement_date DESC`
  );
  for (const row of r.rows) {
    const prev = flocksById.get(row.id) ?? {};
    flocksById.set(row.id, {
      ...prev,
      id: row.id,
      code: row.code != null ? String(row.code) : (prev.code ?? null),
      label: String(row.label ?? `Flock ${String(row.id).slice(0, 8)}`),
      placementDate: String(row.placementDate ?? new Date().toISOString().slice(0, 10)),
      initialCount: Math.max(1, Number(row.initialCount ?? prev.initialCount ?? 1)),
      targetWeightKg: row.targetWeightKg != null ? Number(row.targetWeightKg) : (prev.targetWeightKg ?? null),
      initialWeightKg: row.initialWeightKg != null ? Number(row.initialWeightKg) : (prev.initialWeightKg ?? 0),
      breedCode: row.breedCode != null ? String(row.breedCode) : (prev.breedCode ?? "generic_broiler"),
      verifiedLiveCount: row.verifiedLiveCount != null ? Math.max(0, Number(row.verifiedLiveCount)) : null,
      verifiedLiveNote: row.verifiedLiveNote != null ? String(row.verifiedLiveNote) : null,
      verifiedLiveAt: row.verifiedLiveAt != null ? String(row.verifiedLiveAt) : null,
      checkinBands: normalizeBands(row.checkinBands) ?? null,
      photosRequiredPerRound: Math.max(1, Math.min(5, Number(row.photosRequiredPerRound) || 1)),
      targetSlaughterDayMin: Math.max(1, Number(row.targetSlaughterDayMin) || 45),
      targetSlaughterDayMax: Math.max(
        Math.max(1, Number(row.targetSlaughterDayMin) || 45),
        Number(row.targetSlaughterDayMax) || 50
      ),
      status: String(row.status ?? "active"),
    });
  }
  try {
    await syncLogSchedulesFromDb();
  } catch (e) {
    console.error("[ERROR]", "[db] syncLogSchedulesFromDb:", e instanceof Error ? e.message : e);
  }
  try {
    await syncFlockFeedEntriesFromDb();
  } catch (e) {
    console.error("[ERROR]", "[db] syncFlockFeedEntriesFromDb:", e instanceof Error ? e.message : e);
  }
  try {
    await syncCheckInsFromDb();
  } catch (e) {
    console.error("[ERROR]", "[db] syncCheckInsFromDb:", e instanceof Error ? e.message : e);
  }
  try {
    await syncMortalityEventsFromDb();
  } catch (e) {
    console.error("[ERROR]", "[db] syncMortalityEventsFromDb:", e instanceof Error ? e.message : e);
  }
  try {
    await syncDailyLogsFromDb();
  } catch (e) {
    console.error("[ERROR]", "[db] syncDailyLogsFromDb:", e instanceof Error ? e.message : e);
  }
  try {
    await syncPayrollImpactsFromDb();
  } catch (e) {
    console.error("[ERROR]", "[db] syncPayrollImpactsFromDb:", e instanceof Error ? e.message : e);
  }
  try {
    await syncInventoryTransactionsFromDb();
  } catch (e) {
    console.error("[ERROR]", "[db] syncInventoryTransactionsFromDb:", e instanceof Error ? e.message : e);
  }
  rebuildPayrollMissedKeysFromLoadedPayroll();
}

app.get("/api/flocks", requireAuth, requireFarmAccess, requirePageAccess("farm_flocks"), requireAction("flock.view"), async (req, res) => {
  if (hasDb()) {
    try {
      await syncFlocksFromDbToMemory();
    } catch (e) {
      console.error("[ERROR]", "[db] GET /api/flocks:", e instanceof Error ? e.message : e);
    }
  }
  // FIX: embed check-in urgency per flock for list + detail views
  const flocks = [...flocksById.values()].map((f) => {
    const st = checkinStatusPayload(f, req.authUser?.role ?? null);
    return {
      ...f,
      checkinBadge: st.checkinBadge,
      nextDueAt: st.nextDueAt,
      lastCheckinAt: st.lastCheckinAt,
      isOverdue: st.isOverdue,
      ageDays: st.ageDays,
      intervalHours: st.intervalHours,
    };
  });
  res.json({ flocks });
});

app.post("/api/flocks", requireAuth, requireFarmAccess, requirePageAccess("farm_flocks"), requireAction("flock.create"), async (req, res) => {
  const body = req.body ?? {};
  const placementDateRaw = String(body.placementDate ?? "").trim();
  const placementDate = /^\d{4}-\d{2}-\d{2}$/.test(placementDateRaw) ? placementDateRaw : "";
  const initialCount = Number(body.initialCount);
  const breedCode = String(body.breedCode ?? "").trim().toLowerCase();
  const statusInput = String(body.status ?? "active").trim().toLowerCase();
  const targetWeightKgRaw = body.targetWeightKg;
  const targetWeightKg =
    targetWeightKgRaw == null || targetWeightKgRaw === "" ? null : Number(targetWeightKgRaw);

  if (!placementDate || !Number.isFinite(initialCount) || initialCount <= 0 || !breedCode) {
    res.status(400).json({ error: "placementDate, initialCount (>0), and breedCode are required" });
    return;
  }
  if (!systemConfig.validateAgainstCategory("breed", breedCode, systemConfig.getStaticFallbackCodes("breed"))) {
    res.status(400).json({ error: "Invalid or inactive breedCode" });
    return;
  }
  if (targetWeightKg != null && (!Number.isFinite(targetWeightKg) || targetWeightKg <= 0)) {
    res.status(400).json({ error: "targetWeightKg must be a positive number when provided" });
    return;
  }
  const status = statusInput === "planned" ? "planned" : "active";

  let createdId = `flk_${crypto.randomBytes(6).toString("hex")}`;
  let createdCode = `FL-MEM-${createdId.slice(4)}`;
  let createdLabel = createdCode;
  try {
    if (hasDb()) {
      await ensurePoultryFlockCodeSequence();
      const inserted = await dbQuery(
        `INSERT INTO poultry_flocks
          (breed_code, placement_date, initial_count, target_weight_kg, status, code)
         VALUES ($1, $2::date, $3, $4, $5,
                 'FL-' || lpad(nextval('poultry_flock_code_seq')::text, 6, '0'))
         RETURNING id::text AS id,
                   COALESCE(code, CONCAT('Flock ', LEFT(id::text, 8))) AS label,
                   code`,
        [breedCode, placementDate, Math.floor(initialCount), targetWeightKg, status]
      );
      createdId = String(inserted.rows[0]?.id ?? createdId);
      createdCode = inserted.rows[0]?.code != null ? String(inserted.rows[0].code) : createdCode;
      createdLabel = String(inserted.rows[0]?.label ?? createdCode);
    }
    const flockRow = {
      id: createdId,
      label: createdLabel,
      code: createdCode,
      placementDate,
      initialCount: Math.floor(initialCount),
      breedCode,
      initialWeightKg: 0,
      targetWeightKg,
      status,
      targetSlaughterDayMin: 45,
      targetSlaughterDayMax: 50,
      checkinBands: null,
      photosRequiredPerRound: 1,
    };
    flocksById.set(createdId, flockRow);
    appendAudit(req.authUser.id, req.authUser.role, "flock.create", "flock", createdId, {
      placementDate,
      initialCount: Math.floor(initialCount),
      breedCode,
      status,
    });
    res.status(201).json({ flock: flockRow });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const pgCode = typeof e === "object" && e && "code" in e ? String(e.code) : "";
    console.error("[ERROR]", "[db] POST /api/flocks:", msg, pgCode ? `(pg: ${pgCode})` : "");
    res.status(503).json({
      error: "Unable to create flock right now.",
      ...(process.env.NODE_ENV !== "production" ? { detail: msg, pgCode: pgCode || undefined } : {}),
    });
  }
});

app.delete("/api/flocks/:id/purge", requireAuth, requireFarmAccess, requireSuperuser, requirePageAccess("farm_flocks"), async (req, res) => {
  const id = String(req.params.id ?? "").trim();
  if (!id) {
    res.status(400).json({ error: "Invalid flock id" });
    return;
  }
  if (!flocksById.has(id)) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  try {
    if (hasDb()) {
      await dbQuery(`DELETE FROM poultry_flocks WHERE id::text = $1`, [id]);
    }
    flocksById.delete(id);
    const filterOutFlock = (row) => String(row?.flockId ?? "") !== id;
    for (const bucket of [roundCheckins, flockFeedEntries, mortalityEvents, logSchedules, payrollImpacts, flockTreatments, slaughterEvents, inventoryTransactions, dailyLogs]) {
      const keep = bucket.filter(filterOutFlock);
      bucket.length = 0;
      bucket.push(...keep);
    }
    appendAudit(req.authUser.id, req.authUser.role, "flock.purge", "flock", id, {});
    res.json({ ok: true, flockId: id });
  } catch (e) {
    console.error("[ERROR]", "[flock] DELETE /api/flocks/:id/purge:", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "Unable to purge flock." });
  }
});

app.get("/api/flocks/:id/checkin-status", requireAuth, requireFarmAccess, requirePageAccess("farm_checkin"), requireAction("flock.view"), async (req, res) => {
  if (hasDb()) {
    try {
      await syncFlocksFromDbToMemory();
    } catch {
      /* ignore */
    }
  }
  const payload = await checkinStatusPayloadWithFcrHint(req.params.id, req.authUser?.role ?? null);
  if (!payload) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  res.json(payload);
});

app.get("/api/me/aggregate-checkin-status", requireAuth, requireFarmAccess, requireAnyPageAccess(["dashboard_laborer", "dashboard_vet", "dashboard_management"]), requireAction("flock.view"), async (req, res) => {
  try {
    if (hasDb()) {
      try {
        await syncFlocksFromDbToMemory();
      } catch {
        /* ignore */
      }
    }
    const now = Date.now();
    const flocks = [...flocksById.values()];
    const perFlock = flocks.map((f) => {
      const status = checkinStatusPayload(f, req.authUser?.role ?? null);
      return { flockId: f.id, label: f.label ?? f.code ?? f.id, status };
    });

    let anyOverdue = false;
    let overdueCount = 0;
    let maxOverdueMinutes = 0;
    const overdueLabels = [];
    let soonestNextMs = Infinity;
    let soonestFlockId = null;
    let soonestFlockLabel = null;
    let worstOverdueFlockId = null;

    for (const { flockId, label, status } of perFlock) {
      if (status.isOverdue) {
        anyOverdue = true;
        overdueCount += 1;
        const mins = Math.floor(status.overdueMs / 60000);
        if (mins >= maxOverdueMinutes) {
          maxOverdueMinutes = mins;
          worstOverdueFlockId = flockId;
        }
        if (overdueLabels.length < 3) overdueLabels.push(String(label));
      } else {
        const nextMs = new Date(status.nextDueAt).getTime();
        if (Number.isFinite(nextMs) && nextMs < soonestNextMs) {
          soonestNextMs = nextMs;
          soonestFlockId = flockId;
          soonestFlockLabel = String(label);
        }
      }
    }

    const primaryFlockId = anyOverdue ? worstOverdueFlockId : soonestFlockId;
    let primaryStatus = null;
    if (primaryFlockId) {
      const primaryFlock = flocksById.get(primaryFlockId);
      primaryStatus =
        (await checkinStatusPayloadWithFcrHint(primaryFlockId, req.authUser?.role ?? null))
        ?? (primaryFlock ? checkinStatusPayload(primaryFlock, req.authUser?.role ?? null) : null);
    }

    const summary = {
      anyOverdue,
      overdueCount,
      maxOverdueMinutes,
      overdueLabels,
      minutesUntilSoonestNext:
        anyOverdue || soonestNextMs === Infinity ? null : Math.max(0, Math.floor((soonestNextMs - now) / 60000)),
      soonestFlockLabel: anyOverdue ? null : soonestFlockLabel,
      soonestFlockId: anyOverdue ? null : soonestFlockId,
      primaryFlockId,
    };

    res.json({ summary, primaryFlockId, primaryStatus });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ERROR]", "[api] GET /api/me/aggregate-checkin-status:", msg);
    if (!res.headersSent) {
      res.status(500).json({ error: "Could not load check-in schedule. Try again." });
    }
  }
});

app.patch("/api/flocks/:id/checkin-schedule", requireAuth, requireFarmAccess, requireCheckinScheduleEditor, async (req, res) => {
  const f = flocksById.get(req.params.id);
  if (!f) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  const body = req.body ?? {};
  const next = {
    checkinBands: body.checkinBands !== undefined ? normalizeBands(body.checkinBands) : (f.checkinBands ?? null),
    photosRequiredPerRound: f.photosRequiredPerRound ?? 1,
    targetSlaughterDayMin: f.targetSlaughterDayMin ?? 45,
    targetSlaughterDayMax: f.targetSlaughterDayMax ?? 50,
  };
  if (body.checkinBands !== undefined) {
    next.checkinBands = normalizeBands(body.checkinBands);
  }
  if (body.photosRequiredPerRound !== undefined) {
    const n = Number(body.photosRequiredPerRound);
    next.photosRequiredPerRound = Math.max(1, Math.min(5, Number.isFinite(n) ? n : 1));
  }
  if (body.targetSlaughterDayMin !== undefined) {
    next.targetSlaughterDayMin = Math.max(1, Number(body.targetSlaughterDayMin) || 45);
  }
  if (body.targetSlaughterDayMax !== undefined) {
    next.targetSlaughterDayMax = Math.max(next.targetSlaughterDayMin, Number(body.targetSlaughterDayMax) || 50);
  }
  if (hasDb() && isPersistableUuid(f.id)) {
    try {
      await dbQuery(
        `UPDATE poultry_flocks
            SET checkin_bands = $2::jsonb,
                photos_required_per_round = $3,
                target_slaughter_day_min = $4,
                target_slaughter_day_max = $5,
                updated_at = now()
          WHERE id::text = $1`,
        [
          f.id,
          next.checkinBands ? JSON.stringify(next.checkinBands) : null,
          next.photosRequiredPerRound,
          next.targetSlaughterDayMin,
          next.targetSlaughterDayMax,
        ]
      );
    } catch (e) {
      console.error("[ERROR]", "[db] PATCH /api/flocks/:id/checkin-schedule:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Could not save flock schedule settings." });
      return;
    }
  }
  f.checkinBands = next.checkinBands;
  f.photosRequiredPerRound = next.photosRequiredPerRound;
  f.targetSlaughterDayMin = next.targetSlaughterDayMin;
  f.targetSlaughterDayMax = next.targetSlaughterDayMax;
  appendAudit(req.authUser.id, req.authUser.role, "flock.checkin_schedule.update", "flock", f.id, {
    hasCustomBands: Boolean(f.checkinBands?.length),
    photosRequiredPerRound: f.photosRequiredPerRound,
  });
  res.json({ flock: f, status: checkinStatusPayload(f, req.authUser?.role ?? null) });
});

app.post("/api/flocks/:id/round-checkins", requireAuth, requireFarmAccess, requirePageAccess("farm_checkin"), requireAction("flock.view"), async (req, res) => {
  const f = flocksById.get(req.params.id);
  if (!f) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  // PROD-FIX: prevents malformed data and injection
  const checkinParsed = checkinSchema.safeParse(req.body ?? {});
  if (!checkinParsed.success) {
    res.status(400).json({ error: checkinParsed.error.issues[0]?.message ?? "Invalid check-in payload" });
    return;
  }
  const body = checkinParsed.data;
  const photos = Array.isArray(body.photos) ? body.photos.filter((p) => typeof p === "string" && p.length > 40) : [];
  const uploadError = validateImageDataUrls(photos);
  if (uploadError) {
    res.status(400).json({ error: uploadError });
    return;
  }
  const minPhotos = f.photosRequiredPerRound ?? 1;
  if (photos.length < minPhotos) {
    res.status(400).json({ error: `At least ${minPhotos} photo(s) required for this check-in` });
    return;
  }
  const feedKg = Number(body.feedKg);
  const waterL = Number(body.waterL);
  const feedAvailable = Boolean(body.feedAvailable);
  const waterAvailable = Boolean(body.waterAvailable);
  const notes = String(body.notes ?? "").slice(0, 4000);
  const mortalityAtCheckin = body.mortalityAtCheckin != null ? Math.max(0, Number(body.mortalityAtCheckin)) : 0;
  const mortalityReportedInMortalityLog = Boolean(body.mortalityReportedInMortalityLog);
  const submissionStatus = needsFieldCheckinApproval(req.authUser) ? "pending_review" : "approved";

  let id = `chk_${crypto.randomBytes(8).toString("hex")}`;
  const at = new Date().toISOString();
  const row = {
    id,
    flockId: f.id,
    laborerId: req.authUser.id,
    at,
    photos,
    photoUrl: photos[0] ?? null,
    feedKg: Number.isFinite(feedKg) ? feedKg : 0,
    waterL: Number.isFinite(waterL) ? waterL : 0,
    feedAvailable,
    waterAvailable,
    notes,
    mortalityAtCheckin,
    mortalityReportedInMortalityLog,
    submissionStatus,
  };
  if (hasDb() && isPersistableUuid(f.id) && isPersistableUuid(req.authUser.id)) {
    try {
      const ins = await dbQuery(
        `INSERT INTO check_ins (flock_id, laborer_id, at, photo_url, photo_urls, feed_kg, water_l, notes, mortality_at_checkin, feed_available, water_available, mortality_reported_in_mortality_log, submission_status)
         VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4, $5::jsonb, $6::numeric, $7::numeric, $8, $9, $10, $11, $12, $13)
         RETURNING id::text AS id`,
        [
          f.id,
          req.authUser.id,
          at,
          photos[0] ?? null,
          JSON.stringify(photos),
          row.feedKg,
          row.waterL,
          notes && notes.trim() ? notes.slice(0, 4000) : null,
          mortalityAtCheckin,
          feedAvailable,
          waterAvailable,
          mortalityReportedInMortalityLog,
          submissionStatus,
        ]
      );
      const rid = ins.rows[0]?.id;
      if (rid) {
        id = String(rid);
        row.id = id;
      }
      try {
        await syncCheckInsFromDb();
      } catch (syncErr) {
        console.error("[ERROR]", "[db] syncCheckInsFromDb after check-in:", syncErr instanceof Error ? syncErr.message : syncErr);
      }
    } catch (e) {
      console.error("[ERROR]", "[db] POST round-checkins:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Could not save round check-in." });
      return;
    }
  } else {
    roundCheckins.push(row);
  }
  const { payrollImpact, payrollSaved, status: derivedStatus } = await handleRoundCheck({
    reqUser: req.authUser,
    flockId: f.id,
    checkinId: id,
    submittedAtIso: at,
    submissionStatus,
  });
  appendAudit(req.authUser.id, req.authUser.role, "farm.round_checkin.create", "flock", f.id, {
    checkinId: id,
    photoCount: photos.length,
  });
  if (mortalityAtCheckin > 0) {
    const affectsLiveCount = mortalityReportedInMortalityLog;
    let mid = `mort_${crypto.randomBytes(8).toString("hex")}`;
    const mortRow = {
      id: mid,
      flockId: f.id,
      laborerId: req.authUser.id,
      at,
      count: mortalityAtCheckin,
      isEmergency: false,
      photos: photos.slice(0, 2),
      notes: "Logged at scheduled round check-in",
      linkedCheckinId: id,
      source: "round_checkin",
      affectsLiveCount,
    };
    let linkedMortalitySavedToDb = false;
    if (hasDb() && isPersistableUuid(f.id) && isPersistableUuid(req.authUser.id)) {
      try {
        const linkUuid = isPersistableUuid(id) ? id : null;
        const ins = await dbQuery(
          `INSERT INTO flock_mortality_events (flock_id, laborer_id, at, count, is_emergency, photos, notes, linked_checkin_id, source, affects_live_count)
           VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4, $5, $6::jsonb, $7, $8::uuid, $9, $10)
           RETURNING id::text AS id`,
          [
            f.id,
            req.authUser.id,
            at,
            mortalityAtCheckin,
            false,
            JSON.stringify(photos.slice(0, 2)),
            mortRow.notes,
            linkUuid,
            "round_checkin",
            affectsLiveCount,
          ]
        );
        const mr = ins.rows[0]?.id;
        if (mr) {
          mid = String(mr);
          mortRow.id = mid;
        }
        linkedMortalitySavedToDb = true;
      } catch (e) {
        console.error("[ERROR]", "[db] round-checkin mortality:", e instanceof Error ? e.message : e);
        res.status(503).json({ error: "Could not save mortality linked to check-in." });
        return;
      }
    }
    if (linkedMortalitySavedToDb) {
      try {
        await syncMortalityEventsFromDb();
      } catch (syncErr) {
        console.error("[ERROR]", "[db] syncMortalityEventsFromDb after check-in mortality:", syncErr instanceof Error ? syncErr.message : syncErr);
      }
    } else {
      mortalityEvents.push(mortRow);
    }
    appendAudit(req.authUser.id, req.authUser.role, "farm.mortality.create", "flock", f.id, {
      mortalityId: mid,
      count: mortalityAtCheckin,
      affectsLiveCount,
    });
  }
  const statusOut =
    derivedStatus
    ?? ((await checkinStatusPayloadWithFcrHint(f.id, req.authUser?.role ?? null))
      ?? checkinStatusPayload(f, req.authUser?.role ?? null));
  res.json({
    ok: true,
    checkin: row,
    flockDay: flockAgeDays(f, new Date(at)),
    status: statusOut,
    payrollImpact,
    payrollSaved,
  });
});

app.post("/api/flocks/:id/feed-entries", requireAuth, requireFarmAccess, requirePageAccess("farm_feed"), requireAction("flock.view"), async (req, res) => {
  const flockId = String(req.params.id ?? "").trim();
  const f = flocksById.get(flockId);
  if (!f) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  const parsed = feedEntrySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid feed entry" });
    return;
  }
  const { feedKg, notes } = parsed.data;
  let atIso = new Date().toISOString();
  const recRaw = parsed.data.recordedAt;
  if (recRaw) {
    const p = parseOptionalIsoDate(recRaw);
    if (p) atIso = p;
  }
  const submissionStatus = needsApproval(req.authUser) ? "pending_review" : "approved";
  let id = `ffe_${crypto.randomBytes(8).toString("hex")}`;
  const row = {
    id,
    flockId: f.id,
    recordedAt: atIso,
    feedKg,
    notes: notes ?? "",
    enteredByUserId: req.authUser.id,
    submissionStatus,
  };
  let feedSavedToDb = false;
  if (hasDb()) {
    try {
      const ins = await dbQuery(
        `INSERT INTO flock_feed_entries (flock_id, recorded_at, feed_kg, notes, entered_by_user_id, submission_status)
         VALUES ($1::uuid, $2::timestamptz, $3::numeric, $4, $5::uuid, $6)
         RETURNING id::text AS id, recorded_at AS "recordedAt"`,
        [f.id, atIso, feedKg, notes && String(notes).trim() ? String(notes).slice(0, 4000) : null, req.authUser.id, submissionStatus]
      );
      const r0 = ins.rows[0];
      id = String(r0?.id ?? id);
      const ra = r0?.recordedAt;
      row.id = id;
      row.recordedAt = ra instanceof Date ? ra.toISOString() : String(ra ?? atIso);
      feedSavedToDb = true;
    } catch (e) {
      console.error("[ERROR]", "[db] POST /api/flocks/:id/feed-entries:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Could not save feed entry." });
      return;
    }
  }
  if (feedSavedToDb) {
    try {
      await syncFlockFeedEntriesFromDb();
    } catch (syncErr) {
      console.error("[ERROR]", "[db] syncFlockFeedEntriesFromDb after feed entry:", syncErr instanceof Error ? syncErr.message : syncErr);
    }
  } else {
    flockFeedEntries.push(row);
  }
  const { payrollImpact, payrollSaved } = await maybeAutoPayrollForSubmit(
    req.authUser,
    f.id,
    "feed_entry",
    id,
    row.recordedAt,
  );
  appendAudit(req.authUser.id, req.authUser.role, "farm.feed_entry.create", "flock", f.id, {
    feedEntryId: row.id,
    feedKg,
    submissionStatus,
  });
  const summary = await buildFlockPerformanceSummary(f.id);
  res.json({
    ok: true,
    entry: { id: row.id, recordedAt: row.recordedAt, feedKg: row.feedKg, notes: row.notes, submissionStatus },
    feedToDateKg: summary?.feedToDateKg ?? Number(totalFeedKgForFlock(f.id).toFixed(2)),
    payrollImpact,
    payrollSaved,
  });
});

app.get("/api/flocks/:id/feed-entries", requireAuth, requireFarmAccess, requirePageAccess("farm_feed"), requireAction("flock.view"), async (req, res) => {
  const flockId = String(req.params.id ?? "").trim();
  const f = flocksById.get(flockId);
  if (!f) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 40));
  const list = flockFeedEntries
    .filter((e) => sameFlockId(e.flockId, flockId))
    .sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1))
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      recordedAt: e.recordedAt,
      feedKg: e.feedKg,
      notes: e.notes,
      submissionStatus: e.submissionStatus ?? "approved",
    }));
  res.json({ entries: list, feedToDateKg: Number(totalFeedKgForFlock(flockId).toFixed(2)) });
});

app.post("/api/flocks/:id/mortality-events", requireAuth, requireFarmAccess, requirePageAccess("farm_mortality_log"), requireAction("mortality.record"), async (req, res) => {
  const f = flocksById.get(req.params.id);
  if (!f) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  const body = req.body ?? {};
  const photos = Array.isArray(body.photos) ? body.photos.filter((p) => typeof p === "string" && p.length > 40) : [];
  if (photos.length < 1) {
    res.status(400).json({ error: "At least one mortality photo is required" });
    return;
  }
  const uploadError = validateImageDataUrls(photos);
  if (uploadError) {
    res.status(400).json({ error: uploadError });
    return;
  }
  const count = Math.max(1, Number(body.count) || 0);
  if (!Number.isFinite(count)) {
    res.status(400).json({ error: "Invalid count" });
    return;
  }
  const isEmergency = Boolean(body.isEmergency);
  const notes = String(body.notes ?? "").slice(0, 4000);
  const linkedCheckinId = body.linkedCheckinId ? String(body.linkedCheckinId) : null;

  // FIX: duplicate mortality debounce — same flock/day/cause pattern within 5 minutes
  const dayKey = new Date().toISOString().slice(0, 10);
  const dedupeKey = `${f.id}|${req.authUser.id}|${dayKey}|${isEmergency}|${count}|${notes.slice(0, 120)}`;
  const prev = mortalityRecentByKey.get(dedupeKey);
  const nowMs = Date.now();
  if (prev != null && nowMs - prev < MORTALITY_DEBOUNCE_MS) {
    res.status(409).json({
      error: "Duplicate mortality entry",
      code: "MORTALITY_DUPLICATE_WITHIN_WINDOW",
      hint: "Wait a few minutes or change details before resubmitting.",
    });
    return;
  }

  const submissionStatus = needsApproval(req.authUser) ? "pending_review" : "approved";
  let id = `mort_${crypto.randomBytes(8).toString("hex")}`;
  const at = new Date().toISOString();
  const row = {
    id,
    flockId: f.id,
    laborerId: req.authUser.id,
    at,
    count,
    isEmergency,
    photos,
    notes,
    linkedCheckinId,
    source: linkedCheckinId ? "linked" : isEmergency ? "emergency" : "adhoc",
    submissionStatus,
    affectsLiveCount: true,
  };
  let mortalitySavedToDb = false;
  if (hasDb() && isPersistableUuid(f.id) && isPersistableUuid(req.authUser.id)) {
    try {
      const linkUuid =
        linkedCheckinId && isPersistableUuid(String(linkedCheckinId)) ? String(linkedCheckinId) : null;
      const ins = await dbQuery(
        `INSERT INTO flock_mortality_events (flock_id, laborer_id, at, count, is_emergency, photos, notes, linked_checkin_id, source, submission_status, affects_live_count)
         VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4, $5, $6::jsonb, $7, $8::uuid, $9, $10, $11)
         RETURNING id::text AS id`,
        [
          f.id,
          req.authUser.id,
          at,
          count,
          isEmergency,
          JSON.stringify(photos),
          notes && notes.trim() ? notes.slice(0, 4000) : null,
          linkUuid,
          row.source,
          submissionStatus,
          row.affectsLiveCount,
        ]
      );
      const rid = ins.rows[0]?.id;
      if (rid) {
        id = String(rid);
        row.id = id;
      }
      mortalitySavedToDb = true;
    } catch (e) {
      console.error("[ERROR]", "[db] POST mortality-events:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Could not save mortality event." });
      return;
    }
  }
  if (mortalitySavedToDb) {
    try {
      await syncMortalityEventsFromDb();
    } catch (syncErr) {
      console.error("[ERROR]", "[db] syncMortalityEventsFromDb after mortality POST:", syncErr instanceof Error ? syncErr.message : syncErr);
    }
  } else {
    mortalityEvents.push(row);
  }
  mortalityRecentByKey.set(dedupeKey, nowMs);
  appendAudit(req.authUser.id, req.authUser.role, "farm.mortality.create", "flock", f.id, {
    mortalityId: id,
    count,
    isEmergency,
    submissionStatus,
  });
  const processed = await handleMortalityLog({
    flockId: f.id,
    mortalityId: id,
    submissionStatus,
    role: req.authUser?.role ?? null,
  });
  res.json({
    ok: true,
    mortality: row,
    status: processed.status ?? checkinStatusPayload(f, req.authUser?.role ?? null),
    performance: processed.performance ?? null,
    payrollImpact: null,
  });
});

app.get("/api/flocks/:id/mortality-events", requireAuth, requireFarmAccess, requirePageAccess("farm_mortality"), (req, res) => {
  const f = flocksById.get(req.params.id);
  if (!f) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  const list = mortalityEvents
    .filter((m) => String(m.flockId) === String(f.id))
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .map((m) => ({
      ...m,
      submissionStatus: m.submissionStatus ?? "approved",
      affectsLiveCount: m.affectsLiveCount ?? true,
    }));
  res.json({ events: list });
});

app.get("/api/flocks/:id/round-checkins", requireAuth, requireFarmAccess, requirePageAccess("farm_checkin"), (req, res) => {
  const f = flocksById.get(req.params.id);
  if (!f) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  const list = roundCheckins
    .filter((c) => sameFlockId(c.flockId, f.id))
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .map((c) => ({
      ...c,
      submissionStatus: c.submissionStatus ?? "approved",
    }));
  res.json({ checkins: list });
});

app.get("/api/check-ins/pending", requireAuth, requireFarmAccess, requirePageAccess("farm_checkin_review"), requireLeadVetUp, async (req, res) => {
  const flockId = req.query.flockId ? String(req.query.flockId) : null;
  const memPending = roundCheckins.filter((c) => (c.submissionStatus ?? "approved") === "pending_review");
  if (hasDb()) {
    try {
      let sql = `SELECT c.id::text AS id, c.flock_id::text AS "flockId", c.laborer_id::text AS "laborerId",
                        c.at, c.submission_status AS "submissionStatus",
                        COALESCE(c.feed_available, false) AS "feedAvailable",
                        COALESCE(c.water_available, false) AS "waterAvailable",
                        COALESCE(c.notes, '') AS notes,
                        COALESCE(u.full_name, u.email, '') AS "laborerName",
                        f.code AS "flockCode"
                   FROM check_ins c
                   LEFT JOIN users u ON u.id = c.laborer_id
                   LEFT JOIN poultry_flocks f ON f.id = c.flock_id
                  WHERE c.submission_status = 'pending_review'`;
      const params = [];
      if (flockId) {
        params.push(flockId);
        sql += ` AND c.flock_id = $${params.length}::uuid`;
      }
      sql += ` ORDER BY c.at DESC LIMIT 200`;
      const r = await dbQuery(sql, params);
      const merged = [...r.rows, ...memPending]
        .filter((c) => (flockId ? String(c.flockId) === flockId : true))
        .sort((a, b) => (String(a.at) < String(b.at) ? 1 : -1))
        .slice(0, 200);
      res.json({ checkins: merged });
      return;
    } catch (e) {
      console.error("[ERROR]", "[db] GET check-ins/pending:", e instanceof Error ? e.message : e);
    }
  }
  let list = memPending;
  if (flockId) list = list.filter((c) => String(c.flockId) === flockId);
  res.json({
    checkins: list.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 200),
  });
});

app.patch("/api/check-ins/:id/review", requireAuth, requireFarmAccess, requirePageAccess("farm_checkin_review"), requireLeadVetUp, async (req, res) => {
  const checkinId = String(req.params.id);
  const action = String(req.body?.action ?? "");
  if (action !== "approve" && action !== "reject") {
    res.status(400).json({ error: "action must be 'approve' or 'reject'" });
    return;
  }
  const reviewNotes = String(req.body?.reviewNotes ?? "").slice(0, 4000) || null;
  const newStatus = action === "approve" ? "approved" : "rejected";
  if (hasDb() && isPersistableUuid(checkinId)) {
    try {
      const r = await dbQuery(
        `UPDATE check_ins
            SET submission_status = $1,
                reviewed_by_user_id = $2::uuid,
                reviewed_at = now(),
                review_notes = $3
          WHERE id = $4::uuid AND submission_status = 'pending_review'
          RETURNING id::text AS id`,
        [newStatus, req.authUser.id, reviewNotes, checkinId]
      );
      if (r.rowCount === 0) {
        res.status(404).json({ error: "Check-in not found or already reviewed" });
        return;
      }
    } catch (e) {
      console.error("[ERROR]", "[db] PATCH check-ins review:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Could not update check-in." });
      return;
    }
    try {
      await syncCheckInsFromDb();
    } catch (e) {
      console.error("[ERROR]", "syncCheckInsFromDb after review:", e instanceof Error ? e.message : e);
    }
  }
  const mem = roundCheckins.find((c) => String(c.id) === checkinId);
  if (mem) {
    mem.submissionStatus = newStatus;
    mem.reviewedByUserId = req.authUser.id;
    mem.reviewedAt = new Date().toISOString();
    mem.reviewNotes = reviewNotes;
  }
  if (action === "approve" && mem) {
    const workerUser = usersById.get(mem.laborerId);
    if (workerUser) {
      await maybeAutoPayrollForSubmit(workerUser, mem.flockId, "check_in", checkinId, mem.at);
    } else {
      console.warn("[WARN] check-in approve: laborer not in usersById", mem.laborerId);
    }
  }
  if (action === "reject") {
    await removePayrollImpactByLog(checkinId, "check_in");
  }
  appendAudit(req.authUser.id, req.authUser.role, `farm.check_in.${action}`, "check_in", checkinId, { reviewNotes });
  res.json({ ok: true, status: newStatus });
});

// ── Feed entries: pending review queue + review action ──

app.get("/api/feed-entries/pending", requireAuth, requireFarmAccess, requireLeadVetUp, async (req, res) => {
  const flockId = req.query.flockId ? String(req.query.flockId) : null;
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;
  if (hasDb()) {
    try {
      let sql = `SELECT e.id::text AS id, e.flock_id AS "flockId", e.recorded_at AS "recordedAt",
                        e.feed_kg AS "feedKg", e.notes, e.entered_by_user_id AS "enteredByUserId",
                        e.submission_status AS "submissionStatus", u.name AS "enteredByName"
                   FROM flock_feed_entries e
                   LEFT JOIN users u ON u.id = e.entered_by_user_id
                  WHERE e.submission_status = 'pending_review'`;
      const params = [];
      if (flockId) { params.push(flockId); sql += ` AND e.flock_id = $${params.length}::uuid`; }
      if (from) { params.push(from); sql += ` AND e.recorded_at >= $${params.length}::timestamptz`; }
      if (to) { params.push(to); sql += ` AND e.recorded_at <= $${params.length}::timestamptz`; }
      sql += ` ORDER BY e.recorded_at DESC LIMIT 200`;
      const r = await dbQuery(sql, params);
      res.json({ entries: r.rows });
      return;
    } catch (e) {
      console.error("[ERROR]", "[db] GET feed-entries/pending:", e instanceof Error ? e.message : e);
    }
  }
  let entries = flockFeedEntries.filter((e) => (e.submissionStatus ?? "approved") === "pending_review");
  if (flockId) entries = entries.filter((e) => sameFlockId(e.flockId, flockId));
  res.json({ entries: entries.sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1)).slice(0, 200) });
});

app.patch("/api/feed-entries/:id/review", requireAuth, requireFarmAccess, requireLeadVetUp, async (req, res) => {
  const entryId = String(req.params.id);
  const action = String(req.body?.action ?? "");
  if (action !== "approve" && action !== "reject") {
    res.status(400).json({ error: "action must be 'approve' or 'reject'" });
    return;
  }
  const reviewNotes = String(req.body?.reviewNotes ?? "").slice(0, 4000) || null;
  const newStatus = action === "approve" ? "approved" : "rejected";
  if (hasDb()) {
    try {
      const r = await dbQuery(
        `UPDATE flock_feed_entries
            SET submission_status = $1, reviewed_by_user_id = $2::uuid, reviewed_at = now(), review_notes = $3
          WHERE id = $4::uuid AND submission_status = 'pending_review'
          RETURNING id::text AS id`,
        [newStatus, req.authUser.id, reviewNotes, entryId]
      );
      if (r.rowCount === 0) {
        res.status(404).json({ error: "Entry not found or already reviewed" });
        return;
      }
    } catch (e) {
      console.error("[ERROR]", "[db] PATCH feed-entries review:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Could not update feed entry." });
      return;
    }
  }
  const mem = flockFeedEntries.find((e) => String(e.id) === entryId);
  if (mem) {
    mem.submissionStatus = newStatus;
    mem.reviewedByUserId = req.authUser.id;
    mem.reviewedAt = new Date().toISOString();
    mem.reviewNotes = reviewNotes;
  }
  appendAudit(req.authUser.id, req.authUser.role, `farm.feed_entry.${action}`, "feed_entry", entryId, { reviewNotes });
  res.json({ ok: true, status: newStatus });
});

// ── Mortality events: pending review queue + review action ──

app.get("/api/mortality-events/pending", requireAuth, requireFarmAccess, requireLeadVetUp, async (req, res) => {
  const flockId = req.query.flockId ? String(req.query.flockId) : null;
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;
  if (hasDb()) {
    try {
      let sql = `SELECT e.id::text AS id, e.flock_id AS "flockId", e.laborer_id AS "laborerId",
                        e.at, e.count, e.is_emergency AS "isEmergency", e.notes,
                        e.submission_status AS "submissionStatus", u.name AS "reportedByName"
                   FROM flock_mortality_events e
                   LEFT JOIN users u ON u.id = e.laborer_id
                  WHERE e.submission_status = 'pending_review'`;
      const params = [];
      if (flockId) { params.push(flockId); sql += ` AND e.flock_id = $${params.length}::uuid`; }
      if (from) { params.push(from); sql += ` AND e.at >= $${params.length}::timestamptz`; }
      if (to) { params.push(to); sql += ` AND e.at <= $${params.length}::timestamptz`; }
      sql += ` ORDER BY e.at DESC LIMIT 200`;
      const r = await dbQuery(sql, params);
      res.json({ events: r.rows });
      return;
    } catch (e) {
      console.error("[ERROR]", "[db] GET mortality-events/pending:", e instanceof Error ? e.message : e);
    }
  }
  let events = mortalityEvents.filter((e) => (e.submissionStatus ?? "approved") === "pending_review");
  if (flockId) events = events.filter((e) => sameFlockId(e.flockId, flockId));
  res.json({ events: events.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 200) });
});

app.patch("/api/mortality-events/:id/review", requireAuth, requireFarmAccess, requireLeadVetUp, async (req, res) => {
  const eventId = String(req.params.id);
  const action = String(req.body?.action ?? "");
  if (action !== "approve" && action !== "reject") {
    res.status(400).json({ error: "action must be 'approve' or 'reject'" });
    return;
  }
  const reviewNotes = String(req.body?.reviewNotes ?? "").slice(0, 4000) || null;
  const newStatus = action === "approve" ? "approved" : "rejected";
  const affectsLiveCount = action === "approve";
  let reviewedFlockId = null;
  if (hasDb()) {
    try {
      const r = await dbQuery(
        `UPDATE flock_mortality_events
            SET submission_status = $1, reviewed_by_user_id = $2::uuid, reviewed_at = now(),
                review_notes = $3, affects_live_count = $4
          WHERE id = $5::uuid AND submission_status = 'pending_review'
          RETURNING id::text AS id, flock_id::text AS "flockId"`,
        [newStatus, req.authUser.id, reviewNotes, affectsLiveCount, eventId]
      );
      if (r.rowCount === 0) {
        res.status(404).json({ error: "Event not found or already reviewed" });
        return;
      }
      reviewedFlockId = r.rows[0]?.flockId ? String(r.rows[0].flockId) : null;
    } catch (e) {
      console.error("[ERROR]", "[db] PATCH mortality-events review:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Could not update mortality event." });
      return;
    }
  }
  const mem = mortalityEvents.find((e) => String(e.id) === eventId);
  if (mem) {
    mem.submissionStatus = newStatus;
    mem.affectsLiveCount = affectsLiveCount;
    mem.reviewedByUserId = req.authUser.id;
    mem.reviewedAt = new Date().toISOString();
    mem.reviewNotes = reviewNotes;
  }
  appendAudit(req.authUser.id, req.authUser.role, `farm.mortality.${action}`, "mortality_event", eventId, { reviewNotes });
  const processed = await handleMortalityLog({
    flockId: mem?.flockId ?? reviewedFlockId ?? "",
    mortalityId: eventId,
    submissionStatus: newStatus,
    role: req.authUser?.role ?? null,
  });
  res.json({
    ok: true,
    status: newStatus,
    affectsLiveCount,
    flockStatus: processed.status ?? null,
    performance: processed.performance ?? null,
  });
});

// ── Vet logs (replaces daily logs for vet+ roles) ──

app.post("/api/vet-logs", requireAuth, requireFarmAccess, requirePageAccess("farm_vet_logs"), async (req, res) => {
  if (!isVetOrAbove(req.authUser)) {
    res.status(403).json({ error: "Only vet or above can create vet logs" });
    return;
  }
  const parsed = vetLogSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid vet log payload" });
    return;
  }
  const { flockId, logDate, observations, actionsTaken, recommendations } = parsed.data;
  const f = flocksById.get(flockId);
  if (!f) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  const submissionStatus = needsApproval(req.authUser) ? "pending_review" : "approved";
  let id = `vl_${crypto.randomBytes(8).toString("hex")}`;
  const now = new Date().toISOString();
  const row = {
    id,
    flockId,
    authorUserId: req.authUser.id,
    logDate: String(logDate).slice(0, 10),
    observations: observations ?? null,
    actionsTaken: actionsTaken ?? null,
    recommendations: recommendations ?? null,
    submissionStatus,
    createdAt: now,
    updatedAt: now,
  };
  let vetLogSavedToDb = false;
  if (hasDb() && isPersistableUuid(flockId) && isPersistableUuid(req.authUser.id)) {
    try {
      const ins = await dbQuery(
        `INSERT INTO farm_vet_logs (flock_id, author_user_id, log_date, observations, actions_taken, recommendations, submission_status)
         VALUES ($1::uuid, $2::uuid, $3::date, $4, $5, $6, $7)
         RETURNING id::text AS id, created_at AS "createdAt"`,
        [flockId, req.authUser.id, row.logDate, row.observations, row.actionsTaken, row.recommendations, submissionStatus]
      );
      const r0 = ins.rows[0];
      if (r0?.id) { row.id = String(r0.id); id = row.id; }
      if (r0?.createdAt) row.createdAt = r0.createdAt instanceof Date ? r0.createdAt.toISOString() : String(r0.createdAt);
      vetLogSavedToDb = true;
    } catch (e) {
      console.error("[ERROR]", "[db] POST /api/vet-logs:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Could not save vet log." });
      return;
    }
  }
  if (!vetLogSavedToDb) {
    vetLogs.push(row);
  }
  appendAudit(req.authUser.id, req.authUser.role, "farm.vet_log.create", "flock", flockId, { vetLogId: id, submissionStatus });
  res.json({ ok: true, log: row });
});

app.get("/api/vet-logs", requireAuth, requireFarmAccess, requirePageAccess("farm_vet_logs"), async (req, res) => {
  if (!isVetOrAbove(req.authUser)) {
    res.status(403).json({ error: "Only vet or above can view vet logs" });
    return;
  }
  const flockId = req.query.flockId ? String(req.query.flockId) : null;
  const status = req.query.status ? String(req.query.status) : null;
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;
  const q = req.query.q ? String(req.query.q).toLowerCase() : null;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 40));
  const offset = (page - 1) * pageSize;
  if (hasDb()) {
    try {
      let sql = `SELECT v.id::text AS id, v.flock_id AS "flockId", v.author_user_id AS "authorUserId",
                        v.log_date AS "logDate", v.observations, v.actions_taken AS "actionsTaken",
                        v.recommendations, v.submission_status AS "submissionStatus",
                        v.reviewed_by_user_id AS "reviewedByUserId", v.reviewed_at AS "reviewedAt",
                        v.review_notes AS "reviewNotes", v.created_at AS "createdAt",
                        u.name AS "authorName"
                   FROM farm_vet_logs v
                   LEFT JOIN users u ON u.id = v.author_user_id
                  WHERE 1=1`;
      const params = [];
      if (flockId) { params.push(flockId); sql += ` AND v.flock_id = $${params.length}::uuid`; }
      if (status) { params.push(status); sql += ` AND v.submission_status = $${params.length}`; }
      if (from) { params.push(from); sql += ` AND v.log_date >= $${params.length}::date`; }
      if (to) { params.push(to); sql += ` AND v.log_date <= $${params.length}::date`; }
      if (q) { params.push(`%${q}%`); sql += ` AND (v.observations ILIKE $${params.length} OR v.actions_taken ILIKE $${params.length} OR v.recommendations ILIKE $${params.length})`; }
      const countSql = sql.replace(/SELECT[\s\S]+?FROM/, "SELECT count(*)::int AS total FROM");
      const countR = await dbQuery(countSql, params);
      const total = countR.rows[0]?.total ?? 0;
      sql += ` ORDER BY v.log_date DESC, v.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(pageSize, offset);
      const r = await dbQuery(sql, params);
      res.json({ logs: r.rows, total, page, pageSize });
      return;
    } catch (e) {
      console.error("[ERROR]", "[db] GET /api/vet-logs:", e instanceof Error ? e.message : e);
    }
  }
  let logs = [...vetLogs];
  if (flockId) logs = logs.filter((l) => sameFlockId(l.flockId, flockId));
  if (status) logs = logs.filter((l) => l.submissionStatus === status);
  if (q) logs = logs.filter((l) => [l.observations, l.actionsTaken, l.recommendations].some((s) => s && String(s).toLowerCase().includes(q)));
  logs.sort((a, b) => (a.logDate < b.logDate ? 1 : -1));
  const total = logs.length;
  res.json({ logs: logs.slice(offset, offset + pageSize), total, page, pageSize });
});

app.patch("/api/vet-logs/:id/review", requireAuth, requireFarmAccess, requireLeadVetUp, async (req, res) => {
  const logId = String(req.params.id);
  const action = String(req.body?.action ?? "");
  if (action !== "approve" && action !== "reject") {
    res.status(400).json({ error: "action must be 'approve' or 'reject'" });
    return;
  }
  const reviewNotes = String(req.body?.reviewNotes ?? "").slice(0, 4000) || null;
  const newStatus = action === "approve" ? "approved" : "rejected";
  if (hasDb()) {
    try {
      const r = await dbQuery(
        `UPDATE farm_vet_logs
            SET submission_status = $1, reviewed_by_user_id = $2::uuid, reviewed_at = now(), review_notes = $3, updated_at = now()
          WHERE id = $4::uuid AND submission_status = 'pending_review'
          RETURNING id::text AS id`,
        [newStatus, req.authUser.id, reviewNotes, logId]
      );
      if (r.rowCount === 0) {
        res.status(404).json({ error: "Vet log not found or already reviewed" });
        return;
      }
    } catch (e) {
      console.error("[ERROR]", "[db] PATCH vet-logs review:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Could not update vet log." });
      return;
    }
  }
  const mem = vetLogs.find((l) => String(l.id) === logId);
  if (mem) {
    mem.submissionStatus = newStatus;
    mem.reviewedByUserId = req.authUser.id;
    mem.reviewedAt = new Date().toISOString();
    mem.reviewNotes = reviewNotes;
    mem.updatedAt = new Date().toISOString();
  }
  appendAudit(req.authUser.id, req.authUser.role, `farm.vet_log.${action}`, "vet_log", logId, { reviewNotes });
  res.json({ ok: true, status: newStatus });
});

// ── Report CSV exports ──

app.get("/api/reports/mortality.csv", requireAuth, requireFarmAccess, requireLeadVetUp, async (req, res) => {
  const flockId = req.query.flockId ? String(req.query.flockId) : null;
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;
  const status = req.query.status ? String(req.query.status) : null;
  const includeSlaughtered = req.query.includeSlaughtered === "true";
  if (hasDb()) {
    try {
      let sql = `SELECT e.id, e.flock_id, f.flock_code, e.at, e.count, e.is_emergency,
                        e.source, e.notes, e.submission_status, e.affects_live_count,
                        u.name AS reported_by, e.review_notes
                   FROM flock_mortality_events e
                   JOIN poultry_flocks f ON f.id = e.flock_id
                   LEFT JOIN users u ON u.id = e.laborer_id
                  WHERE 1=1`;
      const params = [];
      if (flockId) { params.push(flockId); sql += ` AND e.flock_id = $${params.length}::uuid`; }
      if (from) { params.push(from); sql += ` AND e.at >= $${params.length}::timestamptz`; }
      if (to) { params.push(to); sql += ` AND e.at <= $${params.length}::timestamptz`; }
      if (status) { params.push(status); sql += ` AND e.submission_status = $${params.length}`; }
      if (!includeSlaughtered) sql += ` AND f.status != 'slaughtered'`;
      sql += ` ORDER BY e.at DESC LIMIT 5000`;
      const r = await dbQuery(sql, params);
      const header = "id,flock_id,flock_code,at,count,is_emergency,source,notes,submission_status,affects_live_count,reported_by,review_notes";
      const csvRows = r.rows.map((row) =>
        [row.id, row.flock_id, row.flock_code, row.at, row.count, row.is_emergency, row.source, `"${String(row.notes ?? "").replace(/"/g, '""')}"`, row.submission_status, row.affects_live_count, row.reported_by, `"${String(row.review_notes ?? "").replace(/"/g, '""')}"`].join(",")
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=mortality_report.csv");
      res.send([header, ...csvRows].join("\n"));
      return;
    } catch (e) {
      console.error("[ERROR]", "[db] GET /api/reports/mortality.csv:", e instanceof Error ? e.message : e);
    }
  }
  res.status(503).json({ error: "Database required for CSV export" });
});

app.get("/api/reports/feed-inventory.csv", requireAuth, requireFarmAccess, requireLeadVetUp, async (req, res) => {
  const flockId = req.query.flockId ? String(req.query.flockId) : null;
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;
  if (hasDb()) {
    try {
      let sql = `SELECT e.id, e.flock_id, f.flock_code, e.recorded_at, e.feed_kg,
                        e.notes, e.submission_status, u.name AS entered_by, e.review_notes
                   FROM flock_feed_entries e
                   JOIN poultry_flocks f ON f.id = e.flock_id
                   LEFT JOIN users u ON u.id = e.entered_by_user_id
                  WHERE 1=1`;
      const params = [];
      if (flockId) { params.push(flockId); sql += ` AND e.flock_id = $${params.length}::uuid`; }
      if (from) { params.push(from); sql += ` AND e.recorded_at >= $${params.length}::timestamptz`; }
      if (to) { params.push(to); sql += ` AND e.recorded_at <= $${params.length}::timestamptz`; }
      sql += ` ORDER BY e.recorded_at DESC LIMIT 5000`;
      const r = await dbQuery(sql, params);
      const header = "id,flock_id,flock_code,recorded_at,feed_kg,notes,submission_status,entered_by,review_notes";
      const csvRows = r.rows.map((row) =>
        [row.id, row.flock_id, row.flock_code, row.recorded_at, row.feed_kg, `"${String(row.notes ?? "").replace(/"/g, '""')}"`, row.submission_status, row.entered_by, `"${String(row.review_notes ?? "").replace(/"/g, '""')}"`].join(",")
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=feed_inventory_report.csv");
      res.send([header, ...csvRows].join("\n"));
      return;
    } catch (e) {
      console.error("[ERROR]", "[db] GET /api/reports/feed-inventory.csv:", e instanceof Error ? e.message : e);
    }
  }
  res.status(503).json({ error: "Database required for CSV export" });
});

app.get("/api/reports/medicine-tracking.csv", requireAuth, requireFarmAccess, requireLeadVetUp, async (req, res) => {
  const flockId = req.query.flockId ? String(req.query.flockId) : null;
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;
  if (hasDb()) {
    try {
      let sql = `SELECT t.id, t.flock_id, f.flock_code, t.at, t.disease_or_reason, t.medicine_name,
                        t.dosage_value, t.dosage_unit, t.route, t.notes, u.name AS administered_by
                   FROM poultry_treatments t
                   JOIN poultry_flocks f ON f.id = t.flock_id
                   LEFT JOIN users u ON u.id = t.administered_by_user_id
                  WHERE 1=1`;
      const params = [];
      if (flockId) { params.push(flockId); sql += ` AND t.flock_id = $${params.length}::uuid`; }
      if (from) { params.push(from); sql += ` AND t.at >= $${params.length}::timestamptz`; }
      if (to) { params.push(to); sql += ` AND t.at <= $${params.length}::timestamptz`; }
      sql += ` ORDER BY t.at DESC LIMIT 5000`;
      const r = await dbQuery(sql, params);
      const header = "id,flock_id,flock_code,at,disease_or_reason,medicine_name,dosage_value,dosage_unit,route,notes,administered_by";
      const csvRows = r.rows.map((row) =>
        [row.id, row.flock_id, row.flock_code, row.at, `"${String(row.disease_or_reason ?? "").replace(/"/g, '""')}"`, `"${String(row.medicine_name ?? "").replace(/"/g, '""')}"`, row.dosage_value, row.dosage_unit, row.route, `"${String(row.notes ?? "").replace(/"/g, '""')}"`, row.administered_by].join(",")
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=medicine_tracking_report.csv");
      res.send([header, ...csvRows].join("\n"));
      return;
    } catch (e) {
      console.error("[ERROR]", "[db] GET /api/reports/medicine-tracking.csv:", e instanceof Error ? e.message : e);
    }
  }
  res.status(503).json({ error: "Database required for CSV export" });
});

app.get("/api/reports/flocks.csv", requireAuth, requireFarmAccess, requireLeadVetUp, async (_req, res) => {
  if (hasDb()) {
    try {
      const r = await dbQuery(
        `SELECT f.id, f.flock_code, f.breed_code, f.placement_date, f.initial_count,
                f.status, f.target_weight_kg, f.created_at
           FROM poultry_flocks f
          ORDER BY f.placement_date DESC LIMIT 5000`
      );
      const header = "id,flock_code,breed_code,placement_date,initial_count,status,target_weight_kg,created_at";
      const csvRows = r.rows.map((row) =>
        [row.id, row.flock_code, row.breed_code, row.placement_date, row.initial_count, row.status, row.target_weight_kg ?? "", row.created_at].join(",")
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=flocks_report.csv");
      res.send([header, ...csvRows].join("\n"));
      return;
    } catch (e) {
      console.error("[ERROR]", "[db] GET /api/reports/flocks.csv:", e instanceof Error ? e.message : e);
    }
  }
  res.status(503).json({ error: "Database required for CSV export" });
});

async function listTreatmentsForFlock(flockId, startIso = null, endIso = null) {
  const fid = String(flockId);
  if (hasDb()) {
    try {
      const r = await dbQuery(
        `SELECT id, flock_id AS "flockId", at, disease_or_reason AS "diseaseOrReason", medicine_name AS "medicineName",
                reason_code AS "reasonCode", dose, dose_unit AS "doseUnit", route, duration_days AS "durationDays", withdrawal_days AS "withdrawalDays",
                notes, administered_by_user_id AS "administeredByUserId"
           FROM flock_treatments
          WHERE flock_id = $1
            AND ($2::timestamptz IS NULL OR at >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR at <= $3::timestamptz)
          ORDER BY at DESC`,
        [fid, startIso, endIso]
      );
      return r.rows;
    } catch (e) {
      console.error("[ERROR]", "[db] listTreatmentsForFlock failed:", e instanceof Error ? e.message : e);
      throw e;
    }
  }
  const startMs = startIso ? new Date(startIso).getTime() : Number.NEGATIVE_INFINITY;
  const endMs = endIso ? new Date(endIso).getTime() : Number.POSITIVE_INFINITY;
  return flockTreatments
    .filter(
      (t) =>
        sameFlockId(t.flockId, fid) &&
        new Date(t.at).getTime() >= startMs &&
        new Date(t.at).getTime() <= endMs,
    )
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

async function listSlaughterForFlock(flockId, startIso = null, endIso = null) {
  const fid = String(flockId);
  if (hasDb()) {
    try {
      const r = await dbQuery(
        `SELECT id, flock_id AS "flockId", at, birds_slaughtered AS "birdsSlaughtered",
                reason_code AS "reasonCode", avg_live_weight_kg AS "avgLiveWeightKg", avg_carcass_weight_kg AS "avgCarcassWeightKg",
                notes, entered_by_user_id AS "enteredByUserId"
           FROM flock_slaughter_events
          WHERE flock_id = $1
            AND ($2::timestamptz IS NULL OR at >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR at <= $3::timestamptz)
          ORDER BY at DESC`,
        [fid, startIso, endIso]
      );
      return r.rows;
    } catch (e) {
      console.error("[ERROR]", "[db] listSlaughterForFlock failed:", e instanceof Error ? e.message : e);
      throw e;
    }
  }
  const startMs = startIso ? new Date(startIso).getTime() : Number.NEGATIVE_INFINITY;
  const endMs = endIso ? new Date(endIso).getTime() : Number.POSITIVE_INFINITY;
  return slaughterEvents
    .filter(
      (s) =>
        sameFlockId(s.flockId, fid) &&
        new Date(s.at).getTime() >= startMs &&
        new Date(s.at).getTime() <= endMs,
    )
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

const BENCHMARK_CACHE = {
  expectedWeightByDay: [
    [0, 0.04],
    [7, 0.15],
    [14, 0.4],
    [21, 0.88],
    [28, 1.55],
    [35, 2.3],
    [42, 3.05],
  ],
  expectedMortalityByDay: [
    [0, 0],
    [7, 1.0],
    [14, 2.0],
    [21, 2.8],
    [28, 3.5],
    [35, 4.2],
    [42, 5.0],
  ],
  expectedFcrRangeByDay: [
    [14, [1.2, 1.6]],
    [21, [1.35, 1.8]],
    [28, [1.5, 1.95]],
    [35, [1.65, 2.1]],
    [42, [1.75, 2.25]],
    [50, [1.85, 2.4]],
  ],
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function interpolateCurve(curve, x) {
  if (!curve.length) return 0;
  const sorted = [...curve].sort((a, b) => Number(a[0]) - Number(b[0]));
  if (x <= sorted[0][0]) return Number(sorted[0][1]);
  if (x >= sorted[sorted.length - 1][0]) return Number(sorted[sorted.length - 1][1]);
  for (let i = 1; i < sorted.length; i += 1) {
    const [x1, y1] = sorted[i - 1];
    const [x2, y2] = sorted[i];
    if (x <= x2) {
      const t = (x - x1) / (x2 - x1 || 1);
      return Number(y1) + (Number(y2) - Number(y1)) * t;
    }
  }
  return Number(sorted[sorted.length - 1][1]);
}

function expectedFcrRangeForDay(day) {
  const curve = BENCHMARK_CACHE.expectedFcrRangeByDay;
  if (day <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i += 1) {
    if (day <= curve[i][0]) return curve[i][1];
  }
  return curve[curve.length - 1][1];
}

/**
 * Broiler cumulative FCR: kg feed to date / kg flock biomass gained since placement.
 * Gain = (live head × latest avg weight) − initial batch weight at placement.
 */
function computeBroilerFcrPack(flock, { feedToDate, birdsLiveEstimate, latestAvgWeightKg, latestWeighDate, ageDays }) {
  const [fcrTargetMin, fcrTargetMax] = expectedFcrRangeForDay(ageDays);
  const initialTotalWeightKg = initialTotalWeightKgForFlock(flock);
  if (latestAvgWeightKg == null || !Number.isFinite(latestAvgWeightKg) || latestAvgWeightKg <= 0) {
    return {
      fcrCumulative: null,
      reason: "no_weigh_in",
      fcrTargetMin,
      fcrTargetMax,
      ageDays,
      feedToDateKg: Number(feedToDate.toFixed(2)),
      weightGainedKg: null,
      initialTotalWeightKg: Number(initialTotalWeightKg.toFixed(3)),
      currentTotalBiomassKg: null,
      birdsLiveEstimate,
      latestWeighDate: latestWeighDate ?? null,
      status: "unknown",
      playbook: [],
    };
  }
  const currentTotalBiomassKg = birdsLiveEstimate * latestAvgWeightKg;
  const weightGainedKg = Math.max(0, currentTotalBiomassKg - initialTotalWeightKg);
  const fcrCumulative =
    weightGainedKg > 1e-9 ? feedToDate / weightGainedKg : null;
  let status = "on_track";
  if (fcrCumulative == null || !Number.isFinite(fcrCumulative)) {
    status = "unknown";
  } else if (fcrCumulative > fcrTargetMax * 1.08) {
    status = "warning";
  } else if (fcrCumulative > fcrTargetMax) {
    status = "watch";
  }
  const playbook =
    status === "warning" || status === "watch"
      ? [
        "Check feed wastage (spillage, flicking from trays).",
        "Confirm drinker flow and water quality.",
        "Review house temperature and ventilation (cold stress increases feed use for heat).",
      ]
      : [];
  return {
    fcrCumulative: fcrCumulative != null ? Number(fcrCumulative.toFixed(3)) : null,
    reason: fcrCumulative == null && weightGainedKg <= 1e-9 ? "no_weight_gain" : null,
    fcrTargetMin,
    fcrTargetMax,
    ageDays,
    feedToDateKg: Number(feedToDate.toFixed(2)),
    weightGainedKg: Number(weightGainedKg.toFixed(2)),
    initialTotalWeightKg: Number(initialTotalWeightKg.toFixed(3)),
    currentTotalBiomassKg: Number(currentTotalBiomassKg.toFixed(2)),
    birdsLiveEstimate,
    latestWeighDate: latestWeighDate ?? null,
    status,
    playbook,
  };
}

async function buildFlockPerformanceSummary(flockId, atIso = null) {
  const fid = String(flockId);
  const flock = flocksById.get(fid);
  if (!flock) return null;
  const cutoffMs = atIso ? new Date(atIso).getTime() : Number.POSITIVE_INFINITY;
  const feedToDate = totalFeedKgForFlock(fid, cutoffMs);
  const mortalityFromEvents = mortalityEvents
    .filter(
      (m) =>
        sameFlockId(m.flockId, fid) &&
        new Date(m.at).getTime() <= cutoffMs &&
        shouldCountMortalityForLiveEstimate(m),
    )
    .reduce((s, m) => s + (Number(m.count) || 0), 0);
  const mortalityFromDaily = dailyLogs
    .filter((log) => {
      if (!sameFlockId(log.flockId, fid)) return false;
      if (!shouldCountDailyLogMortality(log)) return false;
      const d = String(log.logDate ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
      const dayEndMs = new Date(`${d}T23:59:59.999Z`).getTime();
      return dayEndMs <= cutoffMs;
    })
    .reduce((s, log) => s + Math.max(0, Number(log.mortality) || 0), 0);
  const mortalityToDate = mortalityFromEvents + mortalityFromDaily;
  const slRows = await listSlaughterForFlock(fid);
  const slaughterToDate = slRows
    .filter((s) => new Date(s.at).getTime() <= cutoffMs)
    .reduce((sum, s) => sum + (Number(s.birdsSlaughtered) || 0), 0);
  const computedBirdsLive = Math.max(0, (Number(flock.initialCount) || 0) - mortalityToDate - slaughterToDate);
  const v = flock.verifiedLiveCount;
  const birdsLiveEstimate =
    v != null && Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : computedBirdsLive;
  const latestSlaughter = slRows
    .filter((s) => new Date(s.at).getTime() <= cutoffMs)
    .sort((a, b) => (a.at < b.at ? 1 : -1))[0] ?? null;
  const fcrSlaughter =
    latestSlaughter && latestSlaughter.birdsSlaughtered > 0 && latestSlaughter.avgLiveWeightKg > 0
      ? feedToDate / (latestSlaughter.birdsSlaughtered * latestSlaughter.avgLiveWeightKg)
      : null;

  /** DB column: feed_kg / (avg_weight_kg * sample_size) — sample biomass ratio, not cumulative FCR. */
  let fcrSampleBiomassRatio = null;
  let latestWeighIn = null;
  if (hasDb()) {
    try {
      const wr = await dbQuery(
        `SELECT id,
                weigh_date::text AS "weighDate",
                avg_weight_kg AS "avgWeightKg",
                fcr,
                variance_pct AS "variancePct",
                total_feed_used_kg AS "totalFeedUsedKg"
           FROM weigh_ins
          WHERE flock_id = $1
          ORDER BY weigh_date DESC, created_at DESC
          LIMIT 1`,
        [fid]
      );
      const row = wr.rows[0];
      if (row) {
        fcrSampleBiomassRatio = row.fcr != null ? Number(row.fcr) : null;
        latestWeighIn = {
          id: String(row.id),
          weighDate: String(row.weighDate ?? ""),
          avgWeightKg: Number(row.avgWeightKg),
          feedPerKgSampleBiomass: fcrSampleBiomassRatio,
          variancePct: row.variancePct != null ? Number(row.variancePct) : null,
          totalFeedUsedKg: row.totalFeedUsedKg != null ? Number(row.totalFeedUsedKg) : null,
        };
      }
    } catch (e) {
      console.error("[ERROR]", "[db] buildFlockPerformanceSummary weigh_ins:", e instanceof Error ? e.message : e);
    }
  }

  const ageDaysNow = flockAgeDays(flock, new Date());
  const fcrBroiler = computeBroilerFcrPack(flock, {
    feedToDate,
    birdsLiveEstimate,
    latestAvgWeightKg: latestWeighIn?.avgWeightKg ?? null,
    latestWeighDate: latestWeighIn?.weighDate ?? null,
    ageDays: ageDaysNow,
  });

  const fcr = fcrBroiler.fcrCumulative ?? fcrSlaughter ?? null;

  return {
    flockId: fid,
    placementDate: flock.placementDate,
    ageDays: ageDaysNow,
    feedToDateKg: Number(feedToDate.toFixed(2)),
    mortalityToDate,
    birdsLiveEstimate,
    computedBirdsLiveEstimate: computedBirdsLive,
    verifiedLiveCount: flock.verifiedLiveCount != null ? Math.floor(Number(flock.verifiedLiveCount)) : null,
    latestSlaughter,
    latestWeighIn,
    fcr,
    fcrBroiler,
    fcrSampleBiomassRatio,
    fcrSlaughter,
  };
}

app.post("/api/flocks/:id/treatments", requireAuth, requireFarmAccess, requirePageAccess("farm_treatments"), requireAction("treatment.execute"), requireTreatmentLogger, async (req, res) => {
  const f = flocksById.get(req.params.id);
  if (!f) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  const body = req.body ?? {};
  const medicineName = String(body.medicineName ?? "").trim();
  const reasonCode = String(body.reasonCode ?? "").trim() || "other";
  if (!systemConfig.validateAgainstCategory("treatment_reason", reasonCode, TREATMENT_REASON_CODES)) {
    res.status(400).json({ error: "Invalid reasonCode for treatment" });
    return;
  }
  const diseaseOrReason = String(body.diseaseOrReason ?? reasonCode).trim();
  const dose = Number(body.dose);
  const doseUnit = String(body.doseUnit ?? "").trim();
  const route = String(body.route ?? "").trim();
  if (!systemConfig.validateAgainstCategory("treatment_dose_unit", doseUnit, systemConfig.getStaticFallbackCodes("treatment_dose_unit"))) {
    res.status(400).json({ error: "Invalid doseUnit for treatment" });
    return;
  }
  if (!systemConfig.validateAgainstCategory("treatment_route", route, systemConfig.getStaticFallbackCodes("treatment_route"))) {
    res.status(400).json({ error: "Invalid route for treatment" });
    return;
  }
  const durationDays = Math.max(1, Number(body.durationDays) || 1);
  const withdrawalDays = Math.max(0, Number(body.withdrawalDays) || 0);
  const notes = String(body.notes ?? "").slice(0, 4000);
  if (!medicineName || !diseaseOrReason || !Number.isFinite(dose) || dose <= 0 || !doseUnit || !route) {
    res.status(400).json({ error: "medicineName, diseaseOrReason, dose, doseUnit, route are required" });
    return;
  }
  const row = {
    id: `trt_${crypto.randomBytes(6).toString("hex")}`,
    flockId: f.id,
    at: new Date().toISOString(),
    diseaseOrReason,
    medicineName,
    dose,
    doseUnit,
    route,
    durationDays,
    withdrawalDays,
    notes,
    administeredByUserId: req.authUser.id,
    reasonCode,
  };
  try {
    if (hasDb()) {
      await dbQuery(
        `INSERT INTO flock_treatments
          (id, flock_id, at, disease_or_reason, medicine_name, reason_code, dose, dose_unit, route, duration_days, withdrawal_days, notes, administered_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [row.id, row.flockId, row.at, row.diseaseOrReason, row.medicineName, row.reasonCode, row.dose, row.doseUnit, row.route, row.durationDays, row.withdrawalDays, row.notes, row.administeredByUserId]
      );
    } else {
      flockTreatments.unshift(row);
    }
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
    return;
  }
  appendAudit(req.authUser.id, req.authUser.role, "flock.treatment.create", "flock", f.id, { treatmentId: row.id });
  res.status(201).json({ treatment: row });
});

app.get("/api/flocks/:id/treatments", requireAuth, requireFarmAccess, requirePageAccess("farm_treatments"), requireAction("flock.view"), async (req, res) => {
  const f = flocksById.get(req.params.id);
  if (!f) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  const startIso = parseOptionalIsoDate(req.query.start_at);
  const endIso = parseOptionalIsoDate(req.query.end_at);
  try {
    const list = await listTreatmentsForFlock(f.id, startIso, endIso);
    res.json({ treatments: list });
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
  }
});

app.post("/api/flocks/:id/slaughter-events", requireAuth, requireFarmAccess, requirePageAccess("farm_slaughter"), requireAction("slaughter.record"), requireSlaughterEventLogger, async (req, res) => {
  const f = flocksById.get(req.params.id);
  if (!f) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  const body = req.body ?? {};
  const birdsSlaughtered = Number(body.birdsSlaughtered);
  const avgLiveWeightKg = Number(body.avgLiveWeightKg);
  const avgCarcassWeightKg =
    body.avgCarcassWeightKg == null || body.avgCarcassWeightKg === "" ? null : Number(body.avgCarcassWeightKg);
  const reasonCode = String(body.reasonCode ?? "").trim() || "planned_market";
  if (!systemConfig.validateAgainstCategory("slaughter_reason", reasonCode, SLAUGHTER_REASON_CODES)) {
    res.status(400).json({ error: "Invalid reasonCode for slaughter event" });
    return;
  }
  const notes = String(body.notes ?? reasonCode).slice(0, 4000);
  if (!Number.isFinite(birdsSlaughtered) || birdsSlaughtered <= 0 || !Number.isFinite(avgLiveWeightKg) || avgLiveWeightKg <= 0) {
    res.status(400).json({ error: "birdsSlaughtered and avgLiveWeightKg are required and must be > 0" });
    return;
  }
  const at = new Date().toISOString();
  let treatments = [];
  try {
    treatments = await listTreatmentsForFlock(f.id);
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
    return;
  }
  const activeWithdrawal = treatments.filter((t) => {
    const treatmentAt = new Date(t.at).getTime();
    const withdrawalMs = Math.max(0, Number(t.withdrawalDays) || 0) * 24 * 60 * 60 * 1000;
    return new Date(at).getTime() < treatmentAt + withdrawalMs;
  });
  if (activeWithdrawal.length > 0) {
    res.status(400).json({
      error: "Withdrawal period still active for this flock.",
      activeMedicines: activeWithdrawal.map((t) => ({
        medicineName: t.medicineName,
        withdrawalDays: t.withdrawalDays,
        treatmentAt: t.at,
      })),
    });
    return;
  }
  const row = {
    id: `slh_${crypto.randomBytes(6).toString("hex")}`,
    flockId: f.id,
    at,
    birdsSlaughtered,
    avgLiveWeightKg,
    avgCarcassWeightKg: Number.isFinite(avgCarcassWeightKg) ? avgCarcassWeightKg : null,
    notes,
    enteredByUserId: req.authUser.id,
    reasonCode,
  };
  try {
    if (hasDb()) {
      await dbQuery(
        `INSERT INTO flock_slaughter_events
          (id, flock_id, at, birds_slaughtered, reason_code, avg_live_weight_kg, avg_carcass_weight_kg, notes, entered_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [row.id, row.flockId, row.at, row.birdsSlaughtered, row.reasonCode, row.avgLiveWeightKg, row.avgCarcassWeightKg, row.notes, row.enteredByUserId]
      );
    } else {
      slaughterEvents.unshift(row);
    }
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
    return;
  }
  let perf = null;
  try {
    perf = await buildFlockPerformanceSummary(f.id, at);
  } catch {
    // Submission already persisted above; return success without summary to avoid duplicate retries.
    perf = null;
  }
  appendAudit(req.authUser.id, req.authUser.role, "flock.slaughter.create", "flock", f.id, { slaughterId: row.id });
  res.status(201).json({ slaughter: row, fcr: perf?.fcr ?? null, performance: perf });
});

app.get("/api/flocks/:id/slaughter-events", requireAuth, requireFarmAccess, requirePageAccess("farm_slaughter"), requireAction("flock.view"), async (req, res) => {
  const f = flocksById.get(req.params.id);
  if (!f) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  const startIso = parseOptionalIsoDate(req.query.start_at);
  const endIso = parseOptionalIsoDate(req.query.end_at);
  try {
    const list = await listSlaughterForFlock(f.id, startIso, endIso);
    res.json({ slaughterEvents: list });
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
  }
});

app.get("/api/flocks/:id/performance-summary", requireAuth, requireFarmAccess, requirePageAccess("farm_flocks"), requireAction("flock.view"), async (req, res) => {
  let summary = null;
  try {
    summary = await buildFlockPerformanceSummary(req.params.id);
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
    return;
  }
  if (!summary) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  res.json(summary);
});

app.get("/api/flocks/:id/fcr-snapshot", requireAuth, requireFarmAccess, requirePageAccess("farm_flocks"), requireAction("flock.view"), async (req, res) => {
  try {
    const summary = await buildFlockPerformanceSummary(req.params.id);
    if (!summary) {
      res.status(404).json({ error: "Flock not found" });
      return;
    }
    res.json(summary.fcrBroiler ?? {});
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
  }
});

function mapWeighInRow(row) {
  const feedPerKgSampleBiomass = row.fcr != null ? Number(row.fcr) : null;
  return {
    id: String(row.id),
    weighDate: String(row.weighDate ?? row.weigh_date ?? ""),
    avgWeightKg: Number(row.avgWeightKg ?? row.avg_weight_kg),
    feedPerKgSampleBiomass,
    fcr: feedPerKgSampleBiomass,
    variancePct: row.variancePct != null ? Number(row.variancePct) : row.variance_pct != null ? Number(row.variance_pct) : null,
    totalFeedUsedKg: row.totalFeedUsedKg != null ? Number(row.totalFeedUsedKg) : row.total_feed_used_kg != null ? Number(row.total_feed_used_kg) : null,
  };
}

app.patch("/api/flocks/:id/live-verification", requireAuth, requireFarmAccess, async (req, res) => {
  if (!hasDb()) {
    res.status(503).json({ error: "Database unavailable. Configure DATABASE_URL." });
    return;
  }
  if (req.authUser.role !== "manager" && req.authUser.role !== "superuser") {
    res.status(403).json({ error: "Only managers can set verified head count." });
    return;
  }
  const flockId = String(req.params.id ?? "").trim();
  const body = req.body ?? {};
  const clear = body.clear === true || body.liveCount === null || body.liveCount === "";
  try {
    await syncFlocksFromDbToMemory();
  } catch {
    /* ignore */
  }
  if (!flocksById.has(flockId)) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  try {
    if (clear) {
      await dbQuery(
        `UPDATE poultry_flocks
            SET verified_live_count = NULL, verified_live_note = NULL, verified_live_at = NULL, updated_at = now()
          WHERE id::text = $1`,
        [flockId]
      );
    } else {
      const liveCount = Math.floor(Number(body.liveCount));
      if (!Number.isFinite(liveCount) || liveCount < 0) {
        res.status(400).json({ error: "liveCount must be a non-negative integer (or send clear: true)." });
        return;
      }
      const note = body.note == null ? null : String(body.note).trim().slice(0, 2000) || null;
      await dbQuery(
        `UPDATE poultry_flocks
            SET verified_live_count = $2,
                verified_live_note = $3,
                verified_live_at = now(),
                updated_at = now()
          WHERE id::text = $1`,
        [flockId, liveCount, note]
      );
    }
    await syncFlocksFromDbToMemory();
    appendAudit(req.authUser.id, req.authUser.role, "flock.live_verification", "flock", flockId, {
      clear,
      liveCount: clear ? null : Math.floor(Number(body.liveCount)),
    });
    const summary = await buildFlockPerformanceSummary(flockId);
    res.json({ ok: true, performance: summary });
  } catch (e) {
    console.error("[ERROR]", "[db] PATCH live-verification:", e instanceof Error ? e.message : e);
    res.status(503).json({ error: "Unable to save verified head count." });
  }
});

app.get("/api/weigh-ins/:flockId/latest", requireAuth, requireFarmAccess, requirePageAccess("farm_flocks"), requireAction("flock.view"), async (req, res) => {
  const flockId = String(req.params.flockId ?? "").trim();
  try {
    if (hasDb()) await syncFlocksFromDbToMemory();
  } catch {
    /* ignore */
  }
  if (!flocksById.has(flockId)) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  if (!hasDb()) {
    res.json({ weighIn: null });
    return;
  }
  try {
    const wr = await dbQuery(
      `SELECT id,
              weigh_date::text AS "weighDate",
              avg_weight_kg AS "avgWeightKg",
              fcr,
              variance_pct AS "variancePct",
              total_feed_used_kg AS "totalFeedUsedKg"
         FROM weigh_ins
        WHERE flock_id = $1
        ORDER BY weigh_date DESC, created_at DESC
        LIMIT 1`,
      [flockId]
    );
    const row = wr.rows[0];
    res.json({ weighIn: row ? mapWeighInRow(row) : null });
  } catch (e) {
    console.error("[ERROR]", "[db] GET weigh-ins latest:", e instanceof Error ? e.message : e);
    res.status(503).json({ error: "Unable to load weigh-in." });
  }
});

app.get("/api/weigh-ins/:flockId", requireAuth, requireFarmAccess, requirePageAccess("farm_flocks"), requireAction("flock.view"), async (req, res) => {
  const flockId = String(req.params.flockId ?? "").trim();
  try {
    if (hasDb()) await syncFlocksFromDbToMemory();
  } catch {
    /* ignore */
  }
  if (!flocksById.has(flockId)) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  if (!hasDb()) {
    res.json({ weighIns: [] });
    return;
  }
  try {
    const wr = await dbQuery(
      `SELECT id,
              weigh_date::text AS "weighDate",
              avg_weight_kg AS "avgWeightKg",
              fcr,
              variance_pct AS "variancePct",
              total_feed_used_kg AS "totalFeedUsedKg"
         FROM weigh_ins
        WHERE flock_id = $1
        ORDER BY weigh_date DESC, created_at DESC`,
      [flockId]
    );
    res.json({ weighIns: wr.rows.map((row) => mapWeighInRow(row)) });
  } catch (e) {
    console.error("[ERROR]", "[db] GET weigh-ins:", e instanceof Error ? e.message : e);
    res.status(503).json({ error: "Unable to load weigh-ins." });
  }
});

app.post("/api/weigh-ins/:flockId", requireAuth, requireFarmAccess, requirePageAccess("farm_flocks"), requireAction("weighin.record"), async (req, res) => {
  const flockId = String(req.params.flockId ?? "").trim();
  try {
    if (hasDb()) await syncFlocksFromDbToMemory();
  } catch {
    /* ignore */
  }
  if (!flocksById.has(flockId)) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  if (!hasDb()) {
    res.status(503).json({ error: "Weigh-ins require database." });
    return;
  }
  const body = req.body ?? {};
  const weighDateRaw = String(body.weighDate ?? body.weigh_date ?? "").trim().slice(0, 10);
  const weighDate = /^\d{4}-\d{2}-\d{2}$/.test(weighDateRaw) ? weighDateRaw : "";
  const ageDays = Math.max(0, Math.floor(Number(body.ageDays ?? body.age_days)));
  const sampleSize = Math.max(1, Math.floor(Number(body.sampleSize ?? body.sample_size)));
  const avgWeightKg = Number(body.avgWeightKg ?? body.avg_weight_kg);
  const totalFeedUsedKg = Number(body.totalFeedUsedKg ?? body.total_feed_used_kg);
  const targetWeightKgRaw = body.targetWeightKg ?? body.target_weight_kg;
  const targetWeightKg =
    targetWeightKgRaw == null || targetWeightKgRaw === "" ? null : Number(targetWeightKgRaw);
  const cvPctRaw = body.cvPct ?? body.cv_pct;
  const cvPct = cvPctRaw == null || cvPctRaw === "" ? null : Number(cvPctRaw);
  const underweightPctRaw = body.underweightPct ?? body.underweight_pct;
  const underweightPct = underweightPctRaw == null || underweightPctRaw === "" ? null : Number(underweightPctRaw);
  const notes = body.notes == null ? null : String(body.notes).trim().slice(0, 4000) || null;

  if (!weighDate || !Number.isFinite(ageDays) || !Number.isFinite(sampleSize) || sampleSize < 1) {
    res.status(400).json({ error: "weighDate (YYYY-MM-DD), ageDays, and sampleSize (>=1) are required" });
    return;
  }
  if (!Number.isFinite(avgWeightKg) || avgWeightKg <= 0 || !Number.isFinite(totalFeedUsedKg) || totalFeedUsedKg < 0) {
    res.status(400).json({ error: "avgWeightKg (>0) and totalFeedUsedKg (>=0) are required" });
    return;
  }
  if (targetWeightKg != null && (!Number.isFinite(targetWeightKg) || targetWeightKg <= 0)) {
    res.status(400).json({ error: "targetWeightKg must be positive when provided" });
    return;
  }

  try {
    const ins = await dbQuery(
      `INSERT INTO weigh_ins
        (flock_id, weigh_date, age_days, sample_size, avg_weight_kg, total_feed_used_kg,
         target_weight_kg, cv_pct, underweight_pct, notes, recorded_by)
       VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id,
                 weigh_date::text AS "weighDate",
                 avg_weight_kg AS "avgWeightKg",
                 fcr,
                 variance_pct AS "variancePct",
                 total_feed_used_kg AS "totalFeedUsedKg"`,
      [
        flockId,
        weighDate,
        ageDays,
        sampleSize,
        avgWeightKg,
        totalFeedUsedKg,
        targetWeightKg,
        cvPct,
        underweightPct,
        notes,
        String(req.authUser.id),
      ]
    );
    const row = ins.rows[0];
    appendAudit(req.authUser.id, req.authUser.role, "flock.weigh_in.create", "flock", flockId, {
      weighDate,
      avgWeightKg,
      sampleSize,
    });
    res.status(201).json({ weighIn: row ? mapWeighInRow(row) : null });
  } catch (e) {
    console.error("[ERROR]", "[db] POST weigh-ins:", e instanceof Error ? e.message : e);
    res.status(503).json({ error: "Unable to save weigh-in." });
  }
});

app.get("/api/reports/flock-performance.csv", requireAuth, requireFarmAccess, async (req, res) => {
  const flockId = String(req.query.flock_id ?? "").trim();
  if (!flockId || !flocksById.has(flockId)) {
    res.status(400).json({ error: "Valid flock_id is required" });
    return;
  }
  let summary = null;
  try {
    summary = await buildFlockPerformanceSummary(flockId, parseOptionalIsoDate(req.query.end_at));
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
    return;
  }
  appendAudit(req.authUser.id, req.authUser.role, "report.export", "report", "flock-performance.csv", {
    flockId,
    endAt: req.query.end_at ?? null,
  });
  const csv = csvFromRows(
    ["flock_id", "placement_date", "age_days", "feed_to_date_kg", "mortality_to_date", "birds_live_estimate", "fcr"],
    [summary]
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="flock-performance-${flockId}.csv"`);
  res.send(csv);
});

app.get("/api/reports/treatments.csv", requireAuth, requireFarmAccess, async (req, res) => {
  const flockId = String(req.query.flock_id ?? "").trim();
  const startIso = parseOptionalIsoDate(req.query.start_at);
  const endIso = parseOptionalIsoDate(req.query.end_at);
  let rows = [];
  try {
    rows = flockId
      ? await listTreatmentsForFlock(flockId, startIso, endIso)
      : hasDb()
        ? (await dbQuery(
          `SELECT id, flock_id AS "flockId", at, disease_or_reason AS "diseaseOrReason", medicine_name AS "medicineName",
                  reason_code AS "reasonCode", dose, dose_unit AS "doseUnit", route, duration_days AS "durationDays", withdrawal_days AS "withdrawalDays", notes
             FROM flock_treatments
            WHERE ($1::timestamptz IS NULL OR at >= $1::timestamptz)
              AND ($2::timestamptz IS NULL OR at <= $2::timestamptz)
            ORDER BY at DESC`,
          [startIso, endIso]
        )).rows
        : flockTreatments
          .filter((t) => {
            const ms = new Date(t.at).getTime();
            const start = startIso ? new Date(startIso).getTime() : Number.NEGATIVE_INFINITY;
            const end = endIso ? new Date(endIso).getTime() : Number.POSITIVE_INFINITY;
            return ms >= start && ms <= end;
          })
          .sort((a, b) => (a.at < b.at ? 1 : -1));
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
    return;
  }
  const csv = csvFromRows(
    ["at", "flockId", "diseaseOrReason", "medicineName", "dose", "doseUnit", "route", "durationDays", "withdrawalDays", "notes"],
    rows
  );
  appendAudit(req.authUser.id, req.authUser.role, "report.export", "report", "treatments.csv", {
    flockId: flockId || null,
    startAt: req.query.start_at ?? null,
    endAt: req.query.end_at ?? null,
  });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="treatments${flockId ? `-${flockId}` : ""}.csv"`);
  res.send(csv);
});

app.get("/api/reports/slaughter.csv", requireAuth, requireFarmAccess, async (req, res) => {
  const flockId = String(req.query.flock_id ?? "").trim();
  const startIso = parseOptionalIsoDate(req.query.start_at);
  const endIso = parseOptionalIsoDate(req.query.end_at);
  let rows = [];
  try {
    rows = flockId
      ? await listSlaughterForFlock(flockId, startIso, endIso)
      : hasDb()
        ? (await dbQuery(
          `SELECT id, flock_id AS "flockId", at, birds_slaughtered AS "birdsSlaughtered",
                  reason_code AS "reasonCode", avg_live_weight_kg AS "avgLiveWeightKg", avg_carcass_weight_kg AS "avgCarcassWeightKg", notes
             FROM flock_slaughter_events
            WHERE ($1::timestamptz IS NULL OR at >= $1::timestamptz)
              AND ($2::timestamptz IS NULL OR at <= $2::timestamptz)
            ORDER BY at DESC`,
          [startIso, endIso]
        )).rows
        : slaughterEvents
          .filter((s) => {
            const ms = new Date(s.at).getTime();
            const start = startIso ? new Date(startIso).getTime() : Number.NEGATIVE_INFINITY;
            const end = endIso ? new Date(endIso).getTime() : Number.POSITIVE_INFINITY;
            return ms >= start && ms <= end;
          })
          .sort((a, b) => (a.at < b.at ? 1 : -1));
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
    return;
  }
  const csv = csvFromRows(
    ["at", "flockId", "birdsSlaughtered", "avgLiveWeightKg", "avgCarcassWeightKg", "notes"],
    rows
  );
  appendAudit(req.authUser.id, req.authUser.role, "report.export", "report", "slaughter.csv", {
    flockId: flockId || null,
    startAt: req.query.start_at ?? null,
    endAt: req.query.end_at ?? null,
  });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="slaughter${flockId ? `-${flockId}` : ""}.csv"`);
  res.send(csv);
});

function inventoryRowPayload(row) {
  const fid = String(row.flockId ?? "");
  return {
    ...row,
    flockLabel: flocksById.get(fid)?.label ?? fid,
  };
}

function computeInventoryBalances(flockId = null) {
  const scoped = inventoryTransactions.filter((r) => (flockId ? sameFlockId(r.flockId, flockId) : true));
  const byFlock = new Map();
  for (const row of scoped) {
    const fk = String(row.flockId ?? "");
    const prev = byFlock.get(fk) ?? 0;
    byFlock.set(fk, prev + Number(row.deltaKg || 0));
  }
  return [...byFlock.entries()].map(([id, balanceKg]) => ({
    flockId: id,
    flockLabel: flocksById.get(id)?.label ?? id,
    balanceKg: Number(balanceKg.toFixed(3)),
  }));
}

app.get("/api/inventory/ledger", requireAuth, requireFarmAccess, requirePageAccess("farm_inventory"), async (req, res) => {
  if (hasDb()) {
    try {
      await syncInventoryTransactionsFromDb();
    } catch (e) {
      console.error("[ERROR]", "[db] GET /api/inventory/ledger sync:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Inventory ledger unavailable. Please retry shortly." });
      return;
    }
  }
  const flockId = String(req.query.flock_id ?? "").trim();
  const type = String(req.query.type ?? "").trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 30));

  let list = inventoryTransactions;
  if (flockId) list = list.filter((r) => sameFlockId(r.flockId, flockId));
  if (type) list = list.filter((r) => r.type === type);

  list = [...list].sort((a, b) => (a.at < b.at ? 1 : -1));
  const total = list.length;
  const start = (page - 1) * pageSize;
  const rows = list.slice(start, start + pageSize).map(inventoryRowPayload);
  res.json({ rows, total, page, pageSize });
});

app.get("/api/inventory/balance", requireAuth, requireFarmAccess, async (req, res) => {
  if (hasDb()) {
    try {
      await syncInventoryTransactionsFromDb();
    } catch (e) {
      console.error("[ERROR]", "[db] GET /api/inventory/balance sync:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Inventory balances unavailable. Please retry shortly." });
      return;
    }
  }
  const flockId = String(req.query.flock_id ?? "").trim() || null;
  res.json({ balances: computeInventoryBalances(flockId) });
});

app.post("/api/inventory/procurement", requireAuth, requireFarmAccess, requirePageAccess("farm_inventory"), async (req, res) => {
  if (!canCreateProcurement(req.authUser)) {
    res.status(403).json({ error: "Only procurement, manager, or superuser can receive stock" });
    return;
  }
  const body = req.body ?? {};
  const flockId = String(body.flockId ?? "").trim();
  const quantityKg = Number(body.quantityKg);
  const unitCostRwfPerKg =
    body.unitCostRwfPerKg == null || body.unitCostRwfPerKg === "" ? null : Number(body.unitCostRwfPerKg);
  const reasonCode = String(body.reasonCode ?? "").trim() || "supplier_delivery";
  if (!systemConfig.validateAgainstCategory("inventory_procurement_reason", reasonCode, INVENTORY_REASON_CODES.procurement)) {
    res.status(400).json({ error: "Invalid reasonCode for procurement" });
    return;
  }
  const reason = String(body.reason ?? reasonCode).slice(0, 400);
  const reference = String(body.reference ?? "").slice(0, 200);
  if (!flockId || !flocksById.has(flockId)) {
    res.status(400).json({ error: "Valid flockId is required" });
    return;
  }
  if (!Number.isFinite(quantityKg) || quantityKg <= 0) {
    res.status(400).json({ error: "quantityKg must be > 0" });
    return;
  }
  if (unitCostRwfPerKg != null && (!Number.isFinite(unitCostRwfPerKg) || unitCostRwfPerKg < 0)) {
    res.status(400).json({ error: "unitCostRwfPerKg must be >= 0" });
    return;
  }
  let row = {
    id: `inv_${crypto.randomBytes(6).toString("hex")}`,
    type: "procurement_receipt",
    flockId,
    at: new Date().toISOString(),
    quantityKg,
    deltaKg: quantityKg,
    unitCostRwfPerKg: unitCostRwfPerKg != null ? unitCostRwfPerKg : null,
    reason,
    reference,
    actorUserId: req.authUser.id,
    approvedByUserId: null,
    approvedAt: null,
  };
  let procurementSavedToDb = false;
  if (hasDb() && isPersistableUuid(flockId) && isPersistableUuid(req.authUser.id)) {
    try {
      const ins = await dbQuery(
        `INSERT INTO farm_inventory_transactions (
           flock_id, transaction_type, recorded_at, quantity_kg, delta_kg,
           unit_cost_rwf_per_kg, reason, reference, actor_user_id, approved_by_user_id, approved_at
         )
         VALUES ($1::uuid, $2, $3::timestamptz, $4::numeric, $5::numeric, $6::numeric, $7, $8, $9::uuid, NULL, NULL)
         RETURNING id::text AS id,
                   transaction_type AS type,
                   flock_id::text AS "flockId",
                   recorded_at AS "recordedAt",
                   quantity_kg AS "quantityKg",
                   delta_kg AS "deltaKg",
                   unit_cost_rwf_per_kg AS "unitCostRwfPerKg",
                   reason,
                   reference,
                   actor_user_id::text AS "actorUserId",
                   approved_by_user_id::text AS "approvedByUserId",
                   approved_at AS "approvedAt"`,
        [
          flockId,
          "procurement_receipt",
          row.at,
          quantityKg,
          quantityKg,
          unitCostRwfPerKg,
          reason,
          reference,
          req.authUser.id,
        ]
      );
      row = mapInventoryRowFromDb(ins.rows[0]);
      procurementSavedToDb = true;
    } catch (e) {
      console.error("[ERROR]", "[db] POST /api/inventory/procurement:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Could not save procurement row." });
      return;
    }
  }
  if (procurementSavedToDb) {
    try {
      await syncInventoryTransactionsFromDb();
    } catch (syncErr) {
      console.error("[ERROR]", "[db] syncInventoryTransactionsFromDb after procurement:", syncErr instanceof Error ? syncErr.message : syncErr);
    }
  } else {
    inventoryTransactions.unshift(row);
  }
  appendAudit(req.authUser.id, req.authUser.role, "inventory.procurement.create", "inventory", row.id, {
    flockId,
    quantityKg,
  });
  res.status(201).json({ row: inventoryRowPayload(row), balances: computeInventoryBalances(flockId) });
});

app.post("/api/inventory/feed-consumption", requireAuth, requireFarmAccess, requirePageAccess("farm_inventory"), async (req, res) => {
  if (!canCreateFeedConsumption(req.authUser)) {
    res.status(403).json({ error: "Only laborer, dispatcher, manager, or superuser can log feed usage" });
    return;
  }
  const body = req.body ?? {};
  const flockId = String(body.flockId ?? "").trim();
  const quantityKg = Number(body.quantityKg);
  const reasonCode = String(body.reasonCode ?? "").trim() || "round_feed";
  if (!systemConfig.validateAgainstCategory("inventory_consumption_reason", reasonCode, INVENTORY_REASON_CODES.consumption)) {
    res.status(400).json({ error: "Invalid reasonCode for feed consumption" });
    return;
  }
  const reason = String(body.reason ?? reasonCode).slice(0, 400);
  if (!flockId || !flocksById.has(flockId)) {
    res.status(400).json({ error: "Valid flockId is required" });
    return;
  }
  if (!Number.isFinite(quantityKg) || quantityKg <= 0) {
    res.status(400).json({ error: "quantityKg must be > 0" });
    return;
  }
  if (hasDb()) {
    try {
      await syncInventoryTransactionsFromDb();
    } catch (e) {
      console.error("[ERROR]", "[db] POST /api/inventory/feed-consumption sync:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Inventory balances unavailable. Please retry shortly." });
      return;
    }
  }
  const currentBalance = computeInventoryBalances(flockId)[0]?.balanceKg ?? 0;
  if (currentBalance - quantityKg < 0 && !canCreateInventoryAdjustment(req.authUser)) {
    res.status(400).json({ error: "Insufficient stock for this flock" });
    return;
  }
  let row = {
    id: `inv_${crypto.randomBytes(6).toString("hex")}`,
    type: "feed_consumption",
    flockId,
    at: new Date().toISOString(),
    quantityKg,
    deltaKg: -quantityKg,
    unitCostRwfPerKg: null,
    reason,
    reference: "",
    actorUserId: req.authUser.id,
    approvedByUserId: null,
    approvedAt: null,
  };
  let feedConsumptionSavedToDb = false;
  if (hasDb() && isPersistableUuid(flockId) && isPersistableUuid(req.authUser.id)) {
    try {
      const ins = await dbQuery(
        `INSERT INTO farm_inventory_transactions (
           flock_id, transaction_type, recorded_at, quantity_kg, delta_kg,
           unit_cost_rwf_per_kg, reason, reference, actor_user_id, approved_by_user_id, approved_at
         )
         VALUES ($1::uuid, $2, $3::timestamptz, $4::numeric, $5::numeric, NULL, $6, '', $7::uuid, NULL, NULL)
         RETURNING id::text AS id,
                   transaction_type AS type,
                   flock_id::text AS "flockId",
                   recorded_at AS "recordedAt",
                   quantity_kg AS "quantityKg",
                   delta_kg AS "deltaKg",
                   unit_cost_rwf_per_kg AS "unitCostRwfPerKg",
                   reason,
                   reference,
                   actor_user_id::text AS "actorUserId",
                   approved_by_user_id::text AS "approvedByUserId",
                   approved_at AS "approvedAt"`,
        [
          flockId,
          "feed_consumption",
          row.at,
          quantityKg,
          -quantityKg,
          reason,
          req.authUser.id,
        ]
      );
      row = mapInventoryRowFromDb(ins.rows[0]);
      feedConsumptionSavedToDb = true;
    } catch (e) {
      console.error("[ERROR]", "[db] POST /api/inventory/feed-consumption:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Could not save feed consumption row." });
      return;
    }
  }
  if (feedConsumptionSavedToDb) {
    try {
      await syncInventoryTransactionsFromDb();
    } catch (syncErr) {
      console.error("[ERROR]", "[db] syncInventoryTransactionsFromDb after feed consumption:", syncErr instanceof Error ? syncErr.message : syncErr);
    }
  } else {
    inventoryTransactions.unshift(row);
  }
  appendAudit(req.authUser.id, req.authUser.role, "inventory.feed.create", "inventory", row.id, {
    flockId,
    quantityKg,
  });
  res.status(201).json({ row: inventoryRowPayload(row), balances: computeInventoryBalances(flockId) });
});

app.post("/api/inventory/adjustments", requireAuth, requireFarmAccess, requirePageAccess("farm_inventory"), async (req, res) => {
  if (!canCreateInventoryAdjustment(req.authUser)) {
    res.status(403).json({ error: "Only manager or superuser can adjust stock" });
    return;
  }
  const body = req.body ?? {};
  const flockId = String(body.flockId ?? "").trim();
  const deltaKg = Number(body.deltaKg);
  const reasonCode = String(body.reasonCode ?? "").trim() || "stock_count_correction";
  if (!systemConfig.validateAgainstCategory("inventory_adjust_reason", reasonCode, INVENTORY_REASON_CODES.adjustment)) {
    res.status(400).json({ error: "Invalid reasonCode for adjustment" });
    return;
  }
  const reason = String(body.reason ?? reasonCode).slice(0, 400);
  if (!flockId || !flocksById.has(flockId)) {
    res.status(400).json({ error: "Valid flockId is required" });
    return;
  }
  if (!Number.isFinite(deltaKg) || deltaKg === 0) {
    res.status(400).json({ error: "deltaKg must be a non-zero number" });
    return;
  }
  let row = {
    id: `inv_${crypto.randomBytes(6).toString("hex")}`,
    type: "adjustment",
    flockId,
    at: new Date().toISOString(),
    quantityKg: Math.abs(deltaKg),
    deltaKg,
    unitCostRwfPerKg: null,
    reason,
    reference: "",
    actorUserId: req.authUser.id,
    approvedByUserId: req.authUser.id,
    approvedAt: new Date().toISOString(),
  };
  let adjustmentSavedToDb = false;
  if (hasDb() && isPersistableUuid(flockId) && isPersistableUuid(req.authUser.id)) {
    try {
      const ins = await dbQuery(
        `INSERT INTO farm_inventory_transactions (
           flock_id, transaction_type, recorded_at, quantity_kg, delta_kg,
           unit_cost_rwf_per_kg, reason, reference, actor_user_id, approved_by_user_id, approved_at
         )
         VALUES ($1::uuid, $2, $3::timestamptz, $4::numeric, $5::numeric, NULL, $6, '', $7::uuid, $8::uuid, $9::timestamptz)
         RETURNING id::text AS id,
                   transaction_type AS type,
                   flock_id::text AS "flockId",
                   recorded_at AS "recordedAt",
                   quantity_kg AS "quantityKg",
                   delta_kg AS "deltaKg",
                   unit_cost_rwf_per_kg AS "unitCostRwfPerKg",
                   reason,
                   reference,
                   actor_user_id::text AS "actorUserId",
                   approved_by_user_id::text AS "approvedByUserId",
                   approved_at AS "approvedAt"`,
        [
          flockId,
          "adjustment",
          row.at,
          Math.abs(deltaKg),
          deltaKg,
          reason,
          req.authUser.id,
          req.authUser.id,
          row.approvedAt,
        ]
      );
      row = mapInventoryRowFromDb(ins.rows[0]);
      adjustmentSavedToDb = true;
    } catch (e) {
      console.error("[ERROR]", "[db] POST /api/inventory/adjustments:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Could not save inventory adjustment." });
      return;
    }
  }
  if (adjustmentSavedToDb) {
    try {
      await syncInventoryTransactionsFromDb();
    } catch (syncErr) {
      console.error("[ERROR]", "[db] syncInventoryTransactionsFromDb after adjustment:", syncErr instanceof Error ? syncErr.message : syncErr);
    }
  } else {
    inventoryTransactions.unshift(row);
  }
  appendAudit(req.authUser.id, req.authUser.role, "inventory.adjustment.create", "inventory", row.id, {
    flockId,
    deltaKg,
  });
  res.status(201).json({ row: inventoryRowPayload(row), balances: computeInventoryBalances(flockId) });
});

app.patch("/api/inventory/:id", requireAuth, requireFarmAccess, requirePageAccess("farm_inventory"), async (req, res) => {
  if (hasDb()) {
    try {
      await syncInventoryTransactionsFromDb();
    } catch (e) {
      console.error("[ERROR]", "[db] PATCH /api/inventory/:id sync:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Inventory ledger unavailable. Please retry shortly." });
      return;
    }
  }
  const row = inventoryTransactions.find((r) => r.id === req.params.id);
  if (!row) {
    res.status(404).json({ error: "Inventory row not found" });
    return;
  }
  if (!canEditInventoryRow(req.authUser, row)) {
    res.status(403).json({ error: "You do not have permission to edit this record" });
    return;
  }
  const body = req.body ?? {};
  const nextReason = body.reason !== undefined ? String(body.reason).slice(0, 400) : row.reason;
  const nextReference =
    row.type === "procurement_receipt" && body.reference !== undefined
      ? String(body.reference).slice(0, 200)
      : row.reference;

  if (hasDb() && isPersistableUuid(String(row.id))) {
    try {
      const upd = await dbQuery(
        `UPDATE farm_inventory_transactions
            SET reason = $2,
                reference = $3,
                updated_at = now()
          WHERE id = $1::uuid
          RETURNING id::text AS id,
                    transaction_type AS type,
                    flock_id::text AS "flockId",
                    recorded_at AS "recordedAt",
                    quantity_kg AS "quantityKg",
                    delta_kg AS "deltaKg",
                    unit_cost_rwf_per_kg AS "unitCostRwfPerKg",
                    reason,
                    reference,
                    actor_user_id::text AS "actorUserId",
                    approved_by_user_id::text AS "approvedByUserId",
                    approved_at AS "approvedAt"`,
        [row.id, nextReason, nextReference]
      );
      if ((upd.rowCount ?? 0) === 0) {
        res.status(404).json({ error: "Inventory row not found" });
        return;
      }
      Object.assign(row, mapInventoryRowFromDb(upd.rows[0]));
    } catch (e) {
      console.error("[ERROR]", "[db] PATCH /api/inventory/:id:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Could not update inventory row." });
      return;
    }
  } else {
    row.reason = nextReason;
    row.reference = nextReference;
  }
  appendAudit(req.authUser.id, req.authUser.role, "inventory.row.update", "inventory", row.id, {});
  res.json({ row: inventoryRowPayload(row), balances: computeInventoryBalances(row.flockId) });
});

/** @type {Array<Record<string, unknown>>} */
const dailyLogs = [];

/** @type {Array<Record<string, unknown>>} */
const vetLogs = [];

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "clevafarm-api", storedLogs: dailyLogs.length, users: usersById.size });
});

function computeValidation(payload) {
  const initial =
    systemConfig.getAppSettingNumber(
      "demo_initial_count",
      Number(process.env.DEMO_INITIAL_COUNT) || 1000,
    );
  const mortality = Number(payload.mortality) || 0;
  const pct = initial > 0 ? (mortality / initial) * 100 : 0;
  const warnings = [];
  if (pct >= 0.5) warnings.push(`Mortality is ${pct.toFixed(2)}% of initial flock (≥ 0.5%).`);
  if (pct >= 2) warnings.push("Very high single-day mortality — would require vet manager approval in production.");
  return { warnings, mortalityPct: pct };
}

app.post("/api/daily-logs/validate", requireAuth, requireFarmAccess, requirePageAccess("farm_daily_log"), requireAction("mortality.record"), (req, res) => {
  // PROD-FIX: prevents malformed data and injection
  const parsed = dailyLogSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid daily log payload" });
    return;
  }
  const payload = { ...(req.body ?? {}), ...parsed.data };
  const { warnings } = computeValidation(payload);
  res.json({ warnings });
});

app.post("/api/daily-logs", requireAuth, requireFarmAccess, requirePageAccess("farm_daily_log"), requireAction("mortality.record"), async (req, res) => {
  // PROD-FIX: prevents malformed data and injection
  const parsed = dailyLogSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid daily log payload" });
    return;
  }
  const payload = { ...(req.body ?? {}), ...parsed.data };
  if (!payload.flockId || !payload.logDate) {
    res.status(400).json({ error: "flockId and logDate are required" });
    return;
  }
  if (!flocksById.has(String(payload.flockId))) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  const validation = computeValidation(payload);
  const mortalityPct = Number(validation.mortalityPct) || 0;
  const flaggedHighMortality = mortalityPct >= 0.5;
  const validationStatus = mortalityPct >= 2 ? "vet_approval_required" : "draft";
  const mortalityN = Math.max(0, Number(payload.mortality) || 0);
  const feedIntakeKg = Number.isFinite(Number(payload.feedIntakeKg)) ? Math.max(0, Number(payload.feedIntakeKg)) : 0;
  const waterLiters = Number.isFinite(Number(payload.waterLiters)) ? Math.max(0, Number(payload.waterLiters)) : 0;
  const tempMinC =
    payload.tempMinC != null && payload.tempMinC !== "" ? Number(payload.tempMinC) : null;
  const tempMaxC =
    payload.tempMaxC != null && payload.tempMaxC !== "" ? Number(payload.tempMaxC) : null;
  const avgWeightSampleKg =
    payload.avgWeightSampleKg != null && payload.avgWeightSampleKg !== ""
      ? Number(payload.avgWeightSampleKg)
      : null;
  const notesRaw = String(payload.notes ?? "").slice(0, 4000);
  const notesDb = notesRaw.trim() ? notesRaw : null;
  const logDateStr = String(payload.logDate).slice(0, 10);
  let dlId = `dl_${crypto.randomBytes(6).toString("hex")}`;
  const receivedAt = new Date().toISOString();
  let dailySavedToDb = false;

  if (hasDb() && isPersistableUuid(String(payload.flockId)) && isPersistableUuid(req.authUser.id)) {
    try {
      const ins = await dbQuery(
        `INSERT INTO poultry_daily_logs (
           flock_id, laborer_id, log_date, mortality, feed_intake_kg, water_liters,
           temp_min_c, temp_max_c, avg_weight_sample_kg, notes,
           validation_status, mortality_pct_of_initial, flagged_high_mortality,
           submitted_at
         )
         VALUES (
           $1::uuid, $2::uuid, $3::date, $4, $5::numeric, $6::numeric,
           $7::numeric, $8::numeric, $9::numeric, $10,
           $11::poultry_daily_log_validation_status, $12::numeric, $13, $14::timestamptz
         )
         RETURNING id::text AS id`,
        [
          payload.flockId,
          req.authUser.id,
          logDateStr,
          mortalityN,
          feedIntakeKg,
          waterLiters,
          tempMinC != null && Number.isFinite(tempMinC) ? tempMinC : null,
          tempMaxC != null && Number.isFinite(tempMaxC) ? tempMaxC : null,
          avgWeightSampleKg != null && Number.isFinite(avgWeightSampleKg) ? avgWeightSampleKg : null,
          notesDb,
          validationStatus,
          mortalityPct,
          flaggedHighMortality,
          receivedAt,
        ]
      );
      const rid = ins.rows[0]?.id;
      if (!rid) {
        throw new Error("poultry_daily_logs INSERT returned no id");
      }
      dlId = String(rid);
      dailySavedToDb = true;
    } catch (e) {
      console.error("[ERROR]", "[db] POST daily-logs:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Could not save daily log." });
      return;
    }
  }

  let record = {
    id: dlId,
    ...payload,
    receivedAt,
    validation,
    enteredByUserId: req.authUser.id,
  };
  let indexForClient = 0;
  if (dailySavedToDb) {
    try {
      await syncDailyLogsFromDb();
    } catch (syncErr) {
      console.error("[ERROR]", "[db] syncDailyLogsFromDb after daily log:", syncErr instanceof Error ? syncErr.message : syncErr);
    }
    const synced = dailyLogs.find((d) => String(d.id) === String(dlId));
    if (synced) {
      record = { ...synced, validation };
    }
    const idx = dailyLogs.findIndex((d) => String(d.id) === String(dlId));
    indexForClient = idx >= 0 ? idx + 1 : dailyLogs.length;
  } else {
    dailyLogs.push(record);
    indexForClient = dailyLogs.length;
  }
  appendAudit(req.authUser.id, req.authUser.role, "farm.daily_log.create", "flock", String(payload.flockId), {
    logDate: payload.logDate,
  });
  res.json({ ok: true, record: { ...record, index: indexForClient }, payrollImpact: null });
});

app.get(
  "/api/business-model/paygo-defaults",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (_req, res) => {
    const ctl = defaultPaygoCtl();
    res.json({
      ctl,
      inputs: ctlToInputs(ctl),
      engineDefaults: defaultPaygoInputs(),
    });
  },
);

app.get(
  "/api/business-model/broiler-defaults",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (_req, res) => {
    res.json({ inputs: defaultBroilerInputs() });
  },
);

app.post(
  "/api/business-model/paygo-projection",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      let inp;
      let ctlOut = null;
      if (body.ctl && typeof body.ctl === "object") {
        ctlOut = mergePaygoCtl(body.ctl);
        inp = ctlToInputs(ctlOut);
      } else {
        inp = mergePaygoInputs(body.inputs);
      }
      const series = runProjection(inp);
      const summary = summarizeProjection(series, inp);
      const milestones = profitMilestones(series);
      const scenarios = leverScenarioRows(inp);
      const capCtl = ctlOut ?? body.ctl ?? {};
      const { investor_pct, creditor_pct } = capitalSplitFromCtl(capCtl);
      const capitalStack = capitalStackForReport(summary.peak_debt ?? 0, investor_pct, creditor_pct);
      const modelKpis = extractModelKpis(series, inp);
      res.json({
        ok: true,
        ctl: ctlOut,
        inputs: inp,
        series,
        summary,
        milestones,
        scenarios,
        capitalStack,
        modelKpis,
      });
    } catch (e) {
      console.error("[ERROR]", "[api] paygo-projection:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Projection failed" });
    }
  },
);

app.post(
  "/api/business-model/paygo-heatmaps",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const inp = body.ctl && typeof body.ctl === "object" ? ctlToInputs(mergePaygoCtl(body.ctl)) : mergePaygoInputs(body.inputs);
      const heatmaps = buildPaygoHeatmaps(inp);
      res.json({ ok: true, inputs: inp, heatmaps });
    } catch (e) {
      console.error("[ERROR]", "[api] paygo-heatmaps:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Heatmaps failed" });
    }
  },
);

app.post(
  "/api/business-model/paygo-compare",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const ctlA = mergePaygoCtl(body.ctlA ?? body.ctl);
      let ctlB = body.ctlB && typeof body.ctlB === "object" ? mergePaygoCtl(body.ctlB) : null;
      const inpA = ctlToInputs(ctlA);
      let inpB;
      if (ctlB) {
        inpB = ctlToInputs(ctlB);
      } else {
        inpB = replacePaygoInputs(inpA, { def_rate: Math.min(0.2, inpA.def_rate + 0.02) });
        ctlB = { ...ctlA, def_rate_pct: inpB.def_rate * 100 };
      }
      const seriesA = runProjection(inpA);
      const seriesB = runProjection(inpB);
      const summaryA = summarizeProjection(seriesA, inpA);
      const summaryB = summarizeProjection(seriesB, inpB);
      const milestonesA = profitMilestones(seriesA);
      const milestonesB = profitMilestones(seriesB);
      const deltaNi = summaryB.cum_ni - summaryA.cum_ni;
      const assumptionLabels = {
        proj_months: "Horizon (months)",
        volume_mode: "Volume path",
        def_rate_pct: "Default rate %",
        debt_rate_pct: "Cost of debt %",
        device_tier_label: "Device tier",
        custom_dev_cost_rwf: "Device cost (RWF)",
        customer_payback_multiple: "Full contract (× device price)",
        dep_pct: "Down payment %",
        disc3_pct: "3-mo discount %",
        disc6_pct: "6-mo discount %",
        disc12_pct: "12-mo discount %",
        mix_p3: "Mix 3-mo %",
        mix_p6: "Mix 6-mo %",
        mix_p12: "Mix 12-mo %",
        fixed_opex_per_device: "Fixed cost / device (RWF)",
        platform_cac_per_unit: "CAC / unit (RWF)",
        recovery_pct: "Recovery %",
        ltv_pct: "LTV %",
        grace_mos: "Grace (months)",
        amort_mos: "Amortization (months)",
        investor_capital_pct: "Investor (equity) target %",
        creditor_capital_pct: "Creditor (debt) target %",
      };
      const diffKeys = [...BUILD_KEYS, "investor_capital_pct", "creditor_capital_pct"];
      const diffRows = [];
      for (const k of diffKeys) {
        if (k === "custom_monthly") continue;
        const va = ctlA[k];
        const vb = ctlB[k];
        if (va !== vb) {
          diffRows.push({ assumption: assumptionLabels[k] ?? k, A: va, B: vb });
        }
      }
      res.json({
        ok: true,
        ctlA,
        ctlB,
        inputsA: inpA,
        inputsB: inpB,
        seriesA,
        seriesB,
        summaryA,
        summaryB,
        milestonesA,
        milestonesB,
        deltaCumulativeNetIncome: deltaNi,
        assumptionDiffs: diffRows,
      });
    } catch (e) {
      console.error("[ERROR]", "[api] paygo-compare:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Compare failed" });
    }
  },
);

app.post(
  "/api/business-model/budget-variance",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const inp = body.ctl && typeof body.ctl === "object" ? ctlToInputs(mergePaygoCtl(body.ctl)) : mergePaygoInputs(body.inputs);
      const series = runProjection(inp);
      let targets = Array.isArray(body.targets) ? body.targets : [];
      let actuals = Array.isArray(body.actuals) ? body.actuals : [];
      if (body.useStoredBudget) {
        const uid = req.authUser.id;
        targets = budgetDb.listTargetsLong(uid).map((r) => ({ month: r.month, kpi_key: r.kpi_key, value: r.value }));
        actuals = budgetDb.listActualsLong(uid).map((r) => ({ month: r.month, kpi_key: r.kpi_key, value: r.value }));
      }
      const variance = buildVarianceFrame(series, inp, targets, actuals);
      res.json({ ok: true, inputs: inp, variance });
    } catch (e) {
      console.error("[ERROR]", "[api] budget-variance:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Budget variance failed" });
    }
  },
);

app.get(
  "/api/business-model/budget/actuals",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (req, res) => {
    try {
      const rows = budgetDb.listActualsLong(req.authUser.id);
      res.json({ ok: true, rows });
    } catch (e) {
      console.error("[ERROR]", "[api] budget actuals:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Could not load actuals" });
    }
  },
);

app.get(
  "/api/business-model/budget/targets",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (req, res) => {
    try {
      const rows = budgetDb.listTargetsLong(req.authUser.id);
      res.json({ ok: true, rows });
    } catch (e) {
      console.error("[ERROR]", "[api] budget targets:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Could not load targets" });
    }
  },
);

app.post(
  "/api/business-model/budget/actual",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const month = Math.floor(Number(body.month));
      const kpi_key = String(body.kpi_key ?? "");
      const value = Number(body.value);
      const source = String(body.source ?? "manual");
      if (!Number.isFinite(month) || !Number.isFinite(value) || !kpi_key) {
        res.status(400).json({ error: "month, kpi_key, value required" });
        return;
      }
      budgetDb.upsertActual(req.authUser.id, month, kpi_key, value, source);
      res.json({ ok: true });
    } catch (e) {
      console.error("[ERROR]", "[api] budget actual upsert:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Upsert failed" });
    }
  },
);

app.post(
  "/api/business-model/budget/target",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const month = Math.floor(Number(body.month));
      const kpi_key = String(body.kpi_key ?? "");
      const value = Number(body.value);
      if (!Number.isFinite(month) || !Number.isFinite(value) || !kpi_key) {
        res.status(400).json({ error: "month, kpi_key, value required" });
        return;
      }
      budgetDb.upsertTarget(req.authUser.id, month, kpi_key, value);
      res.json({ ok: true });
    } catch (e) {
      console.error("[ERROR]", "[api] budget target upsert:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Upsert failed" });
    }
  },
);

app.post(
  "/api/business-model/budget/sync-targets-from-model",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const inp = body.ctl && typeof body.ctl === "object" ? ctlToInputs(mergePaygoCtl(body.ctl)) : mergePaygoInputs(body.inputs);
      const series = runProjection(inp);
      const long = extractModelKpis(series, inp);
      const n = budgetDb.replaceTargetsFromModelKpis(req.authUser.id, long);
      res.json({ ok: true, inputs: inp, rowsWritten: n });
    } catch (e) {
      console.error("[ERROR]", "[api] budget sync targets:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Sync failed" });
    }
  },
);

app.post(
  "/api/business-model/budget/import-actuals-csv",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const csv = String(body.csv ?? "");
      if (!csv.trim()) {
        res.status(400).json({ error: "csv text required" });
        return;
      }
      const rows = parseActualsCsv(csv);
      const n = budgetDb.bulkUpsertActuals(req.authUser.id, rows, "csv_import");
      res.json({ ok: true, imported: n });
    } catch (e) {
      console.error("[ERROR]", "[api] budget csv import:", e instanceof Error ? e.message : e);
      res.status(400).json({ error: e instanceof Error ? e.message : "Import failed" });
    }
  },
);

app.get(
  "/api/business-model/suggested-actuals",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (_req, res) => {
    const { source, rows, hint } = loadSuggestedActuals();
    res.json({ ok: true, source, rows, hint });
  },
);

app.post(
  "/api/business-model/budget/append-suggested-actuals",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (_req, res) => {
    try {
      const { rows } = loadSuggestedActuals();
      if (!rows.length) {
        res.json({ ok: true, appended: 0, message: "No suggested rows from environment." });
        return;
      }
      const n = budgetDb.bulkUpsertActuals(req.authUser.id, rows, "cleva_feed");
      res.json({ ok: true, appended: n });
    } catch (e) {
      console.error("[ERROR]", "[api] append suggested:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Append failed" });
    }
  },
);

app.post(
  "/api/business-model/investor-pdf",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const ctl = mergePaygoCtl(body.ctl ?? {});
      const inp = ctlToInputs(ctl);
      const series = runProjection(inp);
      const summary = summarizeProjection(series, inp);
      const milestones = profitMilestones(series);
      const stakeholderType = String(body.stakeholderType ?? "investor").toLowerCase() === "lender" ? "lender" : "investor";
      const buf = await buildInvestorPdfBuffer({
        series,
        summary,
        milestones,
        ctl,
        stakeholderType,
        companyName: String(body.companyName ?? "ClevaCredit"),
        productName: String(body.productName ?? "PAYGO Credit"),
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="cleva-paygo-memorandum.pdf"');
      res.send(buf);
    } catch (e) {
      console.error("[ERROR]", "[api] investor-pdf:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "PDF generation failed" });
    }
  },
);

app.post(
  "/api/business-model/broiler-pdf",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const inp = mergeBroilerInputs(body.inputs);
      const summary = broilerSummary(inp);
      const trajectory = dailyTrajectory(inp);
      const insights = insightMessagesBroiler(inp, trajectory);
      const cycleId = String(body.cycleId ?? "default");
      const comp = broilerOpsDb.complianceScore(req.authUser.id, cycleId, inp.cycle_days);
      const health = broilerOpsDb.healthStatusFromVet(req.authUser.id, cycleId);
      const buf = await buildBroilerPdfBuffer({
        summary,
        trajectory,
        insights,
        farmName: String(body.farmName ?? "Broiler operation"),
        complianceScore: comp.score,
        healthStatus: health,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="broiler-cycle-report.pdf"');
      res.send(buf);
    } catch (e) {
      console.error("[ERROR]", "[api] broiler-pdf:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "PDF generation failed" });
    }
  },
);

app.get(
  "/api/business-model/broiler-ops/checkins",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (req, res) => {
    try {
      const cycleId = String(req.query.cycleId ?? "flock-1");
      const rows = broilerOpsDb.listCheckins(req.authUser.id, cycleId);
      res.json({ ok: true, rows });
    } catch (e) {
      console.error("[ERROR]", "[api] broiler-ops checkins:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Load failed" });
    }
  },
);

app.get(
  "/api/business-model/broiler-ops/mortality",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (req, res) => {
    try {
      const cycleId = String(req.query.cycleId ?? "flock-1");
      const rows = broilerOpsDb.listMortality(req.authUser.id, cycleId);
      res.json({ ok: true, rows });
    } catch (e) {
      console.error("[ERROR]", "[api] broiler-ops mortality:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Load failed" });
    }
  },
);

app.get(
  "/api/business-model/broiler-ops/vet-reports",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (req, res) => {
    try {
      const cycleId = String(req.query.cycleId ?? "flock-1");
      const rows = broilerOpsDb.listVetReports(req.authUser.id, cycleId);
      res.json({ ok: true, rows });
    } catch (e) {
      console.error("[ERROR]", "[api] broiler-ops vet:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Load failed" });
    }
  },
);

app.get(
  "/api/business-model/broiler-ops/compliance",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (req, res) => {
    try {
      const cycleId = String(req.query.cycleId ?? "flock-1");
      const cycleDays = Math.floor(Number(req.query.cycleDays ?? 35));
      const out = broilerOpsDb.complianceScore(req.authUser.id, cycleId, cycleDays);
      const vet = broilerOpsDb.healthStatusFromVet(req.authUser.id, cycleId);
      res.json({ ok: true, ...out, vetStatus: vet });
    } catch (e) {
      console.error("[ERROR]", "[api] broiler-ops compliance:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Load failed" });
    }
  },
);

app.get(
  "/api/business-model/broiler-ops/snapshots",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (req, res) => {
    try {
      const rows = broilerOpsDb.listSnapshots(req.authUser.id, 24);
      res.json({ ok: true, rows });
    } catch (e) {
      console.error("[ERROR]", "[api] broiler-ops snapshots:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Load failed" });
    }
  },
);

app.post(
  "/api/business-model/broiler-ops/checkin",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const cycleId = String(body.cycleId ?? "flock-1");
      const id = broilerOpsDb.addCheckin(req.authUser.id, cycleId, {
        feedOk: Boolean(body.feedOk ?? true),
        waterOk: Boolean(body.waterOk ?? true),
        photoOk: Boolean(body.photoOk),
        notes: String(body.notes ?? ""),
        onDate: body.onDate ? String(body.onDate) : null,
      });
      res.json({ ok: true, id: Number(id) });
    } catch (e) {
      console.error("[ERROR]", "[api] broiler-ops checkin:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Save failed" });
    }
  },
);

app.post(
  "/api/business-model/broiler-ops/mortality",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const cycleId = String(body.cycleId ?? "flock-1");
      const id = broilerOpsDb.addMortalityEvent(req.authUser.id, cycleId, Number(body.birdsLost ?? 0), String(body.notes ?? ""), body.onDate ? String(body.onDate) : null);
      res.json({ ok: true, id: Number(id) });
    } catch (e) {
      console.error("[ERROR]", "[api] broiler-ops mortality post:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Save failed" });
    }
  },
);

app.post(
  "/api/business-model/broiler-ops/vet-report",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const cycleId = String(body.cycleId ?? "flock-1");
      const id = broilerOpsDb.addVetReport(req.authUser.id, cycleId, String(body.summary ?? ""), String(body.status ?? "Moderate"), body.onDate ? String(body.onDate) : null);
      res.json({ ok: true, id: Number(id) });
    } catch (e) {
      console.error("[ERROR]", "[api] broiler-ops vet post:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Save failed" });
    }
  },
);

app.post(
  "/api/business-model/broiler-ops/snapshot",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const label = String(body.label ?? "Snapshot");
      const inputs = body.inputs && typeof body.inputs === "object" ? body.inputs : {};
      const id = broilerOpsDb.saveCycleSnapshot(req.authUser.id, label, JSON.stringify(inputs));
      res.json({ ok: true, id: Number(id) });
    } catch (e) {
      console.error("[ERROR]", "[api] broiler-ops snapshot:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Save failed" });
    }
  },
);

app.post(
  "/api/business-model/broiler-ops/seed-demo",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const cycleId = String(body.cycleId ?? "flock-1");
      const seeded = broilerOpsDb.seedDemoDataIfEmpty(req.authUser.id, cycleId);
      res.json({ ok: true, seeded });
    } catch (e) {
      console.error("[ERROR]", "[api] broiler-ops seed:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Seed failed" });
    }
  },
);

app.post(
  "/api/business-model/broiler",
  requireAuth,
  requireClevaWorkspace,
  requirePageAccess("cleva_business_model"),
  (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const inp = mergeBroilerInputs(body.inputs);
      const summary = broilerSummary(inp);
      const trajectory = dailyTrajectory(inp);
      const insights = insightMessagesBroiler(inp, trajectory);
      const weeklyMortality = weeklyMortalityRates(trajectory);
      res.json({ ok: true, inputs: inp, summary, trajectory, insights, weeklyMortality });
    } catch (e) {
      console.error("[ERROR]", "[api] broiler:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Broiler model failed" });
    }
  },
);

app.get("/api/server-time", requireAuth, (_req, res) => {
  const now = new Date();
  res.json({
    iso: now.toISOString(),
    kigali: now.toLocaleString("en-GB", { timeZone: "Africa/Kigali", dateStyle: "full", timeStyle: "medium" }),
  });
});

app.post("/api/log-schedule", requireAuth, requireFarmAccess, requirePageAccess("farm_schedule_settings"), requireLogScheduleEditor, async (req, res) => {
  const body = req.body ?? {};
  const flockId = String(body.flockId ?? "");
  const role = String(body.role ?? "laborer");
  const intervalHours = Number(body.intervalHours);
  const windowOpen = String(body.windowOpen ?? "06:00");
  const windowClose = String(body.windowClose ?? "18:00");
  if (!flockId || !flocksById.has(flockId)) {
    res.status(400).json({ error: "Valid flockId required" });
    return;
  }
  if (!Number.isFinite(intervalHours) || intervalHours <= 0) {
    res.status(400).json({ error: "intervalHours must be positive" });
    return;
  }
  if (!systemConfig.validateAgainstCategory("log_schedule_role", role, systemConfig.getStaticFallbackCodes("log_schedule_role"))) {
    res.status(400).json({ error: "Invalid role for log schedule" });
    return;
  }
  let id = `ls_${crypto.randomBytes(6).toString("hex")}`;
  const createdAtIso = new Date().toISOString();
  const row = {
    id,
    flockId,
    role,
    intervalHours,
    windowOpen,
    windowClose,
    createdAt: createdAtIso,
  };
  if (hasDb() && isPersistableUuid(flockId)) {
    try {
      const ins = await dbQuery(
        `INSERT INTO log_schedule (flock_id, role, interval_hours, window_open, window_close)
         VALUES ($1::uuid, $2, $3::numeric, $4::time, $5::time)
         RETURNING id::text AS id, created_at AS "createdAt"`,
        [flockId, role, intervalHours, windowOpen, windowClose]
      );
      const r0 = ins.rows[0];
      if (r0?.id) {
        id = String(r0.id);
        row.id = id;
        const ca = r0.createdAt;
        if (ca) row.createdAt = ca instanceof Date ? ca.toISOString() : String(ca);
      }
    } catch (e) {
      console.error("[ERROR]", "[db] POST log-schedule:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Could not save log schedule." });
      return;
    }
  }
  logSchedules.push(row);
  appendAudit(req.authUser.id, req.authUser.role, "log_schedule.create", "flock", flockId, { scheduleId: id });
  res.status(201).json({ schedule: row });
});

app.get("/api/log-schedule/:flockId", requireAuth, requireFarmAccess, requirePageAccess("farm_schedule_settings"), requireLogScheduleEditor, (req, res) => {
  const flockId = req.params.flockId;
  const list = logSchedules.filter((s) => sameFlockId(s.flockId, flockId));
  res.json({ schedules: list });
});

app.patch("/api/log-schedule/:id", requireAuth, requireFarmAccess, requirePageAccess("farm_schedule_settings"), requireLogScheduleEditor, async (req, res) => {
  const s = logSchedules.find((x) => x.id === req.params.id);
  if (!s) {
    res.status(404).json({ error: "Schedule not found" });
    return;
  }
  const body = req.body ?? {};
  if (body.intervalHours != null) {
    const n = Number(body.intervalHours);
    if (Number.isFinite(n) && n > 0) s.intervalHours = n;
  }
  if (body.windowOpen != null) s.windowOpen = String(body.windowOpen);
  if (body.windowClose != null) s.windowClose = String(body.windowClose);
  if (body.role != null) {
    const nextRole = String(body.role);
    if (!systemConfig.validateAgainstCategory("log_schedule_role", nextRole, systemConfig.getStaticFallbackCodes("log_schedule_role"))) {
      res.status(400).json({ error: "Invalid role for log schedule" });
      return;
    }
    s.role = nextRole;
  }
  if (hasDb() && isPersistableUuid(s.id)) {
    try {
      await dbQuery(
        `UPDATE log_schedule
            SET interval_hours = $2::numeric,
                window_open = $3::time,
                window_close = $4::time,
                role = $5
          WHERE id = $1::uuid`,
        [s.id, s.intervalHours, s.windowOpen, s.windowClose, s.role]
      );
    } catch (e) {
      console.error("[ERROR]", "[db] PATCH log-schedule:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Could not update log schedule." });
      return;
    }
  }
  appendAudit(req.authUser.id, req.authUser.role, "log_schedule.update", "flock", s.flockId, { scheduleId: s.id });
  res.json({ schedule: s });
});

app.delete("/api/log-schedule/:id", requireAuth, requireFarmAccess, requirePageAccess("farm_schedule_settings"), requireLogScheduleEditor, async (req, res) => {
  const i = logSchedules.findIndex((x) => x.id === req.params.id);
  if (i < 0) {
    res.status(404).json({ error: "Schedule not found" });
    return;
  }
  const [removed] = logSchedules.splice(i, 1);
  if (hasDb() && isPersistableUuid(removed.id)) {
    try {
      await dbQuery(`DELETE FROM log_schedule WHERE id = $1::uuid`, [removed.id]);
    } catch (e) {
      console.error("[ERROR]", "[db] DELETE log-schedule:", e instanceof Error ? e.message : e);
      logSchedules.splice(i, 0, removed);
      res.status(503).json({ error: "Could not delete log schedule." });
      return;
    }
  }
  appendAudit(req.authUser.id, req.authUser.role, "log_schedule.delete", "flock", removed.flockId, {
    scheduleId: removed.id,
  });
  res.json({ ok: true });
});

app.post("/api/payroll-impact", requireAuth, requireFarmAccess, requirePageAccess("farm_payroll"), async (req, res) => {
  if (!canManageLogScheduleAndPayroll(req.authUser)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const body = req.body ?? {};
  const userId = String(body.user_id ?? "");
  const logType = String(body.log_type ?? "daily_log").trim() || "daily_log";
  const rwfDelta = Number(body.rwf_delta);
  if (!userId || !usersById.has(userId)) {
    res.status(400).json({ error: "user_id required" });
    return;
  }
  if (!Number.isFinite(rwfDelta)) {
    res.status(400).json({ error: "rwf_delta required" });
    return;
  }
  const periodStart = String(body.period_start ?? kigaliYmd(new Date()));
  const periodEnd = String(body.period_end ?? periodStart);
  const reason = String(body.reason ?? "Manual adjustment");
  const logId = String(body.log_id ?? `manual_${crypto.randomBytes(4).toString("hex")}`);
  const submittedAt = String(body.submitted_at ?? new Date().toISOString());
  const manualFlockId = body.flock_id != null && String(body.flock_id).trim() ? String(body.flock_id).trim() : null;
  let id = `pi_${crypto.randomBytes(6).toString("hex")}`;
  const createdAtIso = new Date().toISOString();
  const row = {
    id,
    userId,
    logId,
    logType,
    rwfDelta,
    reason,
    periodStart,
    periodEnd,
    approvedBy: null,
    approvedAt: null,
    createdAt: createdAtIso,
    submittedAt,
    onTime: null,
    flockId: manualFlockId && isPersistableUuid(manualFlockId) ? manualFlockId : null,
  };
  if (hasDb() && isPersistableUuid(userId)) {
    try {
      const fUuid = row.flockId;
      const ins = await dbQuery(
        `INSERT INTO payroll_impact (user_id, log_id, log_type, rwf_delta, reason, period_start, period_end, submitted_at, on_time, flock_id)
           VALUES ($1::uuid, $2, $3, $4::numeric, $5, $6::date, $7::date, $8::timestamptz, NULL, $9::uuid)
         RETURNING id::text AS id, created_at AS "createdAt"`,
        [userId, logId, logType, rwfDelta, reason, periodStart, periodEnd, submittedAt, fUuid]
      );
      const r0 = ins.rows[0];
      if (r0?.id) {
        row.id = String(r0.id);
        const ca = r0.createdAt;
        if (ca) row.createdAt = ca instanceof Date ? ca.toISOString() : String(ca);
      }
    } catch (e) {
      console.error("[ERROR]", "[db] payroll manual INSERT:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Could not save payroll impact." });
      return;
    }
  }
  payrollImpacts.unshift(row);
  appendAudit(req.authUser.id, req.authUser.role, "payroll.impact.manual", "payroll_impact", row.id, {
    userId,
    rwfDelta,
  });
  res.status(201).json({ entry: row });
});

app.get(
  "/api/payroll-impact",
  requireAuth,
  requireFarmAccess,
  requireAnyPageAccess(["farm_payroll", "laborer_earnings"]),
  async (req, res) => {
  const isField = isFieldPayrollViewer(req.authUser);
  const isPayrollManager = canManageLogScheduleAndPayroll(req.authUser);
  if (!isField && !isPayrollManager) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const userIdQ = String(req.query.user_id ?? "").trim();
  const periodStart = String(req.query.period_start ?? "").trim();
  const periodEnd = String(req.query.period_end ?? "").trim();
  const approvedQ = req.query.approved;
  if (isField && userIdQ && userIdQ !== req.authUser.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const shouldUseDbQuery = hasDb() && (isPayrollManager || isPersistableUuid(req.authUser.id));
  if (shouldUseDbQuery) {
    try {
      const where = [];
      const params = [];
      if (isField) {
        params.push(req.authUser.id);
        where.push(`p.user_id::text = $${params.length}`);
      } else if (userIdQ) {
        params.push(userIdQ);
        where.push(`p.user_id::text = $${params.length}`);
      }
      if (periodStart) {
        params.push(periodStart);
        where.push(`p.period_end >= $${params.length}::date`);
      }
      if (periodEnd) {
        params.push(periodEnd);
        where.push(`p.period_start <= $${params.length}::date`);
      }
      if (approvedQ === "true") where.push(`p.approved_at IS NOT NULL`);
      if (approvedQ === "false") where.push(`p.approved_at IS NULL`);
      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const q = await dbQuery(
        `SELECT p.id::text AS id,
                p.user_id::text AS "userId",
                p.log_id AS "logId",
                p.log_type AS "logType",
                p.rwf_delta::float AS "rwfDelta",
                COALESCE(p.reason, '') AS reason,
                p.period_start::text AS "periodStart",
                p.period_end::text AS "periodEnd",
                p.approved_by::text AS "approvedBy",
                p.approved_at AS "approvedAt",
                p.created_at AS "createdAt",
                p.submitted_at AS "submittedAt",
                p.on_time AS "onTime",
                p.flock_id::text AS "flockId",
                COALESCE(u.full_name, u.name, u.email, p.user_id::text) AS "workerName",
                COALESCE(u.role, '') AS "workerRole"
           FROM payroll_impact p
           LEFT JOIN users u ON u.id = p.user_id
           ${whereSql}
          ORDER BY p.submitted_at DESC, p.created_at DESC
          LIMIT 1000`,
        params
      );
      const entries = q.rows.map((r) => ({
        id: String(r.id),
        userId: String(r.userId),
        logId: String(r.logId ?? ""),
        logType: String(r.logType ?? ""),
        rwfDelta: Number(r.rwfDelta) || 0,
        reason: String(r.reason ?? ""),
        periodStart: ymdFromPgDate(r.periodStart),
        periodEnd: ymdFromPgDate(r.periodEnd),
        approvedBy: r.approvedBy != null ? String(r.approvedBy) : null,
        approvedAt: r.approvedAt instanceof Date ? r.approvedAt.toISOString() : r.approvedAt != null ? String(r.approvedAt) : null,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt != null ? String(r.createdAt) : null,
        submittedAt: r.submittedAt instanceof Date ? r.submittedAt.toISOString() : r.submittedAt != null ? String(r.submittedAt) : null,
        onTime: r.onTime == null ? null : Boolean(r.onTime),
        flockId: r.flockId != null ? String(r.flockId) : null,
        workerName: String(r.workerName ?? ""),
        workerRole: String(r.workerRole ?? ""),
      }));
      let mergedEntries = entries;
      if (isPayrollManager) {
        const memOnly = payrollImpacts.filter((p) => !isPersistableUuid(String(p.id ?? "")));
        const filteredMem = memOnly.filter((p) => {
          if (userIdQ && p.userId !== userIdQ) return false;
          if (periodStart && p.periodEnd < periodStart) return false;
          if (periodEnd && p.periodStart > periodEnd) return false;
          if (approvedQ === "true" && p.approvedAt == null) return false;
          if (approvedQ === "false" && p.approvedAt != null) return false;
          return true;
        }).map((p) => ({
          ...p,
          workerName: usersById.get(p.userId)?.displayName ?? p.userId,
          workerRole: usersById.get(p.userId)?.role ?? "",
        }));
        mergedEntries = [...entries, ...filteredMem].sort((a, b) => (String(a.submittedAt) < String(b.submittedAt) ? 1 : -1));
      }
      let totals = null;
      if (isField) {
        let netAll = 0;
        let netApproved = 0;
        let netPending = 0;
        for (const p of mergedEntries) {
          const d = Number(p.rwfDelta) || 0;
          netAll += d;
          if (p.approvedAt != null) netApproved += d;
          else netPending += d;
        }
        totals = { netAll, netApproved, netPending };
      }
      res.json({ entries: mergedEntries, totals });
      return;
    } catch (e) {
      console.error("[ERROR]", "[db] GET /api/payroll-impact:", e instanceof Error ? e.message : e);
    }
  }
  let list = [...payrollImpacts];
  if (isField) list = list.filter((p) => p.userId === req.authUser.id);
  else if (userIdQ) list = list.filter((p) => p.userId === userIdQ);
  if (periodStart) list = list.filter((p) => p.periodEnd >= periodStart);
  if (periodEnd) list = list.filter((p) => p.periodStart <= periodEnd);
  if (approvedQ === "true") list = list.filter((p) => p.approvedAt != null);
  if (approvedQ === "false") list = list.filter((p) => p.approvedAt == null);
  const enriched = list.map((p) => {
    const u = usersById.get(p.userId);
    return {
      ...p,
      workerName: u?.displayName ?? p.userId,
      workerRole: u?.role ?? "",
    };
  });

  let totals = null;
  if (isField) {
    let netAll = 0;
    let netApproved = 0;
    let netPending = 0;
    for (const p of enriched) {
      const d = Number(p.rwfDelta);
      netAll += d;
      if (p.approvedAt != null) netApproved += d;
      else netPending += d;
    }
    totals = { netAll, netApproved, netPending };
  }

  res.json({ entries: enriched, totals });
});

app.patch("/api/payroll-impact/:id/approve", requireAuth, requireFarmAccess, requirePageAccess("farm_payroll"), requirePayrollApprover, async (req, res) => {
  const id = String(req.params.id);
  if (hasDb() && isPersistableUuid(id) && isPersistableUuid(req.authUser.id)) {
    try {
      const r = await dbQuery(
        `UPDATE payroll_impact
            SET approved_by = $2::uuid, approved_at = now()
          WHERE id = $1::uuid
          RETURNING id::text AS id, approved_by::text AS "approvedBy", approved_at AS "approvedAt"`,
        [id, req.authUser.id]
      );
      if (r.rowCount === 0) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const mem = payrollImpacts.find((x) => x.id === id);
      if (mem) {
        mem.approvedBy = r.rows[0]?.approvedBy ? String(r.rows[0].approvedBy) : req.authUser.id;
        mem.approvedAt = r.rows[0]?.approvedAt instanceof Date ? r.rows[0].approvedAt.toISOString() : new Date().toISOString();
      }
      appendAudit(req.authUser.id, req.authUser.role, "payroll.impact.approve", "payroll_impact", id, {});
      res.json({ ok: true, id });
      return;
    } catch (e) {
      console.error("[ERROR]", "[db] PATCH /api/payroll-impact/:id/approve:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Could not approve payroll line." });
      return;
    }
  }
  const p = payrollImpacts.find((x) => x.id === id);
  if (!p) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  p.approvedBy = req.authUser.id;
  p.approvedAt = new Date().toISOString();
  await updatePayrollImpactApprovalDb(p);
  appendAudit(req.authUser.id, req.authUser.role, "payroll.impact.approve", "payroll_impact", p.id, {});
  res.json({ entry: p });
});

app.post("/api/payroll-impact/bulk-approve", requireAuth, requireFarmAccess, requirePageAccess("farm_payroll"), requirePayrollApprover, async (req, res) => {
  const body = req.body ?? {};
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : null;
  if (hasDb() && isPersistableUuid(req.authUser.id)) {
    try {
      let sql = `UPDATE payroll_impact SET approved_by = $1::uuid, approved_at = now() WHERE approved_at IS NULL`;
      const params = [req.authUser.id];
      if (ids && ids.length > 0) {
        params.push(ids);
        sql += ` AND id::text = ANY($2::text[])`;
      }
      sql += ` RETURNING id::text AS id, approved_at AS "approvedAt"`;
      const r = await dbQuery(sql, params);
      for (const row of r.rows) {
        const id = String(row.id);
        const mem = payrollImpacts.find((p) => p.id === id);
        if (mem) {
          mem.approvedBy = req.authUser.id;
          mem.approvedAt = row.approvedAt instanceof Date ? row.approvedAt.toISOString() : new Date().toISOString();
        }
      }
      appendAudit(req.authUser.id, req.authUser.role, "payroll.impact.bulk_approve", "payroll_impact", null, { count: r.rowCount });
      res.json({ approved: r.rowCount });
      return;
    } catch (e) {
      console.error("[ERROR]", "[db] POST /api/payroll-impact/bulk-approve:", e instanceof Error ? e.message : e);
      res.status(503).json({ error: "Could not bulk-approve payroll lines." });
      return;
    }
  }
  let n = 0;
  const at = new Date().toISOString();
  for (const p of payrollImpacts) {
    if (p.approvedAt != null) continue;
    if (ids && !ids.includes(p.id)) continue;
    p.approvedBy = req.authUser.id;
    p.approvedAt = at;
    await updatePayrollImpactApprovalDb(p);
    n += 1;
  }
  appendAudit(req.authUser.id, req.authUser.role, "payroll.impact.bulk_approve", "payroll_impact", null, { count: n });
  res.json({ ok: true, approvedCount: n });
});

// -------------------------
// Medicine ops v2
// -------------------------

app.get("/api/medicine", requireAuth, requireFarmAccess, requirePageAccess("farm_treatments"), requireAction("flock.view"), requireTreatmentLogger, async (_req, res) => {
  if (!hasDb()) {
    res.status(503).json({ error: "Database unavailable. Configure DATABASE_URL." });
    return;
  }
  try {
    const r = await dbQuery(
      `SELECT id, name, category, unit, quantity, withdrawal_days AS "withdrawalDays",
              supplier, expiry_date AS "expiryDate", low_stock_threshold AS "lowStockThreshold", created_at AS "createdAt"
         FROM medicine_inventory
        ORDER BY name ASC`
    );
    res.json({ medicines: r.rows });
  } catch (e) {
    console.error("[ERROR]", "[db] GET /api/medicine:", e instanceof Error ? e.message : e);
    res.status(503).json({ error: "Medicine inventory unavailable. Run latest migrations." });
  }
});

app.post("/api/medicine", requireAuth, requireFarmAccess, requirePageAccess("farm_treatments"), requireAction("treatment.execute"), requireTreatmentLogger, async (req, res) => {
  if (!hasDb()) {
    res.status(503).json({ error: "Database unavailable. Configure DATABASE_URL." });
    return;
  }
  const body = req.body ?? {};
  const name = String(body.name ?? "").trim();
  const category = String(body.category ?? "").trim();
  const unit = String(body.unit ?? "").trim();
  const quantity = Number(body.quantity ?? 0);
  const withdrawalDays = Math.max(0, Number(body.withdrawalDays ?? 0) || 0);
  const supplier = body.supplier == null ? null : String(body.supplier).trim() || null;
  const expiryDate = body.expiryDate == null || body.expiryDate === "" ? null : String(body.expiryDate).slice(0, 10);
  const lowStockThreshold = body.lowStockThreshold == null || body.lowStockThreshold === "" ? 10 : Number(body.lowStockThreshold);
  if (!name || !category || !unit || !Number.isFinite(quantity) || quantity < 0) {
    res.status(400).json({ error: "name, category, unit and quantity>=0 are required" });
    return;
  }
  if (!systemConfig.validateAgainstCategory("medicine_category", category, systemConfig.getStaticFallbackCodes("medicine_category"))) {
    res.status(400).json({ error: "Invalid medicine category" });
    return;
  }
  if (!systemConfig.validateAgainstCategory("medicine_stock_unit", unit, systemConfig.getStaticFallbackCodes("medicine_stock_unit"))) {
    res.status(400).json({ error: "Invalid medicine stock unit" });
    return;
  }
  try {
    const r = await dbQuery(
      `INSERT INTO medicine_inventory
        (name, category, unit, quantity, withdrawal_days, supplier, expiry_date, low_stock_threshold)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, name, category, unit, quantity, withdrawal_days AS "withdrawalDays",
                 supplier, expiry_date AS "expiryDate", low_stock_threshold AS "lowStockThreshold", created_at AS "createdAt"`,
      [name, category, unit, quantity, withdrawalDays, supplier, expiryDate, lowStockThreshold]
    );
    appendAudit(req.authUser.id, req.authUser.role, "medicine.create", "medicine_inventory", r.rows[0]?.id ?? null, {
      name,
      quantity,
    });
    res.status(201).json({ medicine: r.rows[0] });
  } catch (e) {
    console.error("[ERROR]", "[db] POST /api/medicine:", e instanceof Error ? e.message : e);
    res.status(503).json({ error: "Unable to save medicine item." });
  }
});

app.get("/api/medicine/lots", requireAuth, requireFarmAccess, requirePageAccess("farm_treatments"), requireAction("flock.view"), requireTreatmentLogger, async (req, res) => {
  if (!hasDb()) {
    res.status(503).json({ error: "Database unavailable. Configure DATABASE_URL." });
    return;
  }
  const medicineId = String(req.query.medicine_id ?? "").trim();
  try {
    const r = await dbQuery(
      `SELECT l.id, l.medicine_id AS "medicineId", m.name AS "medicineName",
              l.lot_number AS "lotNumber", l.received_at AS "receivedAt", l.expiry_date AS "expiryDate",
              l.quantity_received AS "quantityReceived", l.quantity_remaining AS "quantityRemaining",
              l.supplier, l.invoice_ref AS "invoiceRef", l.created_at AS "createdAt"
         FROM medicine_lots l
         JOIN medicine_inventory m ON m.id = l.medicine_id
        WHERE ($1 = '' OR l.medicine_id::text = $1)
        ORDER BY l.expiry_date ASC NULLS LAST, l.received_at ASC`,
      [medicineId]
    );
    res.json({ lots: r.rows });
  } catch (e) {
    console.error("[ERROR]", "[db] GET /api/medicine/lots:", e instanceof Error ? e.message : e);
    res.status(503).json({ error: "Unable to load medicine lots." });
  }
});

app.post("/api/medicine/lots", requireAuth, requireFarmAccess, requirePageAccess("farm_treatments"), requireAction("treatment.execute"), requireTreatmentLogger, async (req, res) => {
  if (!hasDb()) {
    res.status(503).json({ error: "Database unavailable. Configure DATABASE_URL." });
    return;
  }
  const body = req.body ?? {};
  const medicineId = String(body.medicineId ?? "").trim();
  const lotNumber = String(body.lotNumber ?? "").trim();
  const receivedAt = String(body.receivedAt ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const expiryDate = body.expiryDate == null || body.expiryDate === "" ? null : String(body.expiryDate).slice(0, 10);
  const quantityReceived = Number(body.quantityReceived ?? 0);
  const supplier = body.supplier == null ? null : String(body.supplier).trim() || null;
  const invoiceRef = body.invoiceRef == null ? null : String(body.invoiceRef).trim() || null;
  if (!medicineId || !lotNumber || !Number.isFinite(quantityReceived) || quantityReceived <= 0) {
    res.status(400).json({ error: "medicineId, lotNumber and quantityReceived>0 are required" });
    return;
  }
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const ins = await client.query(
      `INSERT INTO medicine_lots
        (medicine_id, lot_number, received_at, expiry_date, quantity_received, quantity_remaining, supplier, invoice_ref)
       VALUES ($1,$2,$3,$4,$5,$5,$6,$7)
       RETURNING id, medicine_id AS "medicineId", lot_number AS "lotNumber", received_at AS "receivedAt",
                 expiry_date AS "expiryDate", quantity_received AS "quantityReceived", quantity_remaining AS "quantityRemaining",
                 supplier, invoice_ref AS "invoiceRef", created_at AS "createdAt"`,
      [medicineId, lotNumber, receivedAt, expiryDate, quantityReceived, supplier, invoiceRef]
    );
    await client.query(`UPDATE medicine_inventory SET quantity = quantity + $2 WHERE id = $1`, [medicineId, quantityReceived]);
    await client.query("COMMIT");
    appendAudit(req.authUser.id, req.authUser.role, "medicine.lot.receive", "medicine_lot", ins.rows[0]?.id ?? null, {
      medicineId,
      quantityReceived,
    });
    res.status(201).json({ lot: ins.rows[0] });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("[ERROR]", "[db] POST /api/medicine/lots:", e instanceof Error ? e.message : e);
    res.status(503).json({ error: "Unable to receive medicine lot." });
  } finally {
    client.release();
  }
});

app.get("/api/treatment-rounds", requireAuth, requireFarmAccess, requirePageAccess("farm_treatments"), requireAction("flock.view"), requireTreatmentLogger, async (req, res) => {
  if (!hasDb()) {
    res.status(503).json({ error: "Database unavailable. Configure DATABASE_URL." });
    return;
  }
  const flockId = String(req.query.flock_id ?? "").trim();
  const status = String(req.query.status ?? "").trim();
  try {
    const r = await dbQuery(
      `SELECT r.id, r.flock_id AS "flockId", r.medicine_id AS "medicineId", m.name AS "medicineName",
              r.planned_for AS "plannedFor", r.window_start AS "windowStart", r.window_end AS "windowEnd",
              r.route, r.dose_per_litre AS "dosePerLitre", r.dose_per_kg_feed AS "dosePerKgFeed", r.dose_per_bird AS "dosePerBird",
              r.planned_quantity AS "plannedQuantity", r.status, r.assigned_to_user_id AS "assignedToUserId",
              r.checklist, r.notes, r.created_by_user_id AS "createdByUserId", r.created_at AS "createdAt"
         FROM treatment_rounds r
         JOIN medicine_inventory m ON m.id = r.medicine_id
        WHERE ($1 = '' OR r.flock_id = $1)
          AND ($2 = '' OR r.status = $2)
        ORDER BY r.planned_for DESC`,
      [flockId, status]
    );
    res.json({ rounds: r.rows });
  } catch (e) {
    console.error("[ERROR]", "[db] GET /api/treatment-rounds:", e instanceof Error ? e.message : e);
    res.status(503).json({ error: "Unable to load treatment rounds." });
  }
});

app.get("/api/treatment-rounds/overdue", requireAuth, requireFarmAccess, requirePageAccess("farm_treatments"), requireAction("flock.view"), requireTreatmentLogger, async (req, res) => {
  if (!hasDb()) {
    res.status(503).json({ error: "Database unavailable. Configure DATABASE_URL." });
    return;
  }
  const flockId = String(req.query.flock_id ?? "").trim();
  try {
    const r = await dbQuery(
      `SELECT r.id, r.flock_id AS "flockId", r.medicine_id AS "medicineId", m.name AS "medicineName",
              r.planned_for AS "plannedFor", r.status, r.planned_quantity AS "plannedQuantity"
         FROM treatment_rounds r
         JOIN medicine_inventory m ON m.id = r.medicine_id
        WHERE ($1 = '' OR r.flock_id = $1)
          AND r.status IN ('planned','in_progress')
          AND r.planned_for < now()
        ORDER BY r.planned_for ASC`,
      [flockId]
    );
    const rows = r.rows.map((x) => {
      const dueMs = new Date(x.plannedFor).getTime();
      const mins = Math.max(0, Math.floor((Date.now() - dueMs) / (60 * 1000)));
      return { ...x, overdueMinutes: mins };
    });
    res.json({ overdueRounds: rows });
  } catch (e) {
    console.error("[ERROR]", "[db] GET /api/treatment-rounds/overdue:", e instanceof Error ? e.message : e);
    res.status(503).json({ error: "Unable to load overdue rounds." });
  }
});

app.get("/api/medicine/forecast", requireAuth, requireFarmAccess, requireAction("flock.view"), requireTreatmentLogger, async (req, res) => {
  if (!hasDb()) {
    res.status(503).json({ error: "Database unavailable. Configure DATABASE_URL." });
    return;
  }
  const lookbackDays = Math.max(7, Math.min(90, Number(req.query.lookback_days) || 30));
  try {
    const r = await dbQuery(
      `WITH daily_use AS (
         SELECT r.medicine_id,
                date_trunc('day', e.event_at)::date AS use_day,
                SUM(COALESCE(e.quantity_used, 0)) AS qty
           FROM treatment_round_events e
           JOIN treatment_rounds r ON r.id = e.round_id
          WHERE e.event_type = 'completed'
            AND e.event_at >= now() - ($1::text || ' days')::interval
          GROUP BY r.medicine_id, date_trunc('day', e.event_at)::date
       ),
       agg AS (
         SELECT medicine_id,
                COALESCE(SUM(qty), 0) AS total_used,
                COALESCE(AVG(qty), 0) AS avg_daily_used
           FROM daily_use
          GROUP BY medicine_id
       )
       SELECT m.id, m.name, m.unit, m.quantity,
              m.low_stock_threshold AS "lowStockThreshold",
              COALESCE(a.total_used, 0) AS "totalUsedInWindow",
              ROUND(COALESCE(a.avg_daily_used, 0)::numeric, 3) AS "avgDailyUse",
              CASE
                WHEN COALESCE(a.avg_daily_used, 0) > 0
                THEN ROUND((m.quantity / a.avg_daily_used)::numeric, 1)
                ELSE NULL
              END AS "daysOfCover",
              CASE
                WHEN COALESCE(a.avg_daily_used, 0) > 0
                  AND (m.quantity / a.avg_daily_used) <= 7
                THEN true
                ELSE false
              END AS "stockoutRisk7d"
         FROM medicine_inventory m
         LEFT JOIN agg a ON a.medicine_id = m.id
        ORDER BY "daysOfCover" ASC NULLS LAST, m.name ASC`,
      [String(lookbackDays)]
    );
    res.json({ lookbackDays, forecast: r.rows });
  } catch (e) {
    console.error("[ERROR]", "[db] GET /api/medicine/forecast:", e instanceof Error ? e.message : e);
    res.status(503).json({ error: "Unable to compute stock forecast." });
  }
});

app.post("/api/treatment-rounds", requireAuth, requireFarmAccess, requirePageAccess("farm_treatments"), requireAction("treatment.execute"), requireTreatmentLogger, async (req, res) => {
  if (!hasDb()) {
    res.status(503).json({ error: "Database unavailable. Configure DATABASE_URL." });
    return;
  }
  const body = req.body ?? {};
  const flockId = String(body.flockId ?? "").trim();
  const medicineId = String(body.medicineId ?? "").trim();
  const plannedFor = String(body.plannedFor ?? "").trim();
  const windowStart = body.windowStart == null || body.windowStart === "" ? null : String(body.windowStart);
  const windowEnd = body.windowEnd == null || body.windowEnd === "" ? null : String(body.windowEnd);
  const route = String(body.route ?? "").trim();
  const dosePerLitre = body.dosePerLitre == null || body.dosePerLitre === "" ? null : Number(body.dosePerLitre);
  const dosePerKgFeed = body.dosePerKgFeed == null || body.dosePerKgFeed === "" ? null : Number(body.dosePerKgFeed);
  const dosePerBird = body.dosePerBird == null || body.dosePerBird === "" ? null : Number(body.dosePerBird);
  const plannedQuantity = Number(body.plannedQuantity ?? 0);
  const assignedToUserId = body.assignedToUserId == null || body.assignedToUserId === "" ? null : String(body.assignedToUserId);
  const checklist = Array.isArray(body.checklist) ? body.checklist : [];
  const notes = body.notes == null ? null : String(body.notes);
  if (!flockId || !medicineId || !plannedFor || !route || !Number.isFinite(plannedQuantity) || plannedQuantity <= 0) {
    res.status(400).json({ error: "flockId, medicineId, plannedFor, route and plannedQuantity>0 are required" });
    return;
  }
  if (!systemConfig.validateAgainstCategory("medicine_admin_route", route, systemConfig.getStaticFallbackCodes("medicine_admin_route"))) {
    res.status(400).json({ error: "Invalid route for treatment round" });
    return;
  }
  try {
    const r = await dbQuery(
      `INSERT INTO treatment_rounds
        (flock_id, medicine_id, planned_for, window_start, window_end, route, dose_per_litre, dose_per_kg_feed, dose_per_bird,
         planned_quantity, assigned_to_user_id, checklist, notes, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14)
       RETURNING id, flock_id AS "flockId", medicine_id AS "medicineId", planned_for AS "plannedFor",
                 window_start AS "windowStart", window_end AS "windowEnd", route,
                 dose_per_litre AS "dosePerLitre", dose_per_kg_feed AS "dosePerKgFeed", dose_per_bird AS "dosePerBird",
                 planned_quantity AS "plannedQuantity", status, assigned_to_user_id AS "assignedToUserId",
                 checklist, notes, created_by_user_id AS "createdByUserId", created_at AS "createdAt"`,
      [flockId, medicineId, plannedFor, windowStart, windowEnd, route, dosePerLitre, dosePerKgFeed, dosePerBird, plannedQuantity, assignedToUserId, JSON.stringify(checklist), notes, req.authUser.id]
    );
    appendAudit(req.authUser.id, req.authUser.role, "treatment.round.create", "treatment_round", r.rows[0]?.id ?? null, {
      flockId,
      plannedFor,
    });
    res.status(201).json({ round: r.rows[0] });
  } catch (e) {
    console.error("[ERROR]", "[db] POST /api/treatment-rounds:", e instanceof Error ? e.message : e);
    res.status(503).json({ error: "Unable to create treatment round." });
  }
});

app.patch("/api/treatment-rounds/:id/status", requireAuth, requireFarmAccess, requirePageAccess("farm_treatments"), requireAction("treatment.execute"), requireTreatmentLogger, async (req, res) => {
  if (!hasDb()) {
    res.status(503).json({ error: "Database unavailable. Configure DATABASE_URL." });
    return;
  }
  const id = String(req.params.id ?? "").trim();
  const body = req.body ?? {};
  const status = String(body.status ?? "").trim();
  const quantityUsed = body.quantityUsed == null || body.quantityUsed === "" ? null : Number(body.quantityUsed);
  const note = body.note == null ? null : String(body.note);
  if (!["planned", "in_progress", "completed", "missed", "cancelled"].includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const rr = await client.query(`SELECT id, medicine_id, planned_quantity AS "plannedQuantity" FROM treatment_rounds WHERE id = $1 FOR UPDATE`, [id]);
    if (!rr.rows.length) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Round not found" });
      return;
    }
    await client.query(`UPDATE treatment_rounds SET status = $2 WHERE id = $1`, [id, status]);
    if (status === "completed") {
      const q = quantityUsed != null && Number.isFinite(quantityUsed) && quantityUsed > 0
        ? quantityUsed
        : Number(rr.rows[0].plannedQuantity) || 0;
      if (q > 0) {
        // FEFO lot deduction
        const lots = await client.query(
          `SELECT id, quantity_remaining AS "quantityRemaining"
             FROM medicine_lots
            WHERE medicine_id = $1
              AND quantity_remaining > 0
            ORDER BY expiry_date ASC NULLS LAST, received_at ASC
            FOR UPDATE`,
          [rr.rows[0].medicine_id]
        );
        let remaining = q;
        for (const lot of lots.rows) {
          if (remaining <= 0) break;
          const lotQty = Number(lot.quantityRemaining) || 0;
          const take = Math.min(lotQty, remaining);
          if (take <= 0) continue;
          await client.query(`UPDATE medicine_lots SET quantity_remaining = quantity_remaining - $2 WHERE id = $1`, [lot.id, take]);
          remaining -= take;
        }
        await client.query(`UPDATE medicine_inventory SET quantity = GREATEST(quantity - $2, 0) WHERE id = $1`, [rr.rows[0].medicine_id, q]);
        await client.query(
          `INSERT INTO treatment_round_events (round_id, event_type, quantity_used, actor_user_id, note)
           VALUES ($1,'completed',$2,$3,$4)`,
          [id, q, req.authUser.id, note]
        );
      } else {
        await client.query(
          `INSERT INTO treatment_round_events (round_id, event_type, actor_user_id, note)
           VALUES ($1,'completed',$2,$3)`,
          [id, req.authUser.id, note]
        );
      }
    } else {
      await client.query(
        `INSERT INTO treatment_round_events (round_id, event_type, actor_user_id, note)
         VALUES ($1,$2,$3,$4)`,
        [id, status === "missed" ? "missed" : "note", req.authUser.id, note]
      );
    }
    await client.query("COMMIT");
    appendAudit(req.authUser.id, req.authUser.role, "treatment.round.status", "treatment_round", id, { status });
    res.json({ ok: true });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("[ERROR]", "[db] PATCH /api/treatment-rounds/:id/status:", e instanceof Error ? e.message : e);
    res.status(503).json({ error: "Unable to update treatment round status." });
  } finally {
    client.release();
  }
});

app.get("/api/flocks/:id/eligibility", requireAuth, requireFarmAccess, requirePageAccess("farm_flocks"), requireAction("flock.view"), async (req, res) => {
  if (!hasDb()) {
    res.json({ eligibleForSlaughter: true, blockers: [] });
    return;
  }
  const flockId = String(req.params.id ?? "").trim();
  try {
    // Active withdrawal blockers from legacy flock_treatments
    const t = await dbQuery(
      `SELECT medicine_name AS "medicineName",
              at,
              withdrawal_days AS "withdrawalDays"
         FROM flock_treatments
        WHERE flock_id = $1
        ORDER BY at DESC`,
      [flockId]
    );
    const nowMs = Date.now();
    const treatmentBlockers = t.rows
      .map((x) => {
        const atMs = new Date(x.at).getTime();
        const wd = Math.max(0, Number(x.withdrawalDays) || 0);
        const safe = new Date(atMs + wd * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        return { medicineName: x.medicineName, safeAfter: safe, active: nowMs < atMs + wd * 24 * 60 * 60 * 1000 };
      })
      .filter((x) => x.active);
    // Missed rounds are operational blockers
    const rounds = await dbQuery(
      `SELECT id, planned_for AS "plannedFor", status
         FROM treatment_rounds
        WHERE flock_id = $1
          AND status IN ('missed')
        ORDER BY planned_for DESC
        LIMIT 5`,
      [flockId]
    ).catch(() => ({ rows: [] }));
    const missedRoundBlockers = rounds.rows.map((r) => ({
      type: "missed_round",
      roundId: r.id,
      plannedFor: r.plannedFor,
    }));
    const blockers = [
      ...treatmentBlockers.map((b) => ({ type: "withdrawal", ...b })),
      ...missedRoundBlockers,
    ];
    res.json({
      eligibleForSlaughter: blockers.length === 0,
      blockers,
    });
  } catch (e) {
    console.error("[ERROR]", "[db] GET /api/flocks/:id/eligibility:", e instanceof Error ? e.message : e);
    res.status(503).json({ error: "Unable to compute eligibility." });
  }
});

function trendArrow(delta, epsilon = 0.0001) {
  if (delta > epsilon) return "↑ improving";
  if (delta < -epsilon) return "↓ worsening";
  return "→ stable";
}

function relativeTimeStatus(targetIso, nowMs = Date.now()) {
  if (!targetIso) return { label: "No check-in data", severity: "watch", overdueHours: 0 };
  const ms = new Date(targetIso).getTime() - nowMs;
  const absMin = Math.max(1, Math.floor(Math.abs(ms) / 60000));
  if (ms < 0) {
    const h = Math.max(1, Math.floor(absMin / 60));
    return { label: `Overdue by ${h}h`, severity: "critical", overdueHours: h };
  }
  if (absMin <= 90) return { label: `Due in ${absMin}m`, severity: "warning", overdueHours: 0 };
  return { label: `Due in ${Math.floor(absMin / 60)}h`, severity: "healthy", overdueHours: 0 };
}

app.get("/api/farm/ops-board", requireAuth, requireFarmAccess, requireAnyPageAccess(["dashboard_laborer", "dashboard_vet", "dashboard_management"]), requireAction("flock.view"), async (_req, res) => {
  if (!hasDb()) {
    res.status(503).json({ error: "Database unavailable. Configure DATABASE_URL." });
    return;
  }
  try {
    try {
      await syncFlocksFromDbToMemory();
    } catch {
      /* ignore */
    }

    const flocks = await dbQuery(
      `SELECT id,
              COALESCE(code, CONCAT('Flock ', LEFT(id::text, 8))) AS label,
              placement_date AS "placementDate",
              initial_count AS "initialCount",
              initial_weight_kg AS "initialWeightKg",
              breed_code AS "breedCode",
              verified_live_count AS "verifiedLiveCount",
              target_weight_kg AS "targetWeightKg",
              status
         FROM poultry_flocks
        WHERE status = 'active'
        ORDER BY placement_date DESC`
    );

    const latestWeigh = await dbQuery(
      `WITH ranked AS (
         SELECT flock_id,
                weigh_date AS "latestWeighDate",
                age_days AS "latestAgeDays",
                avg_weight_kg AS "latestWeightKg",
                fcr AS "sampleFcrBiomass",
                LAG(avg_weight_kg) OVER (PARTITION BY flock_id ORDER BY weigh_date DESC) AS "prevWeightKg",
                LAG(weigh_date) OVER (PARTITION BY flock_id ORDER BY weigh_date DESC) AS "prevWeighDate"
           FROM weigh_ins
          WHERE flock_id IN (SELECT id FROM poultry_flocks WHERE status = 'active')
       )
       SELECT DISTINCT ON (flock_id)
              flock_id AS "flockId",
              "latestWeighDate",
              "latestAgeDays",
              "latestWeightKg",
              "sampleFcrBiomass",
              "prevWeightKg",
              "prevWeighDate"
         FROM ranked
        ORDER BY flock_id, "latestWeighDate" DESC`
    ).catch(() => ({ rows: [] }));

    const slaughterAgg = await dbQuery(
      `SELECT flock_id::text AS "flockId",
              COALESCE(SUM(birds_slaughtered), 0)::float AS "slaughterTotal"
         FROM flock_slaughter_events
        WHERE flock_id IN (SELECT id FROM poultry_flocks WHERE status = 'active')
        GROUP BY flock_id`
    ).catch(() => ({ rows: [] }));

    // Mortality: flock_mortality_events (field + check-in) + poultry_daily_logs (legacy daily form).
    // Same inclusion rules as buildFlockPerformanceSummary. If both channels record the same losses,
    // totals can double — prefer one operational path per flock.
    const mortalityAgg = await dbQuery(
      `WITH events AS (
         SELECT e.flock_id,
                e.count,
                (timezone('Africa/Kigali', e.at))::date AS d
           FROM flock_mortality_events e
          WHERE e.flock_id IN (SELECT id FROM poultry_flocks WHERE status = 'active')
            AND e.submission_status IS DISTINCT FROM 'rejected'
            AND COALESCE(e.affects_live_count, true) = true
       ),
       daily AS (
         SELECT l.flock_id,
                GREATEST(COALESCE(l.mortality, 0), 0)::int AS count,
                l.log_date::date AS d
           FROM poultry_daily_logs l
          WHERE l.flock_id IN (SELECT id FROM poultry_flocks WHERE status = 'active')
            AND l.validation_status::text NOT IN ('draft', 'rejected')
            AND COALESCE(l.mortality, 0) > 0
       ),
       combined AS (
         SELECT flock_id, count, d FROM events
         UNION ALL
         SELECT flock_id, count, d FROM daily
       )
       SELECT flock_id::text AS "flockId",
              COALESCE(SUM(count), 0)::float AS "mortalityTotal",
              COALESCE(SUM(CASE WHEN d >= (timezone('Africa/Kigali', now()))::date - 7 THEN count ELSE 0 END), 0)::float AS "mortality7d",
              COALESCE(SUM(CASE WHEN d >= (timezone('Africa/Kigali', now()))::date - 1 THEN count ELSE 0 END), 0)::float AS "mortality24h",
              COALESCE(SUM(CASE
                WHEN d >= (timezone('Africa/Kigali', now()))::date - 2
                 AND d < (timezone('Africa/Kigali', now()))::date - 1
                THEN count ELSE 0 END), 0)::float AS "mortalityPrev24h",
              MAX(d)::text AS "latestLogDate"
         FROM combined
        GROUP BY flock_id`
    ).catch(() => ({ rows: [] }));

    const overdueAgg = await dbQuery(
      `SELECT flock_id::text AS "flockId",
              COUNT(*)::int AS "overdueRounds",
              MIN(planned_for) AS "oldestPlannedFor"
         FROM treatment_rounds
        WHERE status IN ('planned','in_progress')
          AND planned_for < now()
          AND flock_id IN (SELECT id FROM poultry_flocks WHERE status = 'active')
        GROUP BY flock_id`
    ).catch(() => ({ rows: [] }));

    const withdrawalAgg = await dbQuery(
      `SELECT flock_id::text AS "flockId",
              COUNT(*)::int AS "withdrawalBlockers",
              MIN((at + (withdrawal_days || ' days')::interval)) AS "safeAfterAt"
         FROM flock_treatments
        WHERE (at + (withdrawal_days || ' days')::interval) > now()
          AND flock_id IN (SELECT id FROM poultry_flocks WHERE status = 'active')
        GROUP BY flock_id`
    ).catch(() => ({ rows: [] }));

    const weighByFlock = new Map(latestWeigh.rows.map((r) => [String(r.flockId), r]));
    const mortalityByFlock = new Map(mortalityAgg.rows.map((r) => [String(r.flockId), r]));
    const slaughterByFlock = new Map(slaughterAgg.rows.map((r) => [String(r.flockId), r]));
    const overdueByFlock = new Map(overdueAgg.rows.map((r) => [String(r.flockId), r]));
    const withdrawalByFlock = new Map(withdrawalAgg.rows.map((r) => [String(r.flockId), r]));

    const rows = [];
    for (const f of flocks.rows) {
      const weigh = weighByFlock.get(String(f.id)) ?? {};
      const mortality = mortalityByFlock.get(String(f.id)) ?? {};
      const slaughter = slaughterByFlock.get(String(f.id)) ?? {};
      const overdue = overdueByFlock.get(String(f.id)) ?? {};
      const withdrawal = withdrawalByFlock.get(String(f.id)) ?? {};
      const label = String(f.label ?? "");
      const barn = label.includes("-") ? label.split("-")[0].trim() : "Unassigned";
      const ageDays = Math.max(
        0,
        Math.floor((Date.now() - new Date(`${String(f.placementDate)}T00:00:00Z`).getTime()) / 86400000)
      );

      const expectedWeight = interpolateCurve(BENCHMARK_CACHE.expectedWeightByDay, ageDays);
      const expectedMortality = interpolateCurve(BENCHMARK_CACHE.expectedMortalityByDay, ageDays);
      const [expectedFcrMin, expectedFcrMax] = expectedFcrRangeForDay(ageDays);

      const latestWeightKg = weigh.latestWeightKg != null ? Number(weigh.latestWeightKg) : null;
      const fcrSampleBiomassRatio = weigh.sampleFcrBiomass != null ? Number(weigh.sampleFcrBiomass) : null;
      const prevWeightKg = weigh.prevWeightKg != null ? Number(weigh.prevWeightKg) : null;
      const initialCount = Math.max(1, Number(f.initialCount || 1));

      const mortalityTotal = Number(mortality.mortalityTotal ?? 0);
      const slaughterToDate = Number(slaughter.slaughterTotal ?? 0);
      const verifiedLive =
        f.verifiedLiveCount != null && f.verifiedLiveCount !== ""
          ? Math.max(0, Math.floor(Number(f.verifiedLiveCount)))
          : null;
      const computedBirdsLive = Math.max(0, initialCount - mortalityTotal - slaughterToDate);
      const birdsLiveEstimate = verifiedLive != null ? verifiedLive : computedBirdsLive;

      let mem = flocksById.get(String(f.id));
      if (!mem) {
        mem = {
          id: String(f.id),
          label,
          placementDate: String(f.placementDate),
          initialCount,
          initialWeightKg: f.initialWeightKg != null ? Number(f.initialWeightKg) : 0,
          breedCode: f.breedCode != null ? String(f.breedCode) : "generic_broiler",
          verifiedLiveCount: verifiedLive,
          checkinBands: null,
        };
      }

      const feedToDate = totalFeedKgForFlock(String(f.id));

      const broiler = computeBroilerFcrPack(mem, {
        feedToDate,
        birdsLiveEstimate,
        latestAvgWeightKg: latestWeightKg,
        latestWeighDate: weigh.latestWeighDate ?? null,
        ageDays,
      });
      const latestFcr = broiler.fcrCumulative;

      const mortality7dCount = Number(mortality.mortality7d ?? 0);
      const mortality24h = Number(mortality.mortality24h ?? 0);
      const mortalityPrev24h = Number(mortality.mortalityPrev24h ?? 0);
      const mortalityRatePct = (mortalityTotal / initialCount) * 100;
      const mortality24hDeltaPct = ((mortality24h - mortalityPrev24h) / initialCount) * 100;

      const weightDeviationPct = latestWeightKg != null && expectedWeight > 0
        ? ((latestWeightKg - expectedWeight) / expectedWeight) * 100
        : 0;
      const weightDeficitPct = Math.max(0, -weightDeviationPct);
      const mortalityDeviationPct = expectedMortality > 0
        ? Math.max(0, ((mortalityRatePct - expectedMortality) / expectedMortality) * 100)
        : 0;
      const fcrDeviationPct = latestFcr != null
        ? Math.max(0, ((latestFcr - expectedFcrMax) / Math.max(0.1, expectedFcrMax)) * 100)
        : 0;

      const statusRef = flocksById.get(String(f.id)) ?? {
        id: String(f.id),
        label,
        placementDate: String(f.placementDate),
        checkinBands: null,
      };
      const checkinStatus = checkinStatusPayload(statusRef);
      const timeStatus = relativeTimeStatus(checkinStatus.nextDueAt);
      const overdueCount = Number(overdue.overdueRounds ?? 0);
      const withdrawalCount = Number(withdrawal.withdrawalBlockers ?? 0);

      const latestLogMs = mortality.latestLogDate ? new Date(`${mortality.latestLogDate}T00:00:00Z`).getTime() : null;
      const latestWeighMs = weigh.latestWeighDate ? new Date(`${weigh.latestWeighDate}T00:00:00Z`).getTime() : null;
      const latestCheckinMs = checkinStatus.lastCheckinAt ? new Date(checkinStatus.lastCheckinAt).getTime() : null;
      const freshestMs = [latestLogMs, latestWeighMs, latestCheckinMs].filter((x) => x != null).reduce((m, x) => Math.max(m, x), 0);
      const freshnessHours = freshestMs ? (Date.now() - freshestMs) / 3600000 : 999;
      const dataFreshnessScore = freshnessHours <= 6 ? 100 : freshnessHours <= 24 ? 75 : freshnessHours <= 48 ? 45 : 15;

      const mortalitySpikePct = Math.max(0, mortality24hDeltaPct);
      const weightTrendDelta = latestWeightKg != null && prevWeightKg != null ? latestWeightKg - prevWeightKg : 0;
      const volatilityBase = mortalitySpikePct * 30 + Math.max(0, -weightTrendDelta) * 40;
      const volatilityScore = clamp(volatilityBase * (mortalitySpikePct > 0.5 ? 1.6 : 1), 0, 100);

      const mortalityComponent = clamp(mortalityDeviationPct * (mortalitySpikePct > 0.5 ? 1.4 : 1), 0, 100);
      const weightComponent = clamp(weightDeficitPct * 3, 0, 100);
      const fcrComponent = clamp(fcrDeviationPct * 2.5, 0, 100);
      const missedCheckinComponent = clamp((timeStatus.overdueHours * 8) + (overdueCount * 12) + (100 - dataFreshnessScore) * 0.4, 0, 100);

      let riskScore = Math.round(
        mortalityComponent * 0.30 +
        weightComponent * 0.25 +
        fcrComponent * 0.15 +
        missedCheckinComponent * 0.15 +
        volatilityScore * 0.15
      );
      if (withdrawalCount > 0) riskScore = Math.max(riskScore, 70);
      riskScore = clamp(riskScore, 0, 100);

      const riskClass = riskScore <= 30
        ? "healthy"
        : riskScore <= 60
          ? "watch"
          : riskScore <= 80
            ? "at_risk"
            : "critical";

      const alerts = [];
      if (mortality24hDeltaPct > 0.5) alerts.push(`Mortality increased by ${mortality24hDeltaPct.toFixed(2)}% in 24h (threshold 0.5%)`);
      if (weightDeficitPct >= 5) alerts.push(`Weight is ${weightDeficitPct.toFixed(1)}% below expected for day ${ageDays}`);
      if (timeStatus.overdueHours > 0) alerts.push(`Check-in overdue by ${timeStatus.overdueHours}h`);
      if (latestFcr != null && latestFcr > expectedFcrMax) alerts.push(`FCR ${latestFcr.toFixed(2)} is above target max ${expectedFcrMax.toFixed(2)}`);
      if (dataFreshnessScore < 50) alerts.push(`Data is stale (updated ${Math.max(1, Math.round(freshnessHours))}h ago)`);

      const trendMortality = trendArrow(-mortality24hDeltaPct, 0.05);
      const trendWeight = trendArrow(weightTrendDelta, 0.01);
      const trendFcr = trendArrow((expectedFcrMax - (latestFcr ?? expectedFcrMax)), 0.02);

      const gainPerDay = latestWeightKg != null && prevWeightKg != null && weigh.latestWeighDate && weigh.prevWeighDate
        ? (latestWeightKg - prevWeightKg) / Math.max(1, (new Date(weigh.latestWeighDate).getTime() - new Date(weigh.prevWeighDate).getTime()) / 86400000)
        : 0;
      const daysTo42 = Math.max(0, 42 - ageDays);
      const projectedHarvestWeightKg = latestWeightKg != null ? latestWeightKg + gainPerDay * daysTo42 : null;
      const projectedMortalityPct = mortalityRatePct + (Math.max(0, mortality24h / initialCount) * 100 * Math.max(0, 30 - ageDays));

      const topIssue = alerts[0] ?? "Stable";
      const needsRole = withdrawalCount > 0 || mortalitySpikePct > 0.5 ? "vet_manager" : riskScore > 45 ? "vet" : "laborer";
      const pendingSince = overdue.oldestPlannedFor ?? withdrawal.safeAfterAt ?? null;

      rows.push({
        flockId: f.id,
        label,
        barn,
        ageDays,
        latestFcr,
        latestWeightKg,
        latestWeighDate: weigh.latestWeighDate ?? null,
        overdueRounds: overdueCount,
        withdrawalBlockers: withdrawalCount,
        mortality7d: mortality7dCount,
        mortality24hDeltaPct: Number(mortality24hDeltaPct.toFixed(2)),
        mortalityRatePct: Number(mortalityRatePct.toFixed(2)),
        expectedWeightKg: Number(expectedWeight.toFixed(3)),
        weightDeviationPct: Number(weightDeviationPct.toFixed(1)),
        expectedFcrRange: { min: expectedFcrMin, max: expectedFcrMax },
        fcrDeviation: latestFcr != null ? Number((latestFcr - expectedFcrMax).toFixed(2)) : null,
        dataFreshnessScore,
        timeStatus,
        trends: {
          mortality: trendMortality,
          weight: trendWeight,
          fcr: trendFcr,
        },
        alerts: alerts.slice(0, 2),
        projections: {
          projectedHarvestWeightKg: projectedHarvestWeightKg != null ? Number(projectedHarvestWeightKg.toFixed(2)) : null,
          projectedHarvestDeltaPct: projectedHarvestWeightKg != null && expectedWeight > 0
            ? Number((((projectedHarvestWeightKg - expectedWeight) / expectedWeight) * 100).toFixed(1))
            : null,
          projectedMortalityPct: Number(projectedMortalityPct.toFixed(2)),
        },
        riskScore,
        riskClass,
        topIssue,
        needsRole,
        pendingSince,
      });
    }

    const barns = new Map();
    for (const r of rows) {
      const prev = barns.get(r.barn) ?? {
        barn: r.barn,
        flockCount: 0,
        blockedFlocks: 0,
        overdueRounds: 0,
        mortality7d: 0,
        fcrVals: [],
      };
      prev.flockCount += 1;
      if (r.withdrawalBlockers > 0) prev.blockedFlocks += 1;
      prev.overdueRounds += r.overdueRounds;
      prev.mortality7d += r.mortality7d;
      if (r.latestFcr != null) prev.fcrVals.push(Number(r.latestFcr));
      barns.set(r.barn, prev);
    }

    const barnSummary = [...barns.values()].map((b) => ({
      barn: b.barn,
      flockCount: b.flockCount,
      blockedFlocks: b.blockedFlocks,
      overdueRounds: b.overdueRounds,
      mortality7d: b.mortality7d,
      avgFcr: b.fcrVals.length ? Number((b.fcrVals.reduce((s, x) => s + x, 0) / b.fcrVals.length).toFixed(2)) : null,
    }));
    const farmHealthScore = rows.length
      ? Math.round(100 - (rows.reduce((sum, r) => sum + Number(r.riskScore || 0), 0) / rows.length))
      : 100;
    const worstDeclining = [...rows]
      .sort((a, b) => (b.mortality24hDeltaPct || 0) - (a.mortality24hDeltaPct || 0))[0] ?? null;
    const mostImproved = [...rows]
      .sort((a, b) => (Number(b.weightDeviationPct || 0) - Number(a.weightDeviationPct || 0)))[0] ?? null;

    const insights = [];
    const barnByWeight = new Map();
    for (const r of rows) {
      const prev = barnByWeight.get(r.barn) ?? { sum: 0, count: 0 };
      if (r.weightDeviationPct != null) {
        prev.sum += Number(r.weightDeviationPct);
        prev.count += 1;
      }
      barnByWeight.set(r.barn, prev);
    }
    const barnAvgs = [...barnByWeight.entries()]
      .map(([barn, v]) => ({ barn, avgWeightDev: v.count ? v.sum / v.count : 0 }))
      .sort((a, b) => b.avgWeightDev - a.avgWeightDev);
    if (barnAvgs.length >= 2) {
      const best = barnAvgs[0];
      const worst = barnAvgs[barnAvgs.length - 1];
      const gap = best.avgWeightDev - worst.avgWeightDev;
      if (gap >= 4) {
        insights.push(`Barn ${worst.barn} underperforming vs Barn ${best.barn} (${Math.abs(gap).toFixed(1)}% avg weight gap)`);
      }
    }
    const elevatedMortality = rows.filter((r) => (r.mortality24hDeltaPct || 0) > 0.5).length;
    if (elevatedMortality >= 2) insights.push("Multiple flocks showing elevated mortality");

    res.json({
      flocks: rows.sort((a, b) => Number(b.riskScore || 0) - Number(a.riskScore || 0)),
      barns: barnSummary,
      insights,
      farmHealthScore,
      mostImprovedFlockId: mostImproved?.flockId ?? null,
      worstDecliningFlockId: worstDeclining?.flockId ?? null,
    });
  } catch (e) {
    console.error("[ERROR]", "[db] GET /api/farm/ops-board:", e instanceof Error ? e.message : e);
    res.status(503).json({ error: "Unable to build operations board." });
  }
});

// FIX: generic 404 handler
app.use((_req, res) => {
  res.status(404).json({ status: "error", message: "Not Found" });
});

// FIX: generic error handler
app.use((err, _req, res, _next) => {
  console.error("[ERROR]", err);
  res.status(err?.status || 500).json({
    status: "error",
    message: err?.message || "Internal Server Error",
  });
});

(async () => {
  try {
    const migration = await runMigrations({ maxAttempts: 5, baseDelayMs: 1000 });
    if (migration.ok) {
      console.log("[INFO]", `[startup] migrations complete (attempt ${migration.attempts ?? 1})`);
    } else {
      console.error("[ERROR]", `[startup] migrations complete with failures: ${migration.failedCount}`);
      if (process.env.NODE_ENV === "production") {
        console.error("[ERROR]", "[startup] refusing to continue in production with failed migrations");
        process.exit(1);
      }
    }
  } catch (e) {
    const transient = Boolean(e?.transient);
    const code = e?.code ? String(e.code) : "";
    console.error(
      "[ERROR]",
      `[startup] migration error${code ? ` (${code})` : ""}: ${e instanceof Error ? e.message : String(e)}`
    );
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[ERROR]",
        `[startup] refusing to continue in production after ${transient ? "transient-retry-exhausted" : "non-transient"} migration failure`
      );
      process.exit(1);
    }
  }

  if (hasDb()) {
    try {
      await systemConfig.refreshSystemConfigFromDatabase(dbQuery, hasDb);
    } catch (e) {
      console.error("[ERROR]", "[startup] system config load:", e instanceof Error ? e.message : e);
    }
    try {
      const loaded = await syncUsersFromDbToMemory();
      if (DEMO_USERS_ENABLED) {
        ensureDemoUsersForNonProd();
      }
      if (loaded === 0 && DEMO_USERS_ENABLED) {
        let seeded = 0;
        ensureDemoUsersForNonProd();
        for (const u of usersById.values()) {
          seeded += 1;
          if (isPersistableUuid(String(u.id))) {
            try {
              await persistUserToDb(u);
            } catch (e) {
              console.error("[ERROR]", "[startup] user seed persist:", e instanceof Error ? e.message : e);
            }
          }
        }
        console.log("[INFO]", `[startup] users seeded (demo fallback): ${seeded}`);
      }
      console.log("[INFO]", `[startup] users loaded from db: ${loaded}, in-memory total: ${usersById.size}`);
    } catch (e) {
      console.error("[ERROR]", "[startup] user sync load:", e instanceof Error ? e.message : e);
      if (DEMO_USERS_ENABLED && usersById.size === 0) {
        ensureDemoUsersForNonProd();
        console.log("[INFO]", `[startup] users seeded after sync error (demo mode): ${usersById.size}`);
      }
    }
    try {
      const backfilled = await backfillAuditEventsToDb();
      if (backfilled > 0) {
        console.log("[INFO]", `[startup] audit backfill complete: ${backfilled}`);
      }
    } catch (e) {
      console.error("[ERROR]", "[startup] audit backfill:", e instanceof Error ? e.message : e);
    }
  }
  app.listen(PORT, () => {
    console.log("[INFO]", `Clevafarm API listening on port ${PORT}`);
  });
})().catch((e) => {
  console.error("[ERROR]", "[startup] fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});

// Keep-alive ping — prevents Render free tier from sleeping
if (process.env.NODE_ENV === "production" && process.env.RENDER_EXTERNAL_URL) {
  const PING_INTERVAL = 14 * 60 * 1000; // every 14 minutes
  setInterval(async () => {
    try {
      await fetch(`${process.env.RENDER_EXTERNAL_URL}/health`);
      // PROD-SAFE: sanitized logging
      console.log("[INFO]", "[keep-alive] ping sent");
    } catch (e) {
      // PROD-SAFE: sanitized logging
      console.error("[ERROR]", "[keep-alive] ping failed");
    }
  }, PING_INTERVAL);
}
