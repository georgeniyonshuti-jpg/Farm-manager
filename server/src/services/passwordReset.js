import { createHash, randomBytes } from "node:crypto";
import { sendMail, smtpConfigFromEnv } from "./smtpSend.js";

const TOKEN_TTL_MS = 60 * 60 * 1000;
const memoryTokens = new Map();

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {{
 *   hasDb: () => boolean,
 *   dbQuery: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>,
 *   findUserByEmail: (email: string) => any | null,
 *   hashPassword: (pw: string) => string,
 *   upsertUser: (user: any) => Promise<void> | void,
 *   fetchClevaUserExists?: (email: string) => Promise<boolean>,
 *   frontendUrl: string,
 *   erpUrl: string,
 * }} deps
 */
export function createPasswordResetService(deps) {
  async function persistToken(tokenHash, userId, email, expiresAt) {
    memoryTokens.set(tokenHash, {
      userId,
      email,
      expiresAt: expiresAt.getTime(),
    });
    if (!deps.hasDb()) return;
    await deps.dbQuery(
      `DELETE FROM password_reset_tokens WHERE user_id = $1`,
      [userId],
    );
    await deps.dbQuery(
      `INSERT INTO password_reset_tokens (token_hash, user_id, email, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token_hash) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         email = EXCLUDED.email,
         expires_at = EXCLUDED.expires_at`,
      [tokenHash, userId, email, expiresAt.toISOString()],
    );
  }

  async function loadToken(tokenHash) {
    if (deps.hasDb()) {
      const r = await deps.dbQuery(
        `SELECT token_hash, user_id, email, expires_at
         FROM password_reset_tokens WHERE token_hash = $1`,
        [tokenHash],
      );
      const row = r.rows[0];
      if (row) {
        return {
          userId: String(row.user_id),
          email: String(row.email),
          expiresAt: Date.parse(row.expires_at),
        };
      }
    }
    const mem = memoryTokens.get(tokenHash);
    if (!mem) return null;
    if (mem.expiresAt <= Date.now()) {
      memoryTokens.delete(tokenHash);
      return null;
    }
    return mem;
  }

  async function dropToken(tokenHash, userId) {
    memoryTokens.delete(tokenHash);
    if (!deps.hasDb()) return;
    await deps.dbQuery(`DELETE FROM password_reset_tokens WHERE token_hash = $1`, [tokenHash]);
    if (userId) {
      await deps.dbQuery(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [userId]);
    }
  }

  async function requestPasswordReset(emailRaw) {
    const email = String(emailRaw || "").trim().toLowerCase();
    const user = deps.findUserByEmail(email);
    const smtp = smtpConfigFromEnv();
    const erpForgot = `${deps.erpUrl.replace(/\/$/, "")}/login#forgot`;

    if (user?.authSource === "cleva") {
      return { ok: true, hint: "cleva", erpForgotUrl: erpForgot };
    }

    if (!user) {
      try {
        if (deps.fetchClevaUserExists && (await deps.fetchClevaUserExists(email))) {
          return { ok: true, hint: "cleva", erpForgotUrl: erpForgot };
        }
      } catch {
        /* ignore lookup failures */
      }
      throw new Error("No local Clevafarm account found for this email.");
    }

    if (!smtp) {
      console.error("[password-reset] SMTP is not configured");
      throw new Error("Password reset email cannot be sent right now. Please contact support.");
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    for (const [h, row] of memoryTokens) {
      if (row.userId === user.id) memoryTokens.delete(h);
    }
    await persistToken(tokenHash, user.id, user.email, expiresAt);

    const link = `${deps.frontendUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
    const name = user.fullName || user.name || user.email;

    await sendMail(smtp, {
      to: user.email,
      subject: "Reset your Clevafarm password",
      text: [
        `Hi ${name},`,
        "",
        "We received a request to reset your Clevafarm password.",
        `Open this link within 1 hour:`,
        link,
        "",
        "If you use Login with Cleva, reset your password on ERP instead:",
        erpForgot,
        "",
        "If you did not ask for this, you can ignore this email.",
        "",
        "— Clevafarm",
      ].join("\n"),
      html: `<p>Hi ${escapeHtml(name)},</p>
<p>We received a request to reset your <strong>Clevafarm</strong> password.</p>
<p><a href="${link}">Reset password</a> (link expires in 1 hour)</p>
<p>If you sign in with <strong>Login with Cleva</strong>, reset on ERP instead:<br/>
<a href="${erpForgot}">${erpForgot}</a></p>
<p>If you did not ask for this, ignore this email.</p>
<p>— Clevafarm</p>`,
    });

    return { ok: true, hint: "sent" };
  }

  async function resetPasswordWithToken(token, newPassword) {
    if (String(newPassword || "").length < 8) {
      return { ok: false, error: "Password must be at least 8 characters" };
    }
    const tokenHash = hashToken(token);
    const row = await loadToken(tokenHash);
    if (!row || row.expiresAt <= Date.now()) {
      await dropToken(tokenHash);
      return { ok: false, error: "Reset link is invalid or expired" };
    }

    const user = deps.findUserByEmail(row.email) || null;
    // Prefer id lookup if find by email fails (email changed) — callers pass map by id via findUserByEmail only.
    // We store email at request time; find by that email.
    if (!user || user.id !== row.userId || user.authSource === "cleva") {
      await dropToken(tokenHash, row.userId);
      return { ok: false, error: "Reset link is invalid or expired" };
    }

    user.passwordHash = deps.hashPassword(newPassword);
    await deps.upsertUser(user);
    await dropToken(tokenHash, user.id);
    return { ok: true };
  }

  return { requestPasswordReset, resetPasswordWithToken };
}
