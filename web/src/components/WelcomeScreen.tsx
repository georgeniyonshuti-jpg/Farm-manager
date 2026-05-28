import { Link, useNavigate } from "react-router-dom";

export function WelcomeScreen({ companyName }: { companyName: string }) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-8 shadow-[var(--shadow-card)]">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
        Welcome to Clevafarm{companyName ? `, ${companyName}` : ""}!
      </h1>
      <p className="mt-2 text-[var(--text-secondary)]">Set up your workspace in a few quick steps.</p>
      <ul className="mt-6 space-y-2 text-sm text-[var(--text-secondary)]">
        <li>[ ] Add your first flock</li>
        <li>[ ] Invite your team</li>
        <li>[ ] Set your check-in schedule</li>
      </ul>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-lg bg-[var(--primary-color)] px-4 py-2 font-semibold text-white"
          onClick={() => navigate("/farm/flocks")}
        >
          Add your first flock
        </button>
        <button
          type="button"
          className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-[var(--text-primary)]"
          onClick={() => navigate("/dashboard/management")}
        >
          Skip for now
        </button>
      </div>
      <p className="mt-4 text-sm text-[var(--text-muted)]">
        <Link to="/admin/users" className="underline">
          Invite team members
        </Link>
      </p>
    </div>
  );
}
