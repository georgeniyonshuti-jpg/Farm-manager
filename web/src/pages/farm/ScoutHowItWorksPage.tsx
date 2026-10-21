import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCompanyNav } from "../../hooks/useCompanyNav";

const STEPS = [
  { n: "1", title: "Add a seller", body: "A manager approves them before you can add a flock." },
  { n: "2", title: "Add a flock", body: "Birds, dates, and price. A manager approves it before buyers see it." },
  { n: "3", title: "Visit the flock", body: "Confirm it is ready to sell. The visit can be approved." },
  { n: "4", title: "Get paid", body: "You earn a share when the flock sells. Cleva pays that after the sale." },
];

export function ScoutHowItWorksPage() {
  const navigate = useNavigate();
  const { companyHref } = useCompanyNav();

  return (
    <div className="mx-auto max-w-lg space-y-3 pb-28">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => navigate(companyHref("/farm/pipeline/home"))}
          className="bounce-tap inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[var(--text-secondary)]"
          aria-label="Home"
        >
          <ChevronLeft className="h-6 w-6" aria-hidden />
        </button>
        <h1 className="sr-only">How it works</h1>
      </div>
      <ol className="space-y-2">
        {STEPS.map((step) => (
          <li
            key={step.n}
            className="flex gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary-color)] text-sm font-semibold text-white">
              {step.n}
            </span>
            <span>
              <span className="block font-semibold text-[var(--text-primary)]">{step.title}</span>
              <span className="mt-0.5 block text-sm text-[var(--text-secondary)]">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
