import { useState } from "react";
import { jsonAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";

type PaygoCtl = Record<string, unknown>;

export function BusinessModelMemosTab(props: { token: string | null; paygoCtl: PaygoCtl | null }) {
  const { token, paygoCtl } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stakeholder, setStakeholder] = useState<"investor" | "lender">("investor");

  const downloadPdf = async () => {
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
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-4">
      <p className="text-sm text-neutral-600">
        Server-side PDF (PDFKit) summarises the current PAYGO run: executive metrics, capital stack, and simple charts.
        Aligns with the Streamlit investor/lender memoranda flow — without ReportLab/matplotlib.
      </p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <label className="block text-xs font-medium text-neutral-700">
        Memorandum tone
        <select
          className="mt-1 w-full max-w-xs rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
          value={stakeholder}
          onChange={(e) => setStakeholder(e.target.value as "investor" | "lender")}
        >
          <option value="investor">Investor (equity)</option>
          <option value="lender">Lender / creditor</option>
        </select>
      </label>
      <button
        type="button"
        disabled={busy || !paygoCtl}
        onClick={() => void downloadPdf()}
        className="rounded-lg bg-violet-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Generating…" : "Download memorandum PDF"}
      </button>
      {!paygoCtl ? <p className="text-xs text-neutral-500">Load PAYGO defaults from the PAYGO workspace tab first.</p> : null}
    </div>
  );
}
