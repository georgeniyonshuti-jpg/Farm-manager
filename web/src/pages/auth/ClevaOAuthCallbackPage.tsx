import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { exchangeClevaCallback } from "../../auth/ClevaOAuth";
import { defaultHomeForUser } from "../../routes/ProtectedRoute";
import { resolveUserCompanySlug } from "../../lib/tenancy";
import { BrandLogo } from "../../components/BrandLogo";

export function ClevaOAuthCallbackPage() {
  const [params] = useSearchParams();
  const { establishSession } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");
    if (oauthError) {
      setError("Cleva login was cancelled or denied.");
      return;
    }
    if (!code || !state) {
      setError("Missing OAuth parameters.");
      return;
    }
    void (async () => {
      try {
        const { token, user, farmBootstrap } = await exchangeClevaCallback(code, state);
        establishSession(token, user, farmBootstrap ?? null);
        navigate(defaultHomeForUser(user.role, resolveUserCompanySlug(user)), { replace: true });
      } catch (e) {
        const err = e as Error & { code?: string };
        if (err.code === "no_companies") {
          setError(
            "Your Cleva account has no Farm-enabled company on this site. Enable Farm Manager for a company in ERPNext, then try Login with Cleva again."
          );
          return;
        }
        setError(err instanceof Error ? err.message : "Cleva login failed");
      }
    })();
  }, [params, establishSession, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background-color)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-8 text-center shadow-[var(--shadow-card)]">
        <div className="mb-4 flex justify-center">
          <BrandLogo size={56} />
        </div>
        {error ? (
          <>
            <h1 className="text-lg font-semibold text-red-600">Cleva sign-in failed</h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">{error}</p>
            <Link
              to="/login"
              className="mt-6 inline-block text-sm font-semibold text-[var(--primary-color)] hover:underline"
            >
              Back to login
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">
              Completing Cleva sign-in…
            </h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Redirecting to your farm workspace.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
