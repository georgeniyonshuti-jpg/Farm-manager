// Flush-friendly banner so Render "Logs" shows activity even if boot fails later
console.log("[INFO]", "[startup] clevafarm process boot", new Date().toISOString(), `cwd=${process.cwd()}`);

import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import session from "express-session";
import pgSession from "connect-pg-simple";
import pg from "pg";
import { runMigrations } from "./migrate.js";
import { checkinSchema, dailyLogSchema, loginSchema } from "./utils/validation.js";
import { geminiTranslateManyKinyarwanda, geminiTranslateToKinyarwanda } from "./utils/geminiTranslate.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;
// FIX: move hardcoded values to environment variables
const PEPPER = process.env.AUTH_PEPPER ?? "";
const PgStore = pgSession(session);
const { Pool } = pg;
const dbPool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      family: 4,
    })
  : null;

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
].filter(Boolean);

// FIX: setup CORS for frontend connection
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "20mb" }));
app.set("trust proxy", 1); // required for Render
app.use(session({
  // PROD-FIX: persistent session store for multi-instance deployment
  store: new PgStore({
    conString: process.env.DATABASE_URL,
  }),
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

app.use("/api/auth/login", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
}));

app.use("/api/laborer/translate", rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "Translation limit reached. Wait a moment." },
}));

app.use("/api/", rateLimit({
  windowMs: 60 * 1000,
  max: 200,
}));

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

function validateImageDataUrls(photos, maxBytes = 5 * 1024 * 1024) {
  for (const p of photos) {
    const meta = imageDataUrlMeta(p);
    if (!meta) return "Invalid image format. Use image data URLs.";
    // PROD-FIX: prevents malicious uploads
    if (!meta.mime.startsWith("image/")) return "Only image uploads are allowed.";
    // PROD-FIX: prevents malicious uploads
    if (meta.byteLength > maxBytes) return "Image too large (max 5MB).";
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
  };
}

/** @type {Map<string, { userId: string, exp: number }>} */
const sessions = new Map();

/** @type {Map<string, object>} */
const usersById = new Map();

/** @type {Map<string, string>} */
const usersByEmail = new Map();

/** @type {Array<{ id: string, at: string, actor_id: string, role: string, action: string, resource: string, resource_id: string | null, metadata?: object }>} */
const auditEvents = [];

/**
 * Audit: Postgres generates id (BIGSERIAL). Non-blocking for HTTP — never throws to callers.
 * Single DB attempt (no retry loop). Errors logged with [audit] only.
 */
function appendAudit(actorUserId, role, action, resource, resourceId, metadata) {
  const at = new Date().toISOString();
  const row = {
    id: null,
    at,
    actor_id: actorUserId,
    role: role ?? "unknown",
    action,
    resource: resource ?? "",
    resource_id: resourceId ?? null,
    metadata: metadata ?? {},
  };
  if (!hasDb()) {
    row.id = `mem_${crypto.randomBytes(6).toString("hex")}`;
    auditEvents.unshift({ ...row, id: row.id });
    return row;
  }
  setImmediate(() => {
    void (async () => {
      try {
        await dbQuery(
          `INSERT INTO audit_events (at, actor_id, role, action, resource, resource_id, metadata)
           VALUES ($1::timestamptz, $2, $3, $4, $5, $6, $7::jsonb)`,
          [at, actorUserId, role ?? "unknown", action, resource ?? "", resourceId ?? null, JSON.stringify(metadata ?? {})]
        );
      } catch (e) {
        console.error("[audit]", "persist failed (non-fatal):", e instanceof Error ? e.message : e);
      }
    })();
  });
  return row;
}

/** @type {Map<string, number>} FIX: mortality duplicate window (5 min) */
const mortalityRecentByKey = new Map();
const MORTALITY_DEBOUNCE_MS = 5 * 60 * 1000;

