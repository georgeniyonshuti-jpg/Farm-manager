import { useState } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { PasswordInput } from "../components/PasswordInput";
import { API_BASE_URL } from "../api/config";

async function postJson(path: string, body: unknown) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    ok?: boolean;
    erpForgotUrl?: string;
  };
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  const [erpForgotUrl, setErpForgotUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await postJson("/api/auth/forgot-password", { email: email.trim() });
      if (!res.ok) {
        throw new Error(res.error || "Request failed");
      }
      setMessage(res.message || "Check your email.");
      setErpForgotUrl(res.erpForgotUrl);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-[var(--background-color)] px-4 py-6">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] px-6 pb-6 pt-5 shadow-[var(--shadow-card)]">
        <div className="flex justify-center">
          <BrandLogo size={44} />
        </div>
        <h1 className="mt-2 text-center text-lg font-semibold text-[var(--text-primary)]">Forgot password</h1>
        {done ? (
          <div className="mt-5 space-y-3 text-center text-sm text-[var(--text-secondary)]">
            <p>{message}</p>
            {erpForgotUrl ? (
              <p>
                <a className="text-[var(--primary-color)] hover:underline" href={erpForgotUrl}>
                  Cleva reset
                </a>
              </p>
            ) : null}
            <Link to="/login" className="block text-[var(--primary-color)] hover:underline">
              Sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} className="mt-5 space-y-3">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-4 py-2.5 text-[var(--text-primary)]"
              />
            </div>
            {error && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-[var(--primary-color)] py-2.5 font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send link"}
            </button>
            <Link to="/login" className="block text-center text-sm text-[var(--primary-color)] hover:underline">
              Sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}

export function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!token) {
      setError("Missing reset token");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/auth/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-[var(--background-color)] px-4 py-8">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-8 shadow-[var(--shadow-card)]">
        <div className="mb-2 flex justify-center">
          <BrandLogo size={64} />
        </div>
        <h1 className="text-center text-xl font-semibold text-[var(--text-primary)]">Set a new password</h1>
        {done ? (
          <div className="mt-6 space-y-3 text-sm text-[var(--text-secondary)]">
            <p>Password updated. You can sign in with your new password.</p>
            <Link to="/login" className="block underline text-[var(--primary-color)]">
              Go to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
            {!token ? (
              <p className="text-sm text-red-400">This reset link is incomplete. Request a new one.</p>
            ) : null}
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                New password
              </label>
              <PasswordInput
                id="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                Confirm password
              </label>
              <PasswordInput
                id="confirm"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || !token}
              className="w-full rounded-xl bg-[var(--primary-color)] py-3 font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Saving…" : "Update password"}
            </button>
            <Link
              to="/forgot-password"
              className="block text-center text-sm underline text-[var(--primary-color)]"
            >
              Request a new link
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
