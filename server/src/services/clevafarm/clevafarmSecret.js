function getClevaFarmApiSecret() {
  return process.env.CLEVAFARM_API_SECRET || "";
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function isClevaFarmSecretConfigured() {
  return Boolean(getClevaFarmApiSecret());
}

export function verifyClevaFarmSecret(headerValue) {
  const configured = getClevaFarmApiSecret();
  if (!configured) {
    if (isProduction()) return false;
    return true;
  }
  if (!headerValue || typeof headerValue !== "string") return false;
  return headerValue === configured;
}

export function requireClevaFarmSecret(req, res, next) {
  const secret = req.headers["x-clevafarm-secret"];
  if (!getClevaFarmApiSecret() && isProduction()) {
    res.status(503).json({ error: "CLEVAFARM_API_SECRET is not configured on the server." });
    return;
  }
  if (!verifyClevaFarmSecret(secret)) {
    res.status(403).json({ error: "Invalid or missing X-ClevaFarm-Secret" });
    return;
  }
  next();
}

export function clevafarmSecretHeaders() {
  const h = { "Content-Type": "application/json" };
  const configured = getClevaFarmApiSecret();
  if (configured) h["X-ClevaFarm-Secret"] = configured;
  return h;
}