function upsertUser(u) {
  usersById.set(u.id, u);
  usersByEmail.set(u.email.toLowerCase(), u.id);
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
      displayName: "Field Vet",
      passwordHash: hashPassword("demo"),
      role: "vet",
      businessUnitAccess: "farm",
      canViewSensitiveFinancial: false,
      departmentKeys: ["junior_vet"],
    },
    {
      id: "usr_vet_mgr",
      email: "vetmanager@demo.com",
      displayName: "Lead Vet",
      passwordHash: hashPassword("demo"),
      role: "vet_manager",
      businessUnitAccess: "farm",
      canViewSensitiveFinancial: false,
      departmentKeys: [],
    },
    {
      id: "usr_disp",
      email: "dispatcher@demo.com",
      displayName: "Dispatcher",
      passwordHash: hashPassword("demo"),
      role: "dispatcher",
      businessUnitAccess: "farm",
      canViewSensitiveFinancial: false,
      departmentKeys: ["dispatch"],
    },
    {
      id: "usr_proc",
      email: "procurement@demo.com",
      displayName: "Procurement Officer",
      passwordHash: hashPassword("demo"),
      role: "procurement_officer",
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

seedUsers();

async function bootstrapDatabaseDefaults() {
  if (!hasDb()) return;
  const users = [...usersById.values()];
  for (const u of users) {
    try {
      await dbQuery(
        `INSERT INTO app_users (
          id, email, display_name, password_hash, role, business_unit_access,
          can_view_sensitive_financial, department_keys
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            display_name = EXCLUDED.display_name,
            password_hash = EXCLUDED.password_hash,
            role = EXCLUDED.role,
            business_unit_access = EXCLUDED.business_unit_access,
            can_view_sensitive_financial = EXCLUDED.can_view_sensitive_financial,
            department_keys = EXCLUDED.department_keys`,
        [
          u.id,
          u.email,
          u.displayName,
          u.passwordHash,
          u.role,
          u.businessUnitAccess,
          Boolean(u.canViewSensitiveFinancial),
          JSON.stringify(u.departmentKeys ?? []),
        ]
      );
    } catch (err) {
      console.error("[ERROR]", "[db] bootstrap app_users failed:", err.message);
    }
  }
  try {
    await dbQuery(
      `INSERT INTO flocks (id, label, breed, placement_date, initial_count, current_count, status, metadata)
       VALUES ($1, $2, $3, $4::date, $5, $6, 'active', '{}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      ["flock_demo_001", "Demo batch - Barn A", "broiler", new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10), 1000, 1000]
    );
  } catch (err) {
    console.error("[ERROR]", "[db] bootstrap flocks failed:", err.message);
  }
}
void bootstrapDatabaseDefaults();

function newSessionId() {
  return crypto.randomBytes(32).toString("hex");
}

async function getUserFromRequest(req) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return null;
  const sid = h.slice("Bearer ".length).trim();
  if (hasDb()) {
    try {
      const result = await dbQuery(
        `SELECT u.id, u.email, u.display_name AS "displayName", u.role,
                u.business_unit_access AS "businessUnitAccess",
                u.can_view_sensitive_financial AS "canViewSensitiveFinancial",
                u.department_keys AS "departmentKeys"
         FROM app_sessions s
         JOIN app_users u ON u.id = s.user_id
         WHERE s.id = $1 AND s.expires_at > now()
         LIMIT 1`,
        [sid]
      );
      return result.rows[0] ?? null;
    } catch {
      return null;
    }
  }
  const s = sessions.get(sid);
  if (!s || s.exp < Date.now()) return null;
  return usersById.get(s.userId) ?? null;
}

async function requireAuth(req, res, next) {
  const u = await getUserFromRequest(req);
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

function requireLaborer(req, res, next) {
  const r = req.authUser?.role;
  if (r !== "laborer" && r !== "dispatcher") {
    res.status(403).json({ error: "Only field operations accounts may use this translation endpoint" });
    return;
  }
  next();
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
seedLogScheduleDemo();

function createPayrollEntry({
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
  const id = `pi_${crypto.randomBytes(6).toString("hex")}`;
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
    createdAt: new Date().toISOString(),
    submittedAt: submittedAtIso,
    onTime,
  };
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

function maybeAutoPayrollForSubmit(reqUser, flockId, logType, logId, submittedAtIso) {
  const scheds = logSchedules.filter((s) => s.flockId === flockId && s.role === reqUser.role);
  if (!scheds.length) return null;
  const s = scheds[0];
  const onTime = isSubmissionWithinPayrollWindow(submittedAtIso, s.windowOpen, s.windowClose);
  const rwfDelta = onTime ? 500 : -300;
  const reason = onTime
    ? "On-time: submission within payroll window"
    : "Late: submission outside payroll window";
  return createPayrollEntry({
    userId: reqUser.id,
    logId,
    logType,
    submittedAtIso,
    flockId,
    onTime,
    rwfDelta,
    reason,
  });
}

function canLogTreatments(user) {
  if (!user) return false;
  return ["superuser", "manager", "vet_manager", "vet"].includes(user.role);
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
  if (!canLogTreatments(req.authUser)) {
    res.status(403).json({ error: "Only vet, vet manager, manager, or superuser can log treatments" });
    return;
  }
  next();
}

function requireSlaughterEventLogger(req, res, next) {
  if (!canLogTreatments(req.authUser)) {
    res.status(403).json({ error: "Only vet, vet manager, manager, or superuser can record slaughter events" });
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

/** Align BIGSERIAL after migrations; failures are logged only ([migration]). */
async function syncAuditEventIdSequence() {
  if (!hasDb()) return;
  try {
    await dbQuery(`
      SELECT setval(
        pg_get_serial_sequence('audit_events', 'id'),
        COALESCE((SELECT MAX(id) FROM audit_events), 1),
        (SELECT MAX(id) FROM audit_events) IS NOT NULL
      )
    `);
    console.log("[migration]", "audit_events id sequence synced");
  } catch (e) {
    console.warn("[migration]", "audit_events sequence sync skipped:", e instanceof Error ? e.message : e);
  }
}

// PROD-FIX: migrations on boot — never throw into process; isolate from HTTP.
runMigrations()
  .then(async (result) => {
    if (result.skipped) {
      console.warn("[migration]", "migrations skipped (no DATABASE_URL)");
    } else if (result.ok) {
      console.log("[migration]", "all migration files applied OK");
    } else {
      console.error("[migration]", "migrations finished with failures:", result.failedCount);
    }
    await syncAuditEventIdSequence();
  })
  .catch((err) => {
    console.error("[migration]", "runner error (non-fatal):", err instanceof Error ? err.message : err);
    void syncAuditEventIdSequence();
  });

function parseOptionalIsoDate(value) {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function hasLogInWindowForUserOnDay(userId, flockId, ymd, sched) {
  for (const c of roundCheckins) {
    if (c.flockId !== flockId || c.laborerId !== userId) continue;
    if (kigaliYmd(new Date(c.at)) !== ymd) continue;
    if (isSubmissionWithinPayrollWindow(c.at, sched.windowOpen, sched.windowClose)) return true;
  }
  for (const L of dailyLogs) {
    if (String(L.flockId) !== String(flockId) || L.enteredByUserId !== userId) continue;
    const logDay = String(L.logDate).slice(0, 10);
    if (logDay !== ymd) continue;
    if (isSubmissionWithinPayrollWindow(L.receivedAt, sched.windowOpen, sched.windowClose)) return true;
  }
  return false;
}

function payrollDuplicateAutoKey(userId, flockId, ymd, logType) {
  return `${userId}|${flockId}|${ymd}|${logType}|auto`;
}

function runMissedPayrollScan() {
  const now = new Date();
  const ymd = kigaliYmd(now);
  for (const sched of logSchedules) {
    if (!flocksById.has(sched.flockId)) continue;
    if (!windowHasEndedForKigaliDay(sched, now)) continue;
    for (const u of usersById.values()) {
      if (u.role !== sched.role) continue;
      if (!hasFarmAccess(u)) continue;
      const missKey = `missed|${sched.id}|${u.id}|${ymd}`;
      if (payrollMissedKeys.has(missKey)) continue;
      if (hasLogInWindowForUserOnDay(u.id, sched.flockId, ymd, sched)) continue;
      const dup = payrollImpacts.some(
        (p) =>
          p.userId === u.id &&
          p.periodStart === ymd &&
          p.logType === "check_in" &&
          p.reason?.includes("Missed")
      );
      if (dup) continue;
      payrollMissedKeys.add(missKey);
      createPayrollEntry({
        userId: u.id,
        logId: `missed_${sched.id}_${ymd}`,
        logType: "check_in",
        submittedAtIso: now.toISOString(),
        flockId: sched.flockId,
        onTime: false,
        rwfDelta: -300,
        reason: "Missed: no log in payroll window by end of day segment",
      });
    }
  }
}

setInterval(runMissedPayrollScan, 5 * 60 * 1000);

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

/** @type {Array<object>} */
const roundCheckins = [];

/** @type {Array<object>} */
const mortalityEvents = [];

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
  const p = new Date(`${flock.placementDate}T00:00:00`);
  const ms = at.getTime() - p.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

function lastCheckinMs(flockId) {
  const times = roundCheckins.filter((c) => c.flockId === flockId).map((c) => new Date(c.at).getTime());
  if (!times.length) return null;
  return Math.max(...times);
}

function computeNextDueMs(flock, now = Date.now()) {
  const ageDays = flockAgeDays(flock, new Date(now));
  const h = intervalHoursForAge(ageDays, flock);
  const intervalMs = h * 3600000;
  const last = lastCheckinMs(flock.id);
  if (last === null) {
    const p = new Date(`${flock.placementDate}T00:00:00`).getTime();
    return p + intervalMs;
  }
  return last + intervalMs;
}

function checkinStatusPayload(flock) {
  const now = Date.now();
  const ageDays = flockAgeDays(flock, new Date(now));
  const intervalHours = intervalHoursForAge(ageDays, flock);
  const nextDueMs = computeNextDueMs(flock, now);
  const lastMs = lastCheckinMs(flock.id);
  const lastCheckinAt = lastMs ? new Date(lastMs).toISOString() : null;
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
    intervalSource: flock.checkinBands?.length ? "batch_custom" : "default_age_curve",
    lastCheckinAt,
    nextDueAt: new Date(nextDueMs).toISOString(),
    overdueMs,
    isOverdue,
    checkinBadge,
    photosRequiredPerRound: flock.photosRequiredPerRound ?? 1,
    bands,
  };
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
    checkinBands: null,
    photosRequiredPerRound: 1,
  });
}
seedFlock();

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

app.post("/api/auth/login", async (req, res) => {
  // PROD-FIX: prevents malformed data and injection
  const loginParsed = loginSchema.safeParse(req.body ?? {});
  if (!loginParsed.success) {
    res.status(400).json({ error: loginParsed.error.issues[0]?.message ?? "Invalid login payload" });
    return;
  }
  const payload = loginParsed.data;
  const email = payload.email.trim().toLowerCase();
  const password = payload.password;
  try {
    const dbUser = await dbQuery(
      `SELECT id, email, display_name AS "displayName", password_hash AS "passwordHash", role,
              business_unit_access AS "businessUnitAccess",
              can_view_sensitive_financial AS "canViewSensitiveFinancial",
              department_keys AS "departmentKeys"
       FROM app_users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );
    const u = dbUser.rows[0];
    if (!u || u.passwordHash !== hashPassword(password)) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    const token = newSessionId();
    await dbQuery(
      `INSERT INTO app_sessions (id, user_id, expires_at)
       VALUES ($1, $2, $3::timestamptz)`,
      [token, u.id, new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString()]
    );
    appendAudit(u.id, u.role, "auth.login", "session", null, { email: u.email });
    res.json({ token, user: sanitizeUser(u) });
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
  }
});

