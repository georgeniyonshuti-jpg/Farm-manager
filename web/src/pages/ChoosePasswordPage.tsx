import { useState } from "react";
import { API_BASE_URL } from "../api/config";
import { useAuth } from "../auth/AuthContext";

/** Blocks the app until an admin-created account replaces the temporary password. */
export function ChoosePasswordPage() {
  const { token, logout, refreshMe, clearMustChangePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (newPassword !== again) {
      setError("The two new passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Could not change the password");
      }
      clearMustChangePassword();
      await refreshMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background-color)] px-4">
      <form
        onSubmit={(e) => void submit(e)}
        className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-6 shadow-sm"
      >
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Choose a password</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          This account was created for you. Enter the temporary password, then choose your own.
        </p>
        <label className="mt-4 block text-sm font-medium text-neutral-700" htmlFor="current-password">
          Temporary password
          <input
            id="current-password"
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-neutral-700" htmlFor="new-password">
          New password
          <input
            id="new-password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-neutral-700" htmlFor="new-password-again">
          New password again
          <input
            id="new-password-again"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </label>
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-lg bg-emerald-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save password"}
        </button>
        <button
          type="button"
          className="mt-2 w-full rounded-lg px-3 py-2 text-sm text-neutral-600"
          onClick={() => void logout()}
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
