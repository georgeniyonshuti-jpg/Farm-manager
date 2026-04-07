import { Link } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";

export function VetHome() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Veterinary command"
        subtitle="Health trends and pending interventions."
        action={
          <Link
            to="/farm/batch-schedule"
            className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900"
          >
            Check-in schedule (batch)
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-800">Pending reviews</h2>
          <p className="mt-2 text-sm text-neutral-600">
            High-mortality daily logs awaiting vet manager approval appear here (wire to API).
          </p>
        </section>
        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-800">Health trend</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Flock morbidity / treatment compliance charts plug in here.
          </p>
        </section>
      </div>
    </div>
  );
}