app.post("/api/auth/logout", requireAuth, async (req, res) => {
  const h = req.headers.authorization;
  const sid = h?.startsWith("Bearer ") ? h.slice("Bearer ".length).trim() : null;
  if (sid) {
    try {
      await dbQuery("DELETE FROM app_sessions WHERE id = $1", [sid]);
    } catch {
      res.status(503).json({ error: "Database unavailable. Please retry shortly." });
      return;
    }
  }
  appendAudit(req.authUser.id, req.authUser.role, "auth.logout", "session", null, {});
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: sanitizeUser(req.authUser) });
});

app.get("/api/users", requireAuth, requireSuperuser, async (_req, res) => {
  try {
    const rows = await dbQuery(
      `SELECT id, email, display_name AS "displayName", role,
              business_unit_access AS "businessUnitAccess",
              can_view_sensitive_financial AS "canViewSensitiveFinancial",
              department_keys AS "departmentKeys"
       FROM app_users
       ORDER BY created_at DESC`
    );
    res.json({ users: rows.rows.map(sanitizeUser) });
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
  }
});

app.get("/api/debug/demo-access", requireAuth, requireSuperuser, async (_req, res) => {
  try {
    const result = await dbQuery(
      `SELECT id, email, role,
              business_unit_access AS "businessUnitAccess",
              can_view_sensitive_financial AS "canViewSensitiveFinancial",
              department_keys AS "departmentKeys"
       FROM app_users
       WHERE email LIKE '%@demo.com'
       ORDER BY email ASC`
    );
    const accounts = result.rows.map((u) => {
      const access = String(u.businessUnitAccess ?? "");
      const hasFarm = access === "farm" || access === "both";
      const hasFinance = access === "clevacredit" || access === "both";
      return {
        id: u.id,
        email: u.email,
        role: u.role,
        businessUnitAccess: access,
        canViewSensitiveFinancial: Boolean(u.canViewSensitiveFinancial),
        departmentKeys: Array.isArray(u.departmentKeys) ? u.departmentKeys : [],
        hasFarmAccess: hasFarm,
        hasFinanceAccess: hasFinance,
      };
    });
    res.json({ accounts, total: accounts.length, checkedAt: new Date().toISOString() });
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
  }
});

