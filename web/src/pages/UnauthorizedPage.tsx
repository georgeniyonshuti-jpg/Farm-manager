import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { BrandLogo } from "../components/BrandLogo";
import { defaultHomeForUser } from "../routes/ProtectedRoute";

/**
 * Shown when a signed-in user hits a route their role cannot access.
 */
export function UnauthorizedPage() {
  const { user, logout } = useAuth();
  const home = user ? defaultHomeForUser(user.role) : "/login";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-100 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-3 flex justify-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary-color-soft)]">
            <BrandLogo size={34} />
          </span>
        </div>
        <PageHeader
          className="items-center text-center sm:flex-col sm:items-center"
          title="Access denied"
          subtitle="You don&apos;t have permission to view this page. If you think this is a mistake, contact your administrator."
        />
        {user && (
          <p className="mt-2 text-xs text-neutral-500">
            Signed in as <span className="font-medium text-neutral-700">{user.displayName}</span> (
            {user.role.replace(/_/g, " ")})
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            to={home}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-emerald-800 px-5 text-sm font-semibold text-white hover:bg-emerald-900"
          >
            Go to your home
          </Link>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-neutral-300 bg-white px-5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
