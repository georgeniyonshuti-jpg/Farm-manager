import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { handleOAuthCallback } from "../../auth/ERPNextOAuth";
import { setErpnextSessionId } from "../../lib/erpnextSession";
import { defaultHomeForUser } from "../../routes/ProtectedRoute";
import { resolveUserCompanySlug } from "../../lib/tenancy";

export function ERPNextOAuthCallbackPage() {
  const [params] = useSearchParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) {
      setError("Missing OAuth parameters.");
      return;
    }
    void (async () => {
      try {
        const data = await handleOAuthCallback(code, state, token);
        if (data?.sid) setErpnextSessionId(data.sid);
        const slug = user ? resolveUserCompanySlug(user) : null;
        navigate(defaultHomeForUser(user?.role ?? "manager", slug ?? undefined), { replace: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : "OAuth failed");
      }
    })();
  }, [params, token, user, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm max-w-md">
        {error ? (
          <>
            <h1 className="text-lg font-semibold text-red-700">ERPNext sign-in failed</h1>
            <p className="mt-2 text-sm text-neutral-600">{error}</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-neutral-900">Completing ERPNext sign-in…</h1>
            <p className="mt-2 text-sm text-neutral-600">Redirecting to your farm dashboard.</p>
          </>
        )}
      </div>
    </div>
  );
}
