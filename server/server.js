import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { runMigrations } from "./migrate.js";
import { checkinSchema, dailyLogSchema, loginSchema } from "./utils/validation.js";

// PROD-FIX: run migrations on boot without crashing API startup on failure
runMigrations().then((result) => {
  if (result.ok) console.log("[INFO]", "[startup] migrations complete");
  else console.error("[ERROR]", "[startup] migrations complete with failures:", result.failedCount);
}).catch(err => {
  console.error("[ERROR]", "[startup] migration error:", err.message);
  // Don't crash the server if migrations fail
});

const app = express();
const PORT = Number(process.env.PORT) || 3000;
// FIX: move hardcoded values to environment variables
const PEPPER = process.env.AUTH_PEPPER ?? "";
const PgStore = pgSession(session);

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

let auditSeq = 0;
/** @type {Array<{ id: string, at: string, actor_id: string, role: string, action: string, resource: string, resource_id: string | null, metadata?: object }>} */
const auditEvents = [];

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

seedUsers();

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
    message: "Farm Manager API running",
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

app.get("/api/users", requireAuth, requireSuperuser, (_req, res) => {
  res.json({ users: [...usersById.values()].map(sanitizeUser) });
});

app.post("/api/users", requireAuth, requireSuperuser, (req, res) => {
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
  if (usersByEmail.has(email)) {
    res.status(409).json({ error: "User already exists" });
    return;
  }

  const id = `usr_${crypto.randomBytes(6).toString("hex")}`;
  const row = {
    id,
    email,
    displayName,
    passwordHash: hashPassword(password),
    role,
    businessUnitAccess,
    canViewSensitiveFinancial,
    departmentKeys,
  };
  upsertUser(row);
  appendAudit(req.authUser.id, req.authUser.role, "user.create", "user", id, {
    email,
    role,
    businessUnitAccess,
    canViewSensitiveFinancial,
  });
  res.json({ user: sanitizeUser(row) });
});

app.get("/api/audit", requireAuth, requireSuperuser, (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const roleFilter = String(req.query.role ?? "").trim();
  const actionFilter = String(req.query.action ?? "").trim();

  let list = auditEvents;
  if (roleFilter) list = list.filter((e) => e.role === roleFilter);
  if (actionFilter) list = list.filter((e) => e.action.includes(actionFilter));

  const total = list.length;
  const start = (page - 1) * pageSize;
  const events = list.slice(start, start + pageSize);
  res.json({ events, total, page, pageSize });
});

