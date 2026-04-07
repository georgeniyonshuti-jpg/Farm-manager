import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
};

/** Illustration + copy for empty lists (PART 4). */
export function EmptyState({ title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-12 text-center sm:px-8">
      <svg
        className="mb-4 h-16 w-16 text-neutral-300"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.25}
          d="M20 13V7a2 2 0 00-2-2h-3l-1-2H10L9 5H6a2 2 0 00-2 2v6m16 0v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4m16 0h-6m-6 0H4"
        />
      </svg>
      <p className="font-medium text-neutral-800">{title}</p>
      {description ? <p className="mt-2 max-w-md text-sm text-neutral-600">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
