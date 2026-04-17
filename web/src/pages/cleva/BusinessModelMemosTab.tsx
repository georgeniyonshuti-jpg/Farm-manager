import { useState } from "react";
import { jsonAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";

type PaygoCtl = Record<string, unknown>;

export function BusinessModelMemosTab(props: { token: string | null; paygoCtl: PaygoCtl | null }) {
  const { token, paygoCtl } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stakeholder, setStakeholder] = useState<"investor" | "lender">("investor");

  const downloadPaygoPdf = async () => {
    if (!token || !paygoCtl) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/api/business-model/investor-pdf`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ ctl: paygoCtl, stakeholderType: stakeholder }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? "PDF request failed");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = stakeholder === "lender" ? "cleva-lender-memorandum.pdf" : "cleva-investor-memorandum.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {/* PAYGO investor / lender PDF */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">PAYGO Investment / Credit Memorandum</h2>
          <p className="mt-1 text-sm text-neutral-600">
            A full 10-section report-grade PDF generated from the current PAYGO scenario. Includes executive summary,
            capital stack analysis, revenue and growth charts, monthly projection table (30 months), scenario comparison,
            KPI interpretation with risk notes, assumptions methodology, and formula appendix.
          </p>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900">
          <strong>What's in the PDF?</strong>
          <ul className="mt-1 list-disc pl-4 space-y-0.5">
            <li>Cover page with company branding and run date</li>
            <li>Table of contents with page references</li>
            <li>Executive summary — all KPIs in a visual grid</li>
            <li>Capital stack breakdown (equity vs debt split)</li>
            <li>Revenue & growth charts (collections, EBITDA, NI)</li>
            <li>Cash flow & debt service charts with DSCR covenant line</li>
            <li>Unit economics — gross contract, contribution, breakeven</li>
            <li>Monthly projection table (all columns, first 30 months)</li>
            <li>Scenario lever comparison table</li>
            <li>Per-KPI interpretation, risk notes and recommendations</li>
            <li>Assumptions & methodology section</li>
            <li>Formula appendix with full derivations</li>
          </ul>
        </div>

        {!paygoCtl ? (
          <p className="text-xs text-neutral-500">
            Run the PAYGO model from the PAYGO workspace tab first to populate the data.
          </p>
        ) : null}

        <label className="block text-xs font-medium text-neutral-700">
          Memorandum tone
          <select
            className="mt-1 w-full max-w-xs rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
            value={stakeholder}
            onChange={(e) => setStakeholder(e.target.value as "investor" | "lender")}
          >
            <option value="investor">Investor / equity (IRR, NPV, returns focus)</option>
            <option value="lender">Lender / creditor (DSCR, coverage, facility focus)</option>
          </select>
        </label>

        <button
          type="button"
          disabled={busy || !paygoCtl}
          onClick={() => void downloadPaygoPdf()}
          className="rounded-lg bg-violet-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-900 disabled:opacity-50"
        >
          {busy ? "Generating PDF…" : "Download PAYGO memorandum PDF"}
        </button>
      </div>

      {/* Broiler PDF */}
      <BroilerPdfPanel token={token} />
    </div>
  );
}

function BroilerPdfPanel({ token }: { token: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [farmName, setFarmName] = useState("ClevaCredit Broiler Farm");
  const [cycleId, setCycleId] = useState("flock-1");

  const downloadBroilerPdf = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/api/business-model/broiler-pdf`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ farmName, cycleId }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? "PDF request failed");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "broiler-batch-report.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm space-y-4">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Broiler Batch Performance Report</h2>
        <p className="mt-1 text-sm text-neutral-600">
          A detailed 6-section broiler performance PDF. Uses default model inputs and generates charts, cost breakdown,
          weekly mortality profile, and insight recommendations.
        </p>
      </div>

      <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-xs text-amber-900">
        <strong>What's in this report?</strong>
        <ul className="mt-1 list-disc pl-4 space-y-0.5">
          <li>Cover with batch snapshot KPI grid</li>
          <li>Batch economics — revenue, gross/net profit, ROI</li>
          <li>Cost breakdown table with visual bars per line item</li>
          <li>Cost benchmarks vs industry norms</li>
          <li>Weekly mortality profile with reference thresholds</li>
          <li>Daily birds + cumulative cost/revenue trajectory chart</li>
          <li>Vet status and compliance score</li>
          <li>Key insights and recommendations (auto-generated)</li>
          <li>Assumptions and formula appendix</li>
        </ul>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-neutral-700">
          Farm / operation name
          <input
            type="text"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
            value={farmName}
            onChange={(e) => setFarmName(e.target.value)}
          />
        </label>
        <label className="block text-xs font-medium text-neutral-700">
          Cycle ID (for compliance data)
          <input
            type="text"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
            value={cycleId}
            onChange={(e) => setCycleId(e.target.value)}
            placeholder="flock-1"
          />
        </label>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void downloadBroilerPdf()}
        className="rounded-lg bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50"
      >
        {busy ? "Generating PDF…" : "Download broiler batch report PDF"}
      </button>
    </div>
  );
}