app.post("/api/users", requireAuth, requireSuperuser, async (req, res) => {
  const body = req.body ?? {};
  const email = String(body.email ?? "").trim().toLowerCase();
  const displayName = String(body.displayName ?? "").trim();
  const password = String(body.password ?? "");
  const role = String(body.role ?? "laborer");
  const businessUnitAccess = String(body.businessUnitAccess ?? "farm");
  const canViewSensitiveFinancial = Boolean(body.canViewSensitiveFinancial);
  const departmentKeys = Array.isArray(body.departmentKeys) ? body.departmentKeys.map(String) : [];

  if (!email || !displayName || !password) {
    res.status(400).json({ error: "email, displayName, password required" });
    return;
  }
  try {
    const existing = await dbQuery("SELECT id FROM app_users WHERE email = $1 LIMIT 1", [email]);
    if (existing.rowCount > 0) {
      res.status(409).json({ error: "User already exists" });
      return;
    }
    const id = `usr_${crypto.randomBytes(6).toString("hex")}`;
    await dbQuery(
      `INSERT INTO app_users (
        id, email, display_name, password_hash, role, business_unit_access,
        can_view_sensitive_financial, department_keys
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [id, email, displayName, hashPassword(password), role, businessUnitAccess, canViewSensitiveFinancial, JSON.stringify(departmentKeys)]
    );
    const row = {
      id,
      email,
      displayName,
      role,
      businessUnitAccess,
      canViewSensitiveFinancial,
      departmentKeys,
    };
    appendAudit(req.authUser.id, req.authUser.role, "user.create", "user", id, {
      email,
      role,
      businessUnitAccess,
      canViewSensitiveFinancial,
    });
    res.json({ user: sanitizeUser(row) });
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
  }
});

app.get("/api/audit", requireAuth, requireSuperuser, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const roleFilter = String(req.query.role ?? "").trim();
  const actionFilter = String(req.query.action ?? "").trim();

  try {
    const where = [];
    const params = [];
    if (roleFilter) {
      params.push(roleFilter);
      where.push(`role = $${params.length}`);
    }
    if (actionFilter) {
      params.push(`%${actionFilter}%`);
      where.push(`action ILIKE $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const totalResult = await dbQuery(`SELECT COUNT(*)::int AS total FROM audit_events ${whereSql}`, params);
    params.push(pageSize);
    params.push((page - 1) * pageSize);
    const rowsResult = await dbQuery(
      `SELECT id, at, actor_id, role, action, resource, resource_id, metadata
       FROM audit_events
       ${whereSql}
       ORDER BY at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ events: rowsResult.rows, total: totalResult.rows[0]?.total ?? 0, page, pageSize });
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
  }
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
  const at = timestamp && !Number.isNaN(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : new Date().toISOString();
  try {
    const ins = await dbQuery(
      `INSERT INTO audit_events (at, actor_id, role, action, resource, resource_id, metadata)
       VALUES ($1::timestamptz, $2, $3, $4, $5, $6, '{}'::jsonb)
       RETURNING id, at, actor_id, role, action, resource, resource_id, metadata`,
      [at, actorId, role, action, resource, resourceId]
    );
    const ev = ins.rows[0];
    const row = {
      id: ev.id,
      at: ev.at,
      actor_id: ev.actor_id,
      role: ev.role,
      action: ev.action,
      resource: ev.resource,
      resource_id: ev.resource_id,
      metadata: ev.metadata ?? {},
    };
    res.status(201).json({ event: row });
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
  }
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
  const texts = Array.isArray(body.texts)
    ? body.texts.map((x) => String(x ?? ""))
    : body.text != null
      ? [String(body.text ?? "")]
      : [];
  if (targetLang !== "rw") {
    if (texts.length <= 1) {
      res.json({ translation: texts[0] ?? "", usedGemini: false });
    } else {
      res.json({ translations: texts, usedGemini: false });
    }
    return;
  }
  const totalChars = texts.reduce((n, t) => n + t.length, 0);
  if (totalChars > 8000 || texts.length > 20) {
    res.status(400).json({ error: "Request too large; max 20 strings or 8000 chars total" });
    return;
  }
  if (texts.length === 0) {
    res.json({ translation: "", usedGemini: false });
    return;
  }
  if (texts.length === 1) {
    const out = await geminiTranslateToKinyarwanda(texts[0]);
    res.json({ translation: out.translation, usedGemini: out.usedGemini, cached: Boolean(out.cached) });
    return;
  }
  const batch = await geminiTranslateManyKinyarwanda(texts);
  res.json({
    translations: batch.translations,
    usedGemini: batch.usedGemini,
    cached: Boolean(batch.cached),
  });
});

app.post("/api/laborer/translate", requireAuth, requireLaborer, async (req, res) => {
  const body = req.body ?? {};
  const targetLang = String(body.targetLang ?? "rw");
  const texts = Array.isArray(body.texts)
    ? body.texts.map((x) => String(x ?? ""))
    : body.text != null
      ? [String(body.text ?? "")]
      : [];

  if (targetLang !== "rw") {
    if (texts.length <= 1) {
      res.json({ translation: texts[0] ?? "", usedGemini: false });
    } else {
      res.json({ translations: texts, usedGemini: false });
    }
    return;
  }
  const totalChars = texts.reduce((n, t) => n + t.length, 0);
  if (totalChars > 16000 || texts.length > 20) {
    res.status(400).json({ error: "Request too large; max 20 strings or 16000 chars total" });
    return;
  }
  if (texts.length === 0) {
    res.json({ translation: "", usedGemini: false });
    return;
  }

  let out;
  if (texts.length === 1) {
    out = await geminiTranslateToKinyarwanda(texts[0]);
    appendAudit(req.authUser.id, req.authUser.role, "laborer.translate", "gemini", null, {
      chars: texts[0].length,
      usedGemini: out.usedGemini,
      cached: Boolean(out.cached),
      batch: false,
    });
    res.json({ translation: out.translation, usedGemini: out.usedGemini, cached: Boolean(out.cached) });
    return;
  }

  const batch = await geminiTranslateManyKinyarwanda(texts);
  appendAudit(req.authUser.id, req.authUser.role, "laborer.translate", "gemini", null, {
    chars: totalChars,
    usedGemini: batch.usedGemini,
    cached: Boolean(batch.cached),
    batch: true,
    count: texts.length,
  });
  res.json({
    translations: batch.translations,
    usedGemini: batch.usedGemini,
    cached: Boolean(batch.cached),
  });
});

app.get("/api/flocks", requireAuth, requireFarmAccess, async (_req, res) => {
  try {
    const result = await dbQuery(
      `SELECT f.id, f.label, f.placement_date AS "placementDate", f.initial_count AS "initialCount",
              f.current_count AS "currentCount", f.status,
              COALESCE(s.interval_hours, 6) AS "intervalHours",
              (
                SELECT c.at
                FROM check_ins c
                WHERE c.flock_id = f.id
                ORDER BY c.at DESC
                LIMIT 1
              ) AS "lastCheckinAt"
       FROM flocks f
       LEFT JOIN check_in_schedules s ON s.flock_id = f.id
       ORDER BY f.placement_date DESC`
    );
    const flocks = result.rows.map((f) => {
      const intervalHours = Number(f.intervalHours) || 6;
      const lastAtMs = f.lastCheckinAt ? new Date(f.lastCheckinAt).getTime() : new Date(`${f.placementDate}T00:00:00.000Z`).getTime();
      const nextDueMs = lastAtMs + intervalHours * 3600_000;
      const overdueMs = Date.now() - nextDueMs;
      const isOverdue = overdueMs > 0;
      return {
        ...f,
        nextDueAt: new Date(nextDueMs).toISOString(),
        isOverdue,
        checkinBadge: isOverdue ? "overdue" : "upcoming",
        ageDays: Math.max(0, Math.floor((Date.now() - new Date(`${f.placementDate}T00:00:00.000Z`).getTime()) / 86400000)),
      };
    });
    res.json({ flocks });
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
  }
});

app.get("/api/flocks/:id/checkin-status", requireAuth, requireFarmAccess, async (req, res) => {
  try {
    const fResult = await dbQuery(
      `SELECT f.id, f.label, f.placement_date AS "placementDate",
              COALESCE(s.interval_hours, 6) AS "intervalHours"
       FROM flocks f
       LEFT JOIN check_in_schedules s ON s.flock_id = f.id
       WHERE f.id = $1
       LIMIT 1`,
      [req.params.id]
    );
    const f = fResult.rows[0];
    if (!f) {
      res.status(404).json({ error: "Flock not found" });
      return;
    }
    const cResult = await dbQuery(
      `SELECT at FROM check_ins WHERE flock_id = $1 ORDER BY at DESC LIMIT 1`,
      [f.id]
    );
    const lastCheckinAt = cResult.rows[0]?.at ?? null;
    const intervalHours = Number(f.intervalHours) || 6;
    const basisMs = lastCheckinAt ? new Date(lastCheckinAt).getTime() : new Date(`${f.placementDate}T00:00:00.000Z`).getTime();
    const nextDueMs = basisMs + intervalHours * 3600_000;
    const overdueMs = Date.now() - nextDueMs;
    res.json({
      flockId: f.id,
      label: f.label,
      placementDate: f.placementDate,
      ageDays: Math.max(0, Math.floor((Date.now() - new Date(`${f.placementDate}T00:00:00.000Z`).getTime()) / 86400000)),
      intervalHours,
      lastCheckinAt,
      nextDueAt: new Date(nextDueMs).toISOString(),
      overdueMs,
      isOverdue: overdueMs > 0,
      checkinBadge: overdueMs > 0 ? "overdue" : "upcoming",
    });
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
  }
});

app.patch("/api/flocks/:id/checkin-schedule", requireAuth, requireFarmAccess, requireCheckinScheduleEditor, async (req, res) => {
  const body = req.body ?? {};
  const photosRequiredPerRound = Math.max(1, Math.min(5, Number(body.photosRequiredPerRound) || 1));
  const intervalHours = Math.max(1, Number(body.intervalHours) || 6);
  try {
    const flock = await dbQuery("SELECT id FROM flocks WHERE id = $1 LIMIT 1", [req.params.id]);
    if (flock.rowCount < 1) {
      res.status(404).json({ error: "Flock not found" });
      return;
    }
    await dbQuery(
      `INSERT INTO check_in_schedules (flock_id, interval_hours, photos_required_per_round, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (flock_id)
       DO UPDATE SET interval_hours = EXCLUDED.interval_hours,
                     photos_required_per_round = EXCLUDED.photos_required_per_round,
                     updated_at = now()`,
      [req.params.id, intervalHours, photosRequiredPerRound]
    );
    appendAudit(req.authUser.id, req.authUser.role, "flock.checkin_schedule.update", "flock", req.params.id, {
      photosRequiredPerRound,
      intervalHours,
    });
    res.json({ ok: true });
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
  }
});

app.post("/api/flocks/:id/round-checkins", requireAuth, requireFarmAccess, async (req, res) => {
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
  let minPhotos = 1;
  const feedKg = Number(body.feedKg);
  const waterL = Number(body.waterL);
  const notes = String(body.notes ?? "").slice(0, 4000);
  const mortalityAtCheckin = body.mortalityAtCheckin != null ? Math.max(0, Number(body.mortalityAtCheckin)) : 0;

  const id = `chk_${crypto.randomBytes(8).toString("hex")}`;
  const at = new Date().toISOString();
  const row = {
    id,
    flockId: req.params.id,
    laborerId: req.authUser.id,
    at,
    photos,
    // FIX: primary photo URL for check_ins parity / reporting
    photoUrl: photos[0] ?? null,
    feedKg: Number.isFinite(feedKg) ? feedKg : 0,
    waterL: Number.isFinite(waterL) ? waterL : 0,
    notes,
    mortalityAtCheckin,
  };
  try {
    const flock = await dbQuery(
      `SELECT id, placement_date AS "placementDate" FROM flocks WHERE id = $1 LIMIT 1`,
      [req.params.id]
    );
    if (flock.rowCount < 1) {
      res.status(404).json({ error: "Flock not found" });
      return;
    }
    const schedule = await dbQuery(
      `SELECT photos_required_per_round AS "photosRequired" FROM check_in_schedules WHERE flock_id = $1 LIMIT 1`,
      [req.params.id]
    );
    minPhotos = Number(schedule.rows[0]?.photosRequired) || 1;
    if (photos.length < minPhotos) {
      res.status(400).json({ error: `At least ${minPhotos} photo(s) required for this check-in` });
      return;
    }
    await dbQuery(
      `INSERT INTO check_ins (id, flock_id, at, feed_kg, water_l, notes, mortality_at_checkin, photo_url, entered_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, req.params.id, at, Number.isFinite(feedKg) ? feedKg : 0, Number.isFinite(waterL) ? waterL : 0, notes, mortalityAtCheckin, photos[0] ?? null, req.authUser.id]
    );
    if (mortalityAtCheckin > 0) {
      const mid = `mort_${crypto.randomBytes(8).toString("hex")}`;
      await dbQuery(
        `INSERT INTO mortality_events (id, flock_id, at, count, is_emergency, notes, entered_by_user_id, linked_checkin_id)
         VALUES ($1, $2, $3, $4, false, $5, $6, $7)`,
        [mid, req.params.id, at, mortalityAtCheckin, "Logged at scheduled round check-in", req.authUser.id, id]
      );
      await dbQuery(
        `UPDATE flocks
         SET current_count = GREATEST(0, current_count - $2), updated_at = now()
         WHERE id = $1`,
        [req.params.id, mortalityAtCheckin]
      );
    }
    appendAudit(req.authUser.id, req.authUser.role, "farm.round_checkin.create", "flock", req.params.id, {
      checkinId: id,
      photoCount: photos.length,
    });
    res.json({ ok: true, checkin: row });
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
  }
});

app.post("/api/flocks/:id/mortality-events", requireAuth, requireFarmAccess, async (req, res) => {
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
  const dedupeKey = `${req.params.id}|${req.authUser.id}|${dayKey}|${isEmergency}|${count}|${notes.slice(0, 120)}`;
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

  const id = `mort_${crypto.randomBytes(8).toString("hex")}`;
  const at = new Date().toISOString();
  const row = {
    id,
    flockId: req.params.id,
    laborerId: req.authUser.id,
    at,
    count,
    isEmergency,
    photos,
    notes,
    linkedCheckinId,
    source: linkedCheckinId ? "linked" : isEmergency ? "emergency" : "adhoc",
  };
  try {
    const flock = await dbQuery("SELECT id FROM flocks WHERE id = $1 LIMIT 1", [req.params.id]);
    if (flock.rowCount < 1) {
      res.status(404).json({ error: "Flock not found" });
      return;
    }
    await dbQuery(
      `INSERT INTO mortality_events (id, flock_id, at, count, is_emergency, notes, entered_by_user_id, linked_checkin_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, req.params.id, at, count, isEmergency, notes, req.authUser.id, linkedCheckinId]
    );
    await dbQuery(
      `UPDATE flocks
       SET current_count = GREATEST(0, current_count - $2), updated_at = now()
       WHERE id = $1`,
      [req.params.id, count]
    );
    mortalityRecentByKey.set(dedupeKey, nowMs);
    appendAudit(req.authUser.id, req.authUser.role, "farm.mortality.create", "flock", req.params.id, {
      mortalityId: id,
      count,
      isEmergency,
    });
    res.json({ ok: true, mortality: row });
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
  }
});

app.get("/api/flocks/:id/mortality-events", requireAuth, requireFarmAccess, async (req, res) => {
  try {
    const list = await dbQuery(
      `SELECT id, flock_id AS "flockId", at, count, is_emergency AS "isEmergency", notes, linked_checkin_id AS "linkedCheckinId",
              CASE WHEN linked_checkin_id IS NOT NULL THEN 'linked' WHEN is_emergency THEN 'emergency' ELSE 'adhoc' END AS source
       FROM mortality_events
       WHERE flock_id = $1
       ORDER BY at DESC`,
      [req.params.id]
    );
    res.json({ events: list.rows });
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
  }
});

app.get("/api/flocks/:id/round-checkins", requireAuth, requireFarmAccess, async (req, res) => {
  try {
    const list = await dbQuery(
      `SELECT id, flock_id AS "flockId", entered_by_user_id AS "laborerId", at,
              feed_kg AS "feedKg", water_l AS "waterL", notes, mortality_at_checkin AS "mortalityAtCheckin", photo_url AS "photoUrl"
       FROM check_ins
       WHERE flock_id = $1
       ORDER BY at DESC`,
      [req.params.id]
    );
    res.json({ checkins: list.rows });
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
  }
});

async function listTreatmentsForFlock(flockId, startIso = null, endIso = null) {
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
        [flockId, startIso, endIso]
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
    .filter((t) => t.flockId === flockId && new Date(t.at).getTime() >= startMs && new Date(t.at).getTime() <= endMs)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

async function listSlaughterForFlock(flockId, startIso = null, endIso = null) {
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
        [flockId, startIso, endIso]
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
    .filter((s) => s.flockId === flockId && new Date(s.at).getTime() >= startMs && new Date(s.at).getTime() <= endMs)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

async function buildFlockPerformanceSummary(flockId, atIso = null) {
  const flock = flocksById.get(flockId);
  if (!flock) return null;
  const cutoffMs = atIso ? new Date(atIso).getTime() : Number.POSITIVE_INFINITY;
  const feedToDate = roundCheckins
    .filter((c) => c.flockId === flockId && new Date(c.at).getTime() <= cutoffMs)
    .reduce((s, c) => s + (Number(c.feedKg) || 0), 0);
  const mortalityToDate = mortalityEvents
    .filter((m) => m.flockId === flockId && new Date(m.at).getTime() <= cutoffMs)
    .reduce((s, m) => s + (Number(m.count) || 0), 0);
  const slRows = await listSlaughterForFlock(flockId);
  const slaughterToDate = slRows
    .filter((s) => new Date(s.at).getTime() <= cutoffMs)
    .reduce((sum, s) => sum + (Number(s.birdsSlaughtered) || 0), 0);
  const birdsLiveEstimate = Math.max(0, (Number(flock.initialCount) || 0) - mortalityToDate - slaughterToDate);
  const latestSlaughter = slRows
    .filter((s) => new Date(s.at).getTime() <= cutoffMs)
    .sort((a, b) => (a.at < b.at ? 1 : -1))[0] ?? null;
  const fcr =
    latestSlaughter && latestSlaughter.birdsSlaughtered > 0 && latestSlaughter.avgLiveWeightKg > 0
      ? feedToDate / (latestSlaughter.birdsSlaughtered * latestSlaughter.avgLiveWeightKg)
      : null;
  return {
    flockId,
    placementDate: flock.placementDate,
    ageDays: flockAgeDays(flock, new Date()),
    feedToDateKg: Number(feedToDate.toFixed(2)),
    mortalityToDate,
    birdsLiveEstimate,
    latestSlaughter,
    fcr,
  };
}

app.post("/api/flocks/:id/treatments", requireAuth, requireFarmAccess, requireTreatmentLogger, async (req, res) => {
  const flockId = req.params.id;
  const body = req.body ?? {};
  const medicineName = String(body.medicineName ?? "").trim();
  const reasonCode = String(body.reasonCode ?? "").trim() || "other";
  if (!TREATMENT_REASON_CODES.includes(reasonCode)) {
    res.status(400).json({ error: "Invalid reasonCode for treatment" });
    return;
  }
  const diseaseOrReason = String(body.diseaseOrReason ?? reasonCode).trim();
  const dose = Number(body.dose);
  const doseUnit = String(body.doseUnit ?? "").trim();
  const route = String(body.route ?? "").trim();
  const durationDays = Math.max(1, Number(body.durationDays) || 1);
  const withdrawalDays = Math.max(0, Number(body.withdrawalDays) || 0);
  const notes = String(body.notes ?? "").slice(0, 4000);
  if (!medicineName || !diseaseOrReason || !Number.isFinite(dose) || dose <= 0 || !doseUnit || !route) {
    res.status(400).json({ error: "medicineName, diseaseOrReason, dose, doseUnit, route are required" });
    return;
  }
  const row = {
    id: `trt_${crypto.randomBytes(6).toString("hex")}`,
    flockId,
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
    const flockExists = await dbQuery("SELECT id FROM flocks WHERE id = $1 LIMIT 1", [flockId]);
    if (flockExists.rowCount < 1) {
      res.status(404).json({ error: "Flock not found" });
      return;
    }
    await dbQuery(
      `INSERT INTO flock_treatments
        (id, flock_id, at, disease_or_reason, medicine_name, reason_code, dose, dose_unit, route, duration_days, withdrawal_days, notes, administered_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [row.id, row.flockId, row.at, row.diseaseOrReason, row.medicineName, row.reasonCode, row.dose, row.doseUnit, row.route, row.durationDays, row.withdrawalDays, row.notes, row.administeredByUserId]
    );
    await dbQuery(
      `INSERT INTO medicine_inventory (id, flock_id, medicine_name, balance_qty, unit, updated_at)
       VALUES ($1, $2, $3, 0, $4, now())
       ON CONFLICT (flock_id, medicine_name, unit)
       DO NOTHING`,
      [`med_${crypto.randomBytes(6).toString("hex")}`, flockId, medicineName, doseUnit]
    );
    await dbQuery(
      `UPDATE medicine_inventory
       SET balance_qty = GREATEST(0, balance_qty - $4), updated_at = now()
       WHERE flock_id = $1 AND medicine_name = $2 AND unit = $3`,
      [flockId, medicineName, doseUnit, dose]
    );
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
    return;
  }
  appendAudit(req.authUser.id, req.authUser.role, "flock.treatment.create", "flock", flockId, { treatmentId: row.id });
  res.status(201).json({ treatment: row });
});

app.get("/api/flocks/:id/treatments", requireAuth, requireFarmAccess, async (req, res) => {
  const startIso = parseOptionalIsoDate(req.query.start_at);
  const endIso = parseOptionalIsoDate(req.query.end_at);
  try {
    const list = await listTreatmentsForFlock(req.params.id, startIso, endIso);
    res.json({ treatments: list });
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
  }
});

app.post("/api/flocks/:id/slaughter-events", requireAuth, requireFarmAccess, requireSlaughterEventLogger, async (req, res) => {
  const flockId = req.params.id;
  const body = req.body ?? {};
  const birdsSlaughtered = Number(body.birdsSlaughtered);
  const avgLiveWeightKg = Number(body.avgLiveWeightKg);
  const avgCarcassWeightKg =
    body.avgCarcassWeightKg == null || body.avgCarcassWeightKg === "" ? null : Number(body.avgCarcassWeightKg);
  const reasonCode = String(body.reasonCode ?? "").trim() || "planned_market";
  if (!SLAUGHTER_REASON_CODES.includes(reasonCode)) {
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
    treatments = await listTreatmentsForFlock(flockId);
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
    flockId,
    at,
    birdsSlaughtered,
    avgLiveWeightKg,
    avgCarcassWeightKg: Number.isFinite(avgCarcassWeightKg) ? avgCarcassWeightKg : null,
    notes,
    enteredByUserId: req.authUser.id,
    reasonCode,
  };
  try {
    const flockExists = await dbQuery("SELECT id FROM flocks WHERE id = $1 LIMIT 1", [flockId]);
    if (flockExists.rowCount < 1) {
      res.status(404).json({ error: "Flock not found" });
      return;
    }
    await dbQuery(
      `INSERT INTO flock_slaughter_events
        (id, flock_id, at, birds_slaughtered, reason_code, avg_live_weight_kg, avg_carcass_weight_kg, notes, entered_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [row.id, row.flockId, row.at, row.birdsSlaughtered, row.reasonCode, row.avgLiveWeightKg, row.avgCarcassWeightKg, row.notes, row.enteredByUserId]
    );
    await dbQuery(
      `UPDATE flocks
       SET current_count = GREATEST(0, current_count - $2),
           status = CASE WHEN GREATEST(0, current_count - $2) = 0 THEN 'closed' ELSE status END,
           updated_at = now()
       WHERE id = $1`,
      [flockId, birdsSlaughtered]
    );
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
    return;
  }
  let perf = null;
  try {
    perf = await buildFlockPerformanceSummary(flockId, at);
  } catch {
    // Submission already persisted above; return success without summary to avoid duplicate retries.
    perf = null;
  }
  appendAudit(req.authUser.id, req.authUser.role, "flock.slaughter.create", "flock", flockId, { slaughterId: row.id });
  res.status(201).json({ slaughter: row, fcr: perf?.fcr ?? null, performance: perf });
});

app.get("/api/flocks/:id/slaughter-events", requireAuth, requireFarmAccess, async (req, res) => {
  const startIso = parseOptionalIsoDate(req.query.start_at);
  const endIso = parseOptionalIsoDate(req.query.end_at);
  try {
    const list = await listSlaughterForFlock(req.params.id, startIso, endIso);
    res.json({ slaughterEvents: list });
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
  }
});

app.get("/api/flocks/:id/performance-summary", requireAuth, requireFarmAccess, async (req, res) => {
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
  return {
    ...row,
    flockLabel: flocksById.get(row.flockId)?.label ?? row.flockId,
  };
}

function computeInventoryBalances(flockId = null) {
  const scoped = inventoryTransactions.filter((r) => (flockId ? r.flockId === flockId : true));
  const byFlock = new Map();
  for (const row of scoped) {
    const prev = byFlock.get(row.flockId) ?? 0;
    byFlock.set(row.flockId, prev + Number(row.deltaKg || 0));
  }
  return [...byFlock.entries()].map(([id, balanceKg]) => ({
    flockId: id,
    flockLabel: flocksById.get(id)?.label ?? id,
    balanceKg: Number(balanceKg.toFixed(3)),
  }));
}

app.get("/api/inventory/ledger", requireAuth, requireFarmAccess, (req, res) => {
  const flockId = String(req.query.flock_id ?? "").trim();
  const type = String(req.query.type ?? "").trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 30));

  let list = inventoryTransactions;
  if (flockId) list = list.filter((r) => r.flockId === flockId);
  if (type) list = list.filter((r) => r.type === type);

  list = [...list].sort((a, b) => (a.at < b.at ? 1 : -1));
  const total = list.length;
  const start = (page - 1) * pageSize;
  const rows = list.slice(start, start + pageSize).map(inventoryRowPayload);
  res.json({ rows, total, page, pageSize });
});

app.get("/api/inventory/balance", requireAuth, requireFarmAccess, (req, res) => {
  const flockId = String(req.query.flock_id ?? "").trim() || null;
  res.json({ balances: computeInventoryBalances(flockId) });
});

app.post("/api/inventory/procurement", requireAuth, requireFarmAccess, (req, res) => {
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
  if (!INVENTORY_REASON_CODES.procurement.includes(reasonCode)) {
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
  const row = {
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
  inventoryTransactions.unshift(row);
  appendAudit(req.authUser.id, req.authUser.role, "inventory.procurement.create", "inventory", row.id, {
    flockId,
    quantityKg,
  });
  res.status(201).json({ row: inventoryRowPayload(row), balances: computeInventoryBalances(flockId) });
});

app.post("/api/inventory/feed-consumption", requireAuth, requireFarmAccess, (req, res) => {
  if (!canCreateFeedConsumption(req.authUser)) {
    res.status(403).json({ error: "Only laborer, dispatcher, manager, or superuser can log feed usage" });
    return;
  }
  const body = req.body ?? {};
  const flockId = String(body.flockId ?? "").trim();
  const quantityKg = Number(body.quantityKg);
  const reasonCode = String(body.reasonCode ?? "").trim() || "round_feed";
  if (!INVENTORY_REASON_CODES.consumption.includes(reasonCode)) {
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
  const currentBalance = computeInventoryBalances(flockId)[0]?.balanceKg ?? 0;
  if (currentBalance - quantityKg < 0 && !canCreateInventoryAdjustment(req.authUser)) {
    res.status(400).json({ error: "Insufficient stock for this flock" });
    return;
  }
  const row = {
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
  inventoryTransactions.unshift(row);
  appendAudit(req.authUser.id, req.authUser.role, "inventory.feed.create", "inventory", row.id, {
    flockId,
    quantityKg,
  });
  res.status(201).json({ row: inventoryRowPayload(row), balances: computeInventoryBalances(flockId) });
});

app.post("/api/inventory/adjustments", requireAuth, requireFarmAccess, (req, res) => {
  if (!canCreateInventoryAdjustment(req.authUser)) {
    res.status(403).json({ error: "Only manager or superuser can adjust stock" });
    return;
  }
  const body = req.body ?? {};
  const flockId = String(body.flockId ?? "").trim();
  const deltaKg = Number(body.deltaKg);
  const reasonCode = String(body.reasonCode ?? "").trim() || "stock_count_correction";
  if (!INVENTORY_REASON_CODES.adjustment.includes(reasonCode)) {
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
  const row = {
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
  inventoryTransactions.unshift(row);
  appendAudit(req.authUser.id, req.authUser.role, "inventory.adjustment.create", "inventory", row.id, {
    flockId,
    deltaKg,
  });
  res.status(201).json({ row: inventoryRowPayload(row), balances: computeInventoryBalances(flockId) });
});

app.patch("/api/inventory/:id", requireAuth, requireFarmAccess, (req, res) => {
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
  if (body.reason !== undefined) row.reason = String(body.reason).slice(0, 400);
  if (row.type === "procurement_receipt" && body.reference !== undefined) {
    row.reference = String(body.reference).slice(0, 200);
  }
  appendAudit(req.authUser.id, req.authUser.role, "inventory.row.update", "inventory", row.id, {});
  res.json({ row: inventoryRowPayload(row), balances: computeInventoryBalances(row.flockId) });
});

/** @type {Array<Record<string, unknown>>} */
const dailyLogs = [];

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "clevafarm-api", storedLogs: dailyLogs.length, users: usersById.size });
});

function computeValidation(payload) {
  const initial = Number(process.env.DEMO_INITIAL_COUNT) || 1000;
  const mortality = Number(payload.mortality) || 0;
  const pct = initial > 0 ? (mortality / initial) * 100 : 0;
  const warnings = [];
  if (pct >= 0.5) warnings.push(`Mortality is ${pct.toFixed(2)}% of initial flock (≥ 0.5%).`);
  if (pct >= 2) warnings.push("Very high single-day mortality — would require vet manager approval in production.");
  return { warnings, mortalityPct: pct };
}

app.post("/api/daily-logs/validate", requireAuth, (req, res) => {
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

app.post("/api/daily-logs", requireAuth, async (req, res) => {
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
  const validation = computeValidation(payload);
  const dlId = `dl_${crypto.randomBytes(6).toString("hex")}`;
  const receivedAt = new Date().toISOString();
  try {
    await dbQuery(
      `INSERT INTO daily_logs (id, flock_id, log_date, feed_kg, water_l, notes, entered_by_user_id, created_at)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8)`,
      [
        dlId,
        String(payload.flockId),
        String(payload.logDate),
        Number(payload.feedKg ?? 0),
        Number(payload.waterL ?? 0),
        String(payload.notes ?? ""),
        req.authUser.id,
        receivedAt,
      ]
    );
    appendAudit(req.authUser.id, req.authUser.role, "farm.daily_log.create", "flock", String(payload.flockId), {
      logDate: payload.logDate,
    });
    res.json({
      ok: true,
      record: {
        id: dlId,
        ...payload,
        receivedAt,
        validation,
        enteredByUserId: req.authUser.id,
      },
      payrollImpact: null,
    });
  } catch {
    res.status(503).json({ error: "Database unavailable. Please retry shortly." });
  }
});

app.get("/api/server-time", requireAuth, (_req, res) => {
  const now = new Date();
  res.json({
    iso: now.toISOString(),
    kigali: now.toLocaleString("en-GB", { timeZone: "Africa/Kigali", dateStyle: "full", timeStyle: "medium" }),
  });
});

app.post("/api/log-schedule", requireAuth, requireFarmAccess, requireLogScheduleEditor, (req, res) => {
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
  const id = `ls_${crypto.randomBytes(6).toString("hex")}`;
  const row = {
    id,
    flockId,
    role,
    intervalHours,
    windowOpen,
    windowClose,
    createdAt: new Date().toISOString(),
  };
  logSchedules.push(row);
  appendAudit(req.authUser.id, req.authUser.role, "log_schedule.create", "flock", flockId, { scheduleId: id });
  res.status(201).json({ schedule: row });
});

app.get("/api/log-schedule/:flockId", requireAuth, requireFarmAccess, requireLogScheduleEditor, (req, res) => {
  const flockId = req.params.flockId;
  const list = logSchedules.filter((s) => s.flockId === flockId);
  res.json({ schedules: list });
});

app.patch("/api/log-schedule/:id", requireAuth, requireFarmAccess, requireLogScheduleEditor, (req, res) => {
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
  if (body.role != null) s.role = String(body.role);
  appendAudit(req.authUser.id, req.authUser.role, "log_schedule.update", "flock", s.flockId, { scheduleId: s.id });
  res.json({ schedule: s });
});

app.delete("/api/log-schedule/:id", requireAuth, requireFarmAccess, requireLogScheduleEditor, (req, res) => {
  const i = logSchedules.findIndex((x) => x.id === req.params.id);
  if (i < 0) {
    res.status(404).json({ error: "Schedule not found" });
    return;
  }
  const [removed] = logSchedules.splice(i, 1);
  appendAudit(req.authUser.id, req.authUser.role, "log_schedule.delete", "flock", removed.flockId, {
    scheduleId: removed.id,
  });
  res.json({ ok: true });
});

app.post("/api/payroll-impact", requireAuth, requireFarmAccess, (req, res) => {
  if (!canManageLogScheduleAndPayroll(req.authUser)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const body = req.body ?? {};
  const userId = String(body.user_id ?? "");
  const logType = String(body.log_type ?? "daily_log");
  const rwfDelta = Number(body.rwf_delta);
  if (!userId || !usersById.has(userId)) {
    res.status(400).json({ error: "user_id required" });
    return;
  }
  if (!Number.isFinite(rwfDelta)) {
    res.status(400).json({ error: "rwf_delta required" });
    return;
  }
  if (logType !== "daily_log" && logType !== "check_in") {
    res.status(400).json({ error: "log_type must be daily_log or check_in" });
    return;
  }
  const periodStart = String(body.period_start ?? kigaliYmd(new Date()));
  const periodEnd = String(body.period_end ?? periodStart);
  const reason = String(body.reason ?? "Manual adjustment");
  const logId = String(body.log_id ?? `manual_${crypto.randomBytes(4).toString("hex")}`);
  const submittedAt = String(body.submitted_at ?? new Date().toISOString());
  const row = {
    id: `pi_${crypto.randomBytes(6).toString("hex")}`,
    userId,
    logId,
    logType,
    rwfDelta,
    reason,
    periodStart,
    periodEnd,
    approvedBy: null,
    approvedAt: null,
    createdAt: new Date().toISOString(),
    submittedAt,
    onTime: null,
  };
  payrollImpacts.unshift(row);
  appendAudit(req.authUser.id, req.authUser.role, "payroll.impact.manual", "payroll_impact", row.id, {
    userId,
    rwfDelta,
  });
  res.status(201).json({ entry: row });
});

app.get("/api/payroll-impact", requireAuth, requireFarmAccess, (req, res) => {
  const isField = req.authUser.role === "laborer" || req.authUser.role === "dispatcher";
  const isPayrollManager = canManageLogScheduleAndPayroll(req.authUser);
  if (!isField && !isPayrollManager) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const userIdQ = String(req.query.user_id ?? "").trim();
  const periodStart = String(req.query.period_start ?? "").trim();
  const periodEnd = String(req.query.period_end ?? "").trim();
  const approvedQ = req.query.approved;
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
  res.json({ entries: enriched });
});

app.patch("/api/payroll-impact/:id/approve", requireAuth, requireFarmAccess, requirePayrollApprover, (req, res) => {
  const p = payrollImpacts.find((x) => x.id === req.params.id);
  if (!p) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  p.approvedBy = req.authUser.id;
  p.approvedAt = new Date().toISOString();
  appendAudit(req.authUser.id, req.authUser.role, "payroll.impact.approve", "payroll_impact", p.id, {});
  res.json({ entry: p });
});

app.post("/api/payroll-impact/bulk-approve", requireAuth, requireFarmAccess, requirePayrollApprover, (req, res) => {
  const body = req.body ?? {};
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : null;
  let n = 0;
  const at = new Date().toISOString();
  for (const p of payrollImpacts) {
    if (p.approvedAt != null) continue;
    if (ids && !ids.includes(p.id)) continue;
    p.approvedBy = req.authUser.id;
    p.approvedAt = at;
    n += 1;
  }
  appendAudit(req.authUser.id, req.authUser.role, "payroll.impact.bulk_approve", "payroll_impact", null, { count: n });
  res.json({ ok: true, approvedCount: n });
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

process.on("uncaughtException", (err) => {
  console.error("[ERROR]", "[fatal] uncaughtException:", err?.message ?? err);
  console.error(err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[ERROR]", "[fatal] unhandledRejection:", reason);
});

function listenServer() {
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log("[INFO]", `Clevafarm API listening on 0.0.0.0:${PORT} env=${process.env.NODE_ENV ?? "development"}`);
    if (process.env.DATABASE_URL) {
      console.log("[INFO]", "[startup] DATABASE_URL is set (pool will use DB)");
    } else {
      console.warn("[WARN]", "[startup] DATABASE_URL is not set — API auth and DB routes will fail");
    }
  });
  server.on("error", (err) => {
    console.error("[ERROR]", "[listen] server error:", err?.message ?? err);
    throw err;
  });
  return server;
}

listenServer();

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
