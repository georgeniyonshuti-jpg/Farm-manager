/**
 * SaaS billing plan catalog (DB-backed, super-admin editable).
 */

const PLAN_ID_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

export function serializePlan(row) {
  if (!row) return null;
  const features = Array.isArray(row.features)
    ? row.features
    : typeof row.features === "string"
      ? JSON.parse(row.features)
      : [];
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price_usd),
    priceRWF: row.price_rwf,
    maxUsers: row.max_users,
    maxFlocks: row.max_flocks,
    features,
    stripePriceId: row.stripe_price_id ?? null,
    sortOrder: row.sort_order ?? 0,
    isActive: row.is_active !== false,
  };
}

function validatePlanInput(body, { isCreate }) {
  const id = String(body?.id ?? "").trim().toLowerCase();
  const name = String(body?.name ?? "").trim();
  if (isCreate && (!id || !PLAN_ID_RE.test(id))) {
    throw new Error("Plan id must be 3–32 lowercase letters, numbers, or hyphens.");
  }
  if (!name) throw new Error("Plan name is required.");
  const price = Number(body?.price ?? body?.priceUsd ?? 0);
  const priceRWF = Number(body?.priceRWF ?? body?.price_rwf ?? 0);
  const maxUsers = Number(body?.maxUsers ?? body?.max_users ?? 0);
  const maxFlocks = Number(body?.maxFlocks ?? body?.max_flocks ?? 0);
  if (!Number.isFinite(price) || price < 0) throw new Error("USD price must be zero or greater.");
  if (!Number.isInteger(priceRWF) || priceRWF < 0) throw new Error("RWF price must be a non-negative integer.");
  if (!Number.isInteger(maxUsers) || maxUsers < 1) throw new Error("maxUsers must be at least 1.");
  if (!Number.isInteger(maxFlocks) || maxFlocks < 1) throw new Error("maxFlocks must be at least 1.");
  let features = body?.features;
  if (typeof features === "string") {
    features = features
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(features)) features = [];
  features = features.map((f) => String(f).trim()).filter(Boolean);
  const stripePriceId = String(body?.stripePriceId ?? body?.stripe_price_id ?? "").trim() || null;
  const sortOrder = Number(body?.sortOrder ?? body?.sort_order ?? 0);
  const isActive = body?.isActive !== false && body?.is_active !== false;
  return {
    id,
    name,
    price_usd: price,
    price_rwf: priceRWF,
    max_users: maxUsers,
    max_flocks: maxFlocks,
    features: JSON.stringify(features),
    stripe_price_id: stripePriceId,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    is_active: isActive,
  };
}

export async function listBillingPlans(dbQuery, { activeOnly = true } = {}) {
  const where = activeOnly ? "WHERE is_active = true" : "";
  const r = await dbQuery(
    `SELECT id, name, price_usd, price_rwf, max_users, max_flocks, features,
            stripe_price_id, sort_order, is_active
       FROM billing_plans
       ${where}
       ORDER BY sort_order ASC, id ASC`
  );
  return r.rows.map(serializePlan);
}

export async function getBillingPlanById(dbQuery, id) {
  const r = await dbQuery(
    `SELECT id, name, price_usd, price_rwf, max_users, max_flocks, features,
            stripe_price_id, sort_order, is_active
       FROM billing_plans
       WHERE id = $1`,
    [id]
  );
  return serializePlan(r.rows[0]);
}

export async function createBillingPlan(dbQuery, body) {
  const p = validatePlanInput(body, { isCreate: true });
  const existing = await getBillingPlanById(dbQuery, p.id);
  if (existing) throw new Error("A plan with this id already exists.");
  await dbQuery(
    `INSERT INTO billing_plans (
       id, name, price_usd, price_rwf, max_users, max_flocks, features,
       stripe_price_id, sort_order, is_active, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, now())`,
    [
      p.id,
      p.name,
      p.price_usd,
      p.price_rwf,
      p.max_users,
      p.max_flocks,
      p.features,
      p.stripe_price_id,
      p.sort_order,
      p.is_active,
    ]
  );
  return getBillingPlanById(dbQuery, p.id);
}

export async function updateBillingPlan(dbQuery, id, body) {
  const current = await getBillingPlanById(dbQuery, id);
  if (!current) throw new Error("Plan not found.");
  const p = validatePlanInput({ ...body, id }, { isCreate: false });
  await dbQuery(
    `UPDATE billing_plans SET
       name = $2,
       price_usd = $3,
       price_rwf = $4,
       max_users = $5,
       max_flocks = $6,
       features = $7::jsonb,
       stripe_price_id = $8,
       sort_order = $9,
       is_active = $10,
       updated_at = now()
     WHERE id = $1`,
    [
      id,
      p.name,
      p.price_usd,
      p.price_rwf,
      p.max_users,
      p.max_flocks,
      p.features,
      p.stripe_price_id,
      p.sort_order,
      p.is_active,
    ]
  );
  return getBillingPlanById(dbQuery, id);
}

export async function deactivateBillingPlan(dbQuery, id) {
  if (id === "starter" || id === "pro") {
    throw new Error("Cannot delete built-in default plans; deactivate instead.");
  }
  const usage = await dbQuery(
    `SELECT COUNT(*)::int AS c FROM companies WHERE plan = $1`,
    [id]
  );
  if ((usage.rows[0]?.c ?? 0) > 0) {
    await dbQuery(`UPDATE billing_plans SET is_active = false, updated_at = now() WHERE id = $1`, [id]);
    return getBillingPlanById(dbQuery, id);
  }
  await dbQuery(`DELETE FROM billing_plans WHERE id = $1`, [id]);
  return { id, deleted: true };
}

/** Resolve plan for checkout — DB first, env stripe id fallback for legacy rows. */
export async function resolveCheckoutPlan(dbQuery, planId) {
  const fromDb = await getBillingPlanById(dbQuery, planId);
  if (!fromDb || !fromDb.isActive) return null;
  let stripePriceId = fromDb.stripePriceId;
  if (!stripePriceId) {
    if (planId === "starter") stripePriceId = process.env.STRIPE_PRICE_STARTER ?? null;
    if (planId === "pro") stripePriceId = process.env.STRIPE_PRICE_PRO ?? null;
  }
  return { ...fromDb, stripePriceId };
}
