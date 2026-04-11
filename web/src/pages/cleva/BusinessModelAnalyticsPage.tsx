import { useMemo } from "react";
import { PageHeader } from "../../components/PageHeader";

const DEFAULT_STREAMLIT = "http://127.0.0.1:8501";

/**
 * Embeds the ClevaCredit PAYGO / broiler Streamlit app from the Business Model repo.
 * Run separately: `cd "/path/to/Business Model" && streamlit run app.py`
 * Set VITE_BUSINESS_MODEL_URL if Streamlit is not on the default port/host.
 */
export function BusinessModelAnalyticsPage() {
  const embedUrl = useMemo(() => {
    const raw = import.meta.env.VITE_BUSINESS_MODEL_URL;
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    return DEFAULT_STREAMLIT;
  }, []);

  const openHref = embedUrl.startsWith("http") ? embedUrl : `https://${embedUrl}`;

  return (
    <div className="flex min-h-[calc(100dvh-var(--app-header-h,4rem)-6rem)] flex-col gap-4">
      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm md:p-6">
        <PageHeader
          title="Business model analytics"
          subtitle="ClevaCredit PAYGO projections, broiler economics, and budgeting (Streamlit). Access is controlled in User management → page visibility."
        />
        <p className="mt-3 text-sm text-neutral-600">
          This view loads the app from{" "}
          <span className="font-mono text-xs text-neutral-800">{embedUrl}</span>. If the frame stays blank,
          your browser may block cross-origin embedding — use{" "}
          <a
            href={openHref}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-emerald-800 underline"
          >
            Open in new tab
          </a>
          . Configure <span className="font-mono text-xs">VITE_BUSINESS_MODEL_URL</span> for production.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 shadow-sm">
        <iframe
          title="Business model analytics (Streamlit)"
          src={openHref}
          className="h-[min(85dvh,900px)] w-full min-h-[480px] border-0 bg-white"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  );
}