/** FIX: explicit audit POST (actor must match session; superuser may supply any actor_id for tooling) */
app.post("/api/audit", requireAuth, (req, res) => {
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
  res.status(201).json({ event: row });
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

app.get("/api/flocks", requireAuth, requireFarmAccess, (_req, res) => {
  // FIX: embed check-in urgency per flock for list + detail views
  const flocks = [...flocksById.values()].map((f) => {
    const st = checkinStatusPayload(f);
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

app.get("/api/flocks/:id/checkin-status", requireAuth, requireFarmAccess, (req, res) => {
  const f = flocksById.get(req.params.id);
  if (!f) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  res.json(checkinStatusPayload(f));
});

app.patch("/api/flocks/:id/checkin-schedule", requireAuth, requireFarmAccess, requireCheckinScheduleEditor, (req, res) => {
  const f = flocksById.get(req.params.id);
  if (!f) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  const body = req.body ?? {};
  if (body.checkinBands !== undefined) {
    f.checkinBands = normalizeBands(body.checkinBands);
  }
  if (body.photosRequiredPerRound !== undefined) {
    const n = Number(body.photosRequiredPerRound);
    f.photosRequiredPerRound = Math.max(1, Math.min(5, Number.isFinite(n) ? n : 1));
  }
  if (body.targetSlaughterDayMin !== undefined) {
    f.targetSlaughterDayMin = Math.max(1, Number(body.targetSlaughterDayMin) || 45);
  }
  if (body.targetSlaughterDayMax !== undefined) {
    f.targetSlaughterDayMax = Math.max(f.targetSlaughterDayMin, Number(body.targetSlaughterDayMax) || 50);
  }
  appendAudit(req.authUser.id, req.authUser.role, "flock.checkin_schedule.update", "flock", f.id, {
    hasCustomBands: Boolean(f.checkinBands?.length),
    photosRequiredPerRound: f.photosRequiredPerRound,
  });
  res.json({ flock: f, status: checkinStatusPayload(f) });
});

app.post("/api/flocks/:id/round-checkins", requireAuth, requireFarmAccess, (req, res) => {
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
  const notes = String(body.notes ?? "").slice(0, 4000);
  const mortalityAtCheckin = body.mortalityAtCheckin != null ? Math.max(0, Number(body.mortalityAtCheckin)) : 0;

  const id = `chk_${crypto.randomBytes(8).toString("hex")}`;
  const at = new Date().toISOString();
  const row = {
    id,
    flockId: f.id,
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
  roundCheckins.push(row);
  const payrollImpact = maybeAutoPayrollForSubmit(req.authUser, f.id, "check_in", id, at);
  appendAudit(req.authUser.id, req.authUser.role, "farm.round_checkin.create", "flock", f.id, {
    checkinId: id,
    photoCount: photos.length,
  });
  if (mortalityAtCheckin > 0) {
    const mid = `mort_${crypto.randomBytes(8).toString("hex")}`;
    mortalityEvents.push({
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
    });
    appendAudit(req.authUser.id, req.authUser.role, "farm.mortality.create", "flock", f.id, {
      mortalityId: mid,
      count: mortalityAtCheckin,
    });
  }
  res.json({ ok: true, checkin: row, status: checkinStatusPayload(f), payrollImpact });
});

app.post("/api/flocks/:id/mortality-events", requireAuth, requireFarmAccess, (req, res) => {
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

  const id = `mort_${crypto.randomBytes(8).toString("hex")}`;
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
  };
  mortalityEvents.push(row);
  mortalityRecentByKey.set(dedupeKey, nowMs);
  appendAudit(req.authUser.id, req.authUser.role, "farm.mortality.create", "flock", f.id, {
    mortalityId: id,
    count,
    isEmergency,
  });
  res.json({ ok: true, mortality: row, status: checkinStatusPayload(f) });
});

app.get("/api/flocks/:id/mortality-events", requireAuth, requireFarmAccess, (req, res) => {
  const f = flocksById.get(req.params.id);
  if (!f) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  const list = mortalityEvents.filter((m) => m.flockId === f.id).sort((a, b) => (a.at < b.at ? 1 : -1));
  res.json({ events: list });
});

app.get("/api/flocks/:id/round-checkins", requireAuth, requireFarmAccess, (req, res) => {
  const f = flocksById.get(req.params.id);
  if (!f) {
    res.status(404).json({ error: "Flock not found" });
    return;
  }
  const list = roundCheckins.filter((c) => c.flockId === f.id).sort((a, b) => (a.at < b.at ? 1 : -1));
  res.json({ checkins: list });
});

/** @type {Array<Record<string, unknown>>} */
const dailyLogs = [];

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "farm-manager-api", storedLogs: dailyLogs.length, users: usersById.size });
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

app.post("/api/daily-logs", requireAuth, (req, res) => {
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
  const record = {
    id: dlId,
    ...payload,
    receivedAt,
    validation,
    enteredByUserId: req.authUser.id,
  };
  dailyLogs.push(record);
  const payrollImpact = maybeAutoPayrollForSubmit(
    req.authUser,
    String(payload.flockId),
    "daily_log",
    dlId,
    receivedAt
  );
  appendAudit(req.authUser.id, req.authUser.role, "farm.daily_log.create", "flock", String(payload.flockId), {
    logDate: payload.logDate,
  });
  res.json({ ok: true, record: { ...record, index: dailyLogs.length }, payrollImpact });
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

app.listen(PORT, () => {
  // PROD-SAFE: sanitized logging
  console.log("[INFO]", `Farm Manager API listening on port ${PORT}`);
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
