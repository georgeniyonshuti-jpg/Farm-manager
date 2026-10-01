import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { canFlockAction, canOptInPipelineFlock } from "../../auth/permissions";
import { API_BASE_URL } from "../../api/config";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { SectionCard } from "../../components/ui/SectionCard";
import { Button } from "../../components/ui/Button";
import { DataTable, type DataColumn } from "../../components/ui/DataTable";
import { useToast } from "../../components/Toast";
import { useReferenceOptions } from "../../hooks/useReferenceOptions";
import { syncSlaughterSaleToERPNext } from "../../api/erpnext.api";
import { getStoredErpnextCompany, getStoredErpnextCostCenter, CLIENT_ERPNEXT_ENTITY_SYNC } from "../../lib/erpnextPrefs";
import { useERPNextConnection } from "../../context/ERPNextConnectionContext";
import { useFarmCapabilities } from "../../hooks/useFarmCapabilities";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useErpnextSyncBySource } from "../../hooks/useErpnextSyncBySource";
import { ERPNextSyncBadge } from "../../components/accounting/ERPNextSyncBadge";
import { SegmentedControl, Metric, Modal, Field, Input, Select, PageTabs, TableToolbar, FacetFilter } from "../../components/ui";
import { DistrictSelect } from "../../components/DistrictSelect";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { formatManagerDateTime } from "../../lib/formatManagerDateTime";
import {
  fetchFlockPipelineLot,
  optInFlockToPipeline,
  type PipelineLot,
} from "../../api/pipeline.api";

type Flock = { id: string; label: string; birdsLiveEstimate?: number | null };
type Slaughter = {
  id: string;
  at: string;
  reasonCode?: string;
  birdsSlaughtered: number;
  avgLiveWeightKg: number;
  avgCarcassWeightKg: number | null;
  notes: string;
  accountingStatus?: string | null;
};
type PerformanceSummary = {
  feedToDateKg: number;
  birdsLiveEstimate: number;
  mortalityToDate: number;
  fcr: number | null;
};
type Eligibility = {
  eligibleForSlaughter: boolean;
  blockers: Array<{ type: string; medicineName?: string; safeAfter?: string; plannedFor?: string }>;
};
type MeatSale = {
  id: string;
  flockId: string;
  flockCode?: string | null;
  orderDate: string;
  numberOfBirds: number;
  totalWeightKg: number;
  pricePerKg: number;
  buyerName: string | null;
  submissionStatus?: string;
};
const FALLBACK_SLAUGHTER_REASONS = [
  { value: "planned_market", label: "Planned market harvest" },
  { value: "target_weight_reached", label: "Target weight reached" },
  { value: "emergency_cull", label: "Emergency cull" },
  { value: "partial_harvest", label: "Partial harvest" },
  { value: "other", label: "Other" },
];

function slaughterReasonLabel(row: Slaughter, reasons: { value: string; label: string }[]): string {
  const source = row.reasonCode ?? row.notes;
  return reasons.find((r) => r.value === source)?.label ?? row.notes;
}

export function FarmSlaughterPage() {
  const { token, user } = useAuth();
  const { status: erpnextStatus } = useERPNextConnection();
  const { erpnextAccess } = useFarmCapabilities();
  const { companyHref } = useCompanyNav();
  const { bySource } = useErpnextSyncBySource(user?.erpnextAccess || erpnextAccess ? token : null);
  const slaughterReasonOptions = useReferenceOptions("slaughter_reason", token, FALLBACK_SLAUGHTER_REASONS);
  const { showToast } = useToast();
  const canRecordSlaughter = canFlockAction(user, "slaughter.record");
  const canOptIn = canOptInPipelineFlock(user);
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [flockId, setFlockId] = useState("");
  const [rows, setRows] = useState<Slaughter[]>([]);
  const [summary, setSummary] = useState<PerformanceSummary | null>(null);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pipelineLot, setPipelineLot] = useState<PipelineLot | null>(null);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [optInOpen, setOptInOpen] = useState(false);
  const [optInForm, setOptInForm] = useState({
    district: "",
    askPricePerKg: "",
    contactPhone: "",
    farmerCanSlaughter: false,
    deliveryAvailable: false,
    minOrderBirds: "",
  });
  const [form, setForm] = useState({
    reasonCode: "planned_market",
    birdsSlaughtered: "",
    avgLiveWeightKg: "",
    avgCarcassWeightKg: "",
    pricePerKgRwf: "",
    fairValueRwf: "",
    notes: "",
  });
  const [showRecordSlaughter, setShowRecordSlaughter] = useState(false);
  const [showRecordSale, setShowRecordSale] = useState(false);
  const [hubTab, setHubTab] = useState<"slaughter" | "sales">("slaughter");
  const [datePreset, setDatePreset] = useState<"7d" | "30d" | "cycle" | "custom">("custom");
  const [sales, setSales] = useState<MeatSale[]>([]);
  const [saleBusy, setSaleBusy] = useState(false);
  const [saleForm, setSaleForm] = useState({
    flockId: "",
    orderDate: new Date().toISOString().slice(0, 10),
    numberOfBirds: "",
    totalWeightKg: "",
    pricePerKg: "",
    buyerName: "",
  });

  const mgrInput = "!min-h-10 h-10 box-border py-0 text-sm leading-10";

  const applyDatePreset = useCallback((value: "7d" | "30d" | "cycle") => {
    setDatePreset(value);
    if (value === "7d") {
      const end = new Date();
      const start = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
      setStartAt(start.toISOString().slice(0, 10));
      setEndAt(end.toISOString().slice(0, 10));
      return;
    }
    if (value === "30d") {
      const end = new Date();
      const start = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
      setStartAt(start.toISOString().slice(0, 10));
      setEndAt(end.toISOString().slice(0, 10));
      return;
    }
    setStartAt("");
    setEndAt(new Date().toISOString().slice(0, 10));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fr = await fetch(`${API_BASE_URL}/api/flocks`, { headers: readAuthHeaders(token) });
      const fd = await fr.json();
      if (!fr.ok) throw new Error(fd.error ?? "Failed to load flocks");
      // Attach live estimates from performance summaries loaded lazily on demand.
      const f = (fd.flocks as Flock[]) ?? [];
      setFlocks(f);
      const selected = flockId;
      const q = new URLSearchParams();
      if (startAt) q.set("start_at", `${startAt}T00:00:00.000Z`);
      if (endAt) q.set("end_at", `${endAt}T23:59:59.999Z`);
      if (!selected) {
        if (f.length === 0) {
          setRows([]);
          setSummary(null);
          setEligibility(null);
          return;
        }
        const slaughterResults = await Promise.all(
          f.map((fl) =>
            fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(fl.id)}/slaughter-events?${q.toString()}`, {
              headers: readAuthHeaders(token),
            }).then(async (sr) => {
              const sd = await sr.json();
              if (!sr.ok) throw new Error((sd as { error?: string }).error ?? "Failed to load slaughter events");
              return (sd as { slaughterEvents?: Slaughter[] }).slaughterEvents ?? [];
            })
          )
        );
        setRows(
          slaughterResults
            .flat()
            .sort((a, b) => (a.at < b.at ? 1 : -1))
        );
        setSummary(null);
        setEligibility(null);
        return;
      }

      const [sr, pr, er] = await Promise.all([
        fetch(`${API_BASE_URL}/api/flocks/${selected}/slaughter-events?${q.toString()}`, { headers: readAuthHeaders(token) }),
        fetch(`${API_BASE_URL}/api/flocks/${selected}/performance-summary`, { headers: readAuthHeaders(token) }),
        fetch(`${API_BASE_URL}/api/flocks/${selected}/eligibility`, { headers: readAuthHeaders(token) }),
      ]);
      const sd = await sr.json();
      const pd = await pr.json();
      const ed = await er.json().catch(() => ({ eligibleForSlaughter: true, blockers: [] }));
      if (!sr.ok) throw new Error(sd.error ?? "Failed to load slaughter events");
      if (!pr.ok) throw new Error(pd.error ?? "Failed to load summary");
      setRows((sd.slaughterEvents as Slaughter[]) ?? []);
      const perf = pd as PerformanceSummary;
      setSummary(perf);
      setEligibility(ed as Eligibility);
      setFlocks((prev) =>
        prev.map((fl) =>
          fl.id === selected ? { ...fl, birdsLiveEstimate: perf.birdsLiveEstimate } : fl
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token, flockId, startAt, endAt]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadSales = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`${API_BASE_URL}/api/farm-sales/sales-orders`, {
        headers: readAuthHeaders(token),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return;
      setSales(Array.isArray((d as { orders?: MeatSale[] }).orders) ? (d as { orders: MeatSale[] }).orders : []);
    } catch {
      setSales([]);
    }
  }, [token]);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  useEffect(() => {
    if (!token || !flockId || !canOptIn) {
      setPipelineLot(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchFlockPipelineLot(token, flockId);
        if (!cancelled) setPipelineLot(r.lot);
      } catch {
        if (!cancelled) setPipelineLot(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, flockId, canOptIn]);

  async function submitPipelineOptIn() {
    if (!token || !flockId) return;
    if (!optInForm.district.trim()) {
      showToast("error", "District is required to list the lot on the pipeline desk.");
      return;
    }
    setPipelineBusy(true);
    try {
      const r = await optInFlockToPipeline(token, {
        flockId,
        district: optInForm.district.trim(),
        askPricePerKg: optInForm.askPricePerKg ? Number(optInForm.askPricePerKg) : null,
        contactPhone: optInForm.contactPhone || null,
        farmerCanSlaughter: optInForm.farmerCanSlaughter,
        deliveryAvailable: optInForm.deliveryAvailable,
        minOrderBirds: optInForm.minOrderBirds ? Number(optInForm.minOrderBirds) : null,
      });
      setPipelineLot(r.lot);
      setOptInOpen(false);
      showToast("success", "Flock opted into supply pipeline");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Opt-in failed");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function submitSale(e: React.FormEvent) {
    e.preventDefault();
    if (!canRecordSlaughter) {
      showToast("error", "Only vet manager or manager can record meat sales.");
      return;
    }
    const flockIdValue = saleForm.flockId || flockId;
    if (!flockIdValue) {
      showToast("error", "Select a flock for the sale.");
      return;
    }
    setSaleBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/farm-sales/sales-orders`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          flockId: flockIdValue,
          orderDate: saleForm.orderDate,
          numberOfBirds: Number(saleForm.numberOfBirds),
          totalWeightKg: Number(saleForm.totalWeightKg),
          pricePerKg: Number(saleForm.pricePerKg),
          buyerName: saleForm.buyerName.trim() || undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Could not save sale");
      showToast("success", "Meat sale recorded.");
      setSaleForm((v) => ({
        ...v,
        numberOfBirds: "",
        totalWeightKg: "",
        pricePerKg: "",
        buyerName: "",
      }));
      setShowRecordSale(false);
      await loadSales();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Could not save sale");
    } finally {
      setSaleBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!flockId) return;
    if (!canRecordSlaughter) {
      showToast("error", "You can view slaughter data, but only vet manager or manager can save events.");
      return;
    }
    if (eligibility && !eligibility.eligibleForSlaughter) {
      showToast("error", "Cannot record slaughter while withdrawal/missed-round blockers are active.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/flocks/${flockId}/slaughter-events`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          ...form,
          reasonCode: form.reasonCode,
          birdsSlaughtered: Number(form.birdsSlaughtered),
          avgLiveWeightKg: Number(form.avgLiveWeightKg),
          avgCarcassWeightKg: form.avgCarcassWeightKg ? Number(form.avgCarcassWeightKg) : null,
          pricePerKgRwf: form.pricePerKgRwf ? Number(form.pricePerKgRwf) : null,
          fairValueRwf: form.fairValueRwf ? Number(form.fairValueRwf) : null,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const payload = d as { error?: string; activeMedicines?: Array<{ medicineName?: string }> };
        if (Array.isArray(payload.activeMedicines) && payload.activeMedicines.length > 0) {
          const names = payload.activeMedicines
            .map((x) => x.medicineName)
            .filter((x): x is string => Boolean(x))
            .join(", ");
          throw new Error(`${payload.error ?? "Save failed"} Active: ${names}`);
        }
        throw new Error(payload.error ?? "Save failed");
      }
      const savedData = d as { birdsLive?: number | null; performance?: { birdsLiveEstimate?: number } };
      const updatedLive = savedData.birdsLive ?? savedData.performance?.birdsLiveEstimate ?? null;
      const liveMsg = updatedLive != null ? ` ${updatedLive} birds remaining in flock.` : "";
      const birds = Number(form.birdsSlaughtered) || 0;
      const liveKg = Number(form.avgLiveWeightKg) || 0;
      const carcassKg = Number(form.avgCarcassWeightKg) || liveKg;
      const priceKg = Number(form.pricePerKgRwf) || 0;
      const totalWeight = birds * carcassKg;
      const totalAmount = Number(form.fairValueRwf) || totalWeight * priceKg;
      const erpCompany = getStoredErpnextCompany() || erpnextStatus?.company;
      if (
        erpnextAccess &&
        CLIENT_ERPNEXT_ENTITY_SYNC &&
        erpnextStatus?.connected &&
        erpCompany &&
        token &&
        totalAmount > 0
      ) {
        try {
          await syncSlaughterSaleToERPNext(token, {
            company: erpCompany,
            customer: "Farm Customer",
            date: new Date().toISOString().slice(0, 10),
            flockId,
            weightKg: totalWeight,
            pricePerKg: priceKg,
            totalAmount,
            costCenter: getStoredErpnextCostCenter() || undefined,
          });
          showToast("success", `Slaughter recorded.${liveMsg} Synced to ERPNext.`);
        } catch (syncErr) {
          console.error("ERPNext slaughter sync failed:", syncErr);
          showToast("success", `Slaughter recorded.${liveMsg} ERPNext sync pending.`);
        }
      } else {
        showToast("success", `Slaughter recorded.${liveMsg} Synced to ERPNext.`);
      }
      setForm((v) => ({ ...v, birdsSlaughtered: "", avgLiveWeightKg: "", avgCarcassWeightKg: "", pricePerKgRwf: "", fairValueRwf: "", notes: "" }));
      setShowRecordSlaughter(false);
      await load();
    } catch (e) {
      const d = e instanceof Error ? e.message : "Save failed";
      showToast("error", d);
    } finally {
      setBusy(false);
    }
  }

  const slaughterColumns = useMemo((): DataColumn<Slaughter>[] => {
    const cols: DataColumn<Slaughter>[] = [
      {
        key: "at",
        header: "Date / Time",
        render: (r) => <span title={r.at}>{formatManagerDateTime(r.at)}</span>,
      },
      { key: "reason", header: "Reason", render: (r) => slaughterReasonLabel(r, slaughterReasonOptions) },
      { key: "birds", header: "Birds slaughtered", numeric: true, render: (r) => <span className="font-semibold">{r.birdsSlaughtered}</span> },
      { key: "live", header: "Avg live wt (kg)", numeric: true, render: (r) => r.avgLiveWeightKg },
      { key: "carcass", header: "Avg carcass wt (kg)", numeric: true, render: (r) => (r.avgCarcassWeightKg != null ? r.avgCarcassWeightKg : "—") },
      { key: "notes", header: "Notes", render: (r) => <span className="block max-w-[14rem] truncate">{r.notes || "—"}</span> },
    ];
    if (user?.erpnextAccess || erpnextAccess) {
      cols.push({
        key: "erpnext",
        header: "ERPNext",
        badge: true,
        render: (r) => {
          const hint = bySource.get(r.id);
          if (!hint) return null;
          return (
            <ERPNextSyncBadge
              state={hint.state}
              reference={hint.reference}
              compact
              href={companyHref(`farm/erpnext-setup?q=${encodeURIComponent(r.id)}`)}
            />
          );
        },
      });
    }
    return cols;
  }, [slaughterReasonOptions, user?.erpnextAccess, erpnextAccess, bySource, companyHref]);

  const saleColumns = useMemo(
    (): DataColumn<MeatSale>[] => [
      {
        key: "date",
        header: "Date",
        render: (r) => String(r.orderDate).slice(0, 10),
      },
      {
        key: "flock",
        header: "Flock",
        render: (r) => r.flockCode ?? r.flockId.slice(0, 8),
      },
      {
        key: "birds",
        header: "Birds",
        numeric: true,
        render: (r) => r.numberOfBirds,
      },
      {
        key: "weight",
        header: "Weight (kg)",
        numeric: true,
        render: (r) => Number(r.totalWeightKg).toFixed(1),
      },
      {
        key: "price",
        header: "Price/kg",
        numeric: true,
        render: (r) => `${Number(r.pricePerKg).toLocaleString()} RWF`,
      },
      {
        key: "buyer",
        header: "Buyer",
        render: (r) => r.buyerName || "—",
      },
    ],
    []
  );

  return (
    <ManagerPage>
      <PageHeader
        title="Slaughter"
        tabs={
          <PageTabs
            aria-label="Slaughter sections"
            value={hubTab}
            onChange={(v) => setHubTab(v as "slaughter" | "sales")}
            options={[
              { value: "slaughter", label: "Events" },
              { value: "sales", label: "Meat sales" },
            ]}
          />
        }
        primaryAction={
          canRecordSlaughter
            ? hubTab === "sales"
              ? {
                  label: "Record sale",
                  onClick: () => {
                    setSaleForm((v) => ({ ...v, flockId: v.flockId || flockId }));
                    setShowRecordSale(true);
                  },
                }
              : {
                  label: "Record slaughter",
                  onClick: () => setShowRecordSlaughter(true),
                  disabled: eligibility != null && !eligibility.eligibleForSlaughter,
                }
            : undefined
        }
      />
      {loading && <SkeletonList rows={3} />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}
      {!loading && !error ? (
        <>
          {hubTab === "slaughter" ? (
            <>
              {flockId && eligibility && !eligibility.eligibleForSlaughter ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                  <p className="font-semibold">⛔ Slaughter blocked</p>
                  <ul className="mt-2 space-y-1">
                    {eligibility.blockers.map((b, i) => (
                      <li key={`${b.type}-${i}`}>
                        {b.type === "withdrawal"
                          ? `${b.medicineName ?? "Treatment"} withdrawal active until ${b.safeAfter ?? "clearance"}`
                          : `Missed medicine round planned for ${b.plannedFor ?? "unknown date"}`}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {flockId ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Metric label="Feed to date (kg)" value={String(summary?.feedToDateKg ?? 0)} />
                    <Metric label="Live estimate" value={String(summary?.birdsLiveEstimate ?? 0)} />
                    <Metric label="Mortality to date" value={String(summary?.mortalityToDate ?? 0)} />
                    <Metric label="FCR" value={summary?.fcr != null ? summary.fcr.toFixed(2) : "—"} />
                  </div>
                  {canOptIn ? (
                    <SectionCard
                      title="Supply pipeline"
                      controls={
                        pipelineLot ? (
                          <span className="text-xs font-medium text-[var(--status-success)]">
                            Listed · {pipelineLot.status}
                            {pipelineLot.district ? ` · ${pipelineLot.district}` : ""}
                          </span>
                        ) : (
                          <Button type="button" size="sm" onClick={() => setOptInOpen(true)}>
                            Opt into pipeline
                          </Button>
                        )
                      }
                    >
                      <p className="text-sm text-[var(--text-secondary)]">
                        {pipelineLot
                          ? "This flock is visible on the Cleva pipeline desk for matching to buyers."
                          : "Opt in when you want Cleva to find a buyer before harvest. Flock data stays private until then."}
                      </p>
                    </SectionCard>
                  ) : null}
                  <p className="text-xs text-[var(--text-secondary)]">
                    This screen focuses on harvest-oriented metrics. For full-cycle broiler FCR (feed ÷ flock weight gained),
                    open the{" "}
                    <Link
                      className="font-medium text-[var(--primary-color-dark)] underline"
                      to={`/farm/vet-logs?flockId=${encodeURIComponent(flockId)}`}
                    >
                      vet logs & flock FCR
                    </Link>{" "}
                    for this flock.
                  </p>
                </>
              ) : null}

              {!canRecordSlaughter ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                  View-only: only vet manager, manager, or superuser can save slaughter events.
                </div>
              ) : null}

              <div className="table-block">
                <DataTable<Slaughter>
                  flush
                  columns={slaughterColumns}
                  rows={rows}
                  rowKey={(r) => r.id}
                  isFiltered={Boolean(flockId) || Boolean(startAt) || Boolean(endAt)}
                  emptyTitle="No slaughter records yet"
                  emptyDescription="Slaughter events for the selected flock and date range will appear here once recorded."
                  emptyAction={
                    canRecordSlaughter ? (
                      <Button size="sm" onClick={() => setShowRecordSlaughter(true)}>
                        Record slaughter
                      </Button>
                    ) : undefined
                  }
                  toolbar={
                    <TableToolbar
                      filters={
                        <>
                          <FacetFilter
                            label="Flock"
                            value={flockId || "all"}
                            allValue="all"
                            allLabel="All flocks"
                            onChange={(v) => setFlockId(v === "all" ? "" : v)}
                            options={flocks.map((f) => ({ value: f.id, label: f.label }))}
                          />
                          <SegmentedControl
                            size="sm"
                            value={datePreset === "custom" ? "" : datePreset}
                            onChange={(v) => {
                              if (v === "7d" || v === "30d" || v === "cycle") applyDatePreset(v);
                            }}
                            options={[
                              { value: "7d", label: "Last 7d" },
                              { value: "30d", label: "Last 30d" },
                              { value: "cycle", label: "Cycle to date" },
                            ]}
                          />
                          <input
                            className="h-control-sm rounded-control border border-[var(--border-input)] bg-[var(--surface-input)] px-2 text-xs text-[var(--text-primary)]"
                            type="date"
                            value={startAt}
                            onChange={(e) => {
                              setDatePreset("custom");
                              setStartAt(e.target.value);
                            }}
                            aria-label="Start date"
                          />
                          <input
                            className="h-control-sm rounded-control border border-[var(--border-input)] bg-[var(--surface-input)] px-2 text-xs text-[var(--text-primary)]"
                            type="date"
                            value={endAt}
                            onChange={(e) => {
                              setDatePreset("custom");
                              setEndAt(e.target.value);
                            }}
                            aria-label="End date"
                          />
                        </>
                      }
                      meta={`${rows.length} record${rows.length === 1 ? "" : "s"}`}
                      actions={
                        <>
                          <a
                            className="inline-flex h-control-sm items-center rounded-control px-2.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--status-neutral-soft)] hover:text-[var(--text-primary)]"
                            href={`${API_BASE_URL}/api/reports/slaughter.csv?flock_id=${encodeURIComponent(flockId)}${startAt ? `&start_at=${encodeURIComponent(`${startAt}T00:00:00.000Z`)}` : ""}${endAt ? `&end_at=${encodeURIComponent(`${endAt}T23:59:59.999Z`)}` : ""}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Slaughter CSV
                          </a>
                          <a
                            className="inline-flex h-control-sm items-center rounded-control px-2.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--status-neutral-soft)] hover:text-[var(--text-primary)]"
                            href={`${API_BASE_URL}/api/reports/flock-performance.csv?flock_id=${encodeURIComponent(flockId)}${endAt ? `&end_at=${encodeURIComponent(`${endAt}T23:59:59.999Z`)}` : ""}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Performance CSV
                          </a>
                        </>
                      }
                    />
                  }
                />
              </div>
            </>
          ) : (
            <div className="table-block">
              <DataTable<MeatSale>
                flush
                columns={saleColumns}
                rows={sales}
                rowKey={(r) => r.id}
                emptyTitle="No meat sales yet"
                emptyDescription="Record a sale when birds go to market."
                emptyAction={
                  canRecordSlaughter ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setSaleForm((v) => ({ ...v, flockId: v.flockId || flockId }));
                        setShowRecordSale(true);
                      }}
                    >
                      Record sale
                    </Button>
                  ) : undefined
                }
                toolbar={
                  <TableToolbar meta={`${sales.length} sale${sales.length === 1 ? "" : "s"}`} />
                }
              />
            </div>
          )}
          {canRecordSlaughter ? (
            <Modal
              open={showRecordSale}
              title="Record sale"
              onClose={() => setShowRecordSale(false)}
              footer={
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setShowRecordSale(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={saleBusy}
                    disabled={saleBusy}
                    onClick={() => {
                      const form = document.getElementById("record-sale-form") as HTMLFormElement | null;
                      form?.requestSubmit();
                    }}
                  >
                    Save sale
                  </Button>
                </div>
              }
            >
              <form id="record-sale-form" onSubmit={submitSale} className="space-y-3">
                <Field label="Flock">
                  <Select
                    className={mgrInput}
                    value={saleForm.flockId || flockId}
                    onChange={(e) => setSaleForm((v) => ({ ...v, flockId: e.target.value }))}
                    required
                  >
                    <option value="">Select flock…</option>
                    {flocks.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Date">
                  <Input
                    type="date"
                    className={mgrInput}
                    value={saleForm.orderDate}
                    onChange={(e) => setSaleForm((v) => ({ ...v, orderDate: e.target.value }))}
                    required
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Birds" className="min-w-0">
                    <Input
                      className={`${mgrInput} w-full min-w-0`}
                      inputMode="numeric"
                      value={saleForm.numberOfBirds}
                      onChange={(e) => setSaleForm((v) => ({ ...v, numberOfBirds: e.target.value }))}
                      required
                    />
                  </Field>
                  <Field label="Weight (kg)" className="min-w-0">
                    <Input
                      className={`${mgrInput} w-full min-w-0`}
                      inputMode="decimal"
                      value={saleForm.totalWeightKg}
                      onChange={(e) => setSaleForm((v) => ({ ...v, totalWeightKg: e.target.value }))}
                      required
                    />
                  </Field>
                </div>
                <Field label="Price per kg (RWF)">
                  <Input
                    className={mgrInput}
                    inputMode="decimal"
                    value={saleForm.pricePerKg}
                    onChange={(e) => setSaleForm((v) => ({ ...v, pricePerKg: e.target.value }))}
                    required
                  />
                </Field>
                <Field label="Buyer" help="Optional">
                  <Input
                    className={mgrInput}
                    value={saleForm.buyerName}
                    onChange={(e) => setSaleForm((v) => ({ ...v, buyerName: e.target.value }))}
                  />
                </Field>
              </form>
            </Modal>
          ) : null}

          {canRecordSlaughter ? (
            <Modal
              open={showRecordSlaughter}
              title="Record slaughter"
              onClose={() => setShowRecordSlaughter(false)}
              wide
            >
                <form onSubmit={submit} className="space-y-3">
                    {(() => {
                      const selectedFlock = flocks.find((f) => f.id === flockId);
                      const live = selectedFlock?.birdsLiveEstimate ?? summary?.birdsLiveEstimate ?? null;
                      return (
                        <p className="text-xs text-neutral-500">
                          Flock: <strong className="text-neutral-800">{selectedFlock?.label ?? flockId}</strong>
                          {live != null ? <> · <strong className="text-emerald-700">{live}</strong> birds estimated live</> : null}
                        </p>
                      );
                    })()}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select className="rounded-lg border border-neutral-300 px-3 py-2" value={form.reasonCode} onChange={(e) => setForm((v) => ({ ...v, reasonCode: e.target.value }))}>
                        {slaughterReasonOptions.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Birds slaughtered *" inputMode="numeric" value={form.birdsSlaughtered} onChange={(e) => setForm((v) => ({ ...v, birdsSlaughtered: e.target.value }))} required />
                      <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Avg live weight per bird (kg) *" inputMode="decimal" value={form.avgLiveWeightKg} onChange={(e) => setForm((v) => ({ ...v, avgLiveWeightKg: e.target.value }))} required />
                      <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Avg carcass weight per bird (kg, optional)" inputMode="decimal" value={form.avgCarcassWeightKg} onChange={(e) => setForm((v) => ({ ...v, avgCarcassWeightKg: e.target.value }))} />
                      <div>
                        <input className="w-full rounded-lg border border-neutral-300 px-3 py-2" placeholder="Market price per kg (RWF)" inputMode="decimal" value={form.pricePerKgRwf} onChange={(e) => setForm((v) => ({ ...v, pricePerKgRwf: e.target.value }))} />
                        {form.pricePerKgRwf && form.birdsSlaughtered && form.avgCarcassWeightKg ? (
                          <p className="mt-1 text-xs text-neutral-500">
                            Est. fair value: <strong>{(Number(form.pricePerKgRwf) * Number(form.birdsSlaughtered) * Number(form.avgCarcassWeightKg)).toLocaleString()}</strong> RWF
                          </p>
                        ) : form.pricePerKgRwf && form.birdsSlaughtered && form.avgLiveWeightKg ? (
                          <p className="mt-1 text-xs text-neutral-500">
                            Est. fair value: <strong>{(Number(form.pricePerKgRwf) * Number(form.birdsSlaughtered) * Number(form.avgLiveWeightKg)).toLocaleString()}</strong> RWF (using live weight)
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <input className="w-full rounded-lg border border-neutral-300 px-3 py-2" placeholder="Total fair value (RWF, override)" inputMode="decimal" value={form.fairValueRwf} onChange={(e) => setForm((v) => ({ ...v, fairValueRwf: e.target.value }))} />
                        <p className="mt-1 text-xs text-neutral-400">Enter price/kg or total fair value so fair value is recorded for ERPNext sync.</p>
                      </div>
                    </div>
                    <textarea className="w-full rounded-lg border border-neutral-300 px-3 py-2" rows={2} placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} />
                    <div className="flex justify-end">
                      <Button variant="primary" size="sm" type="submit" disabled={busy || (eligibility != null && !eligibility.eligibleForSlaughter)} loading={busy}>Save slaughter</Button>
                    </div>
                </form>
            </Modal>
          ) : null}
        </>
      ) : null}

      <Modal
        open={optInOpen}
        onClose={() => setOptInOpen(false)}
        title="Opt flock into supply pipeline"
        footer={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOptInOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pipelineBusy || !optInForm.district.trim()}
              onClick={() => void submitPipelineOptIn()}
            >
              {pipelineBusy ? "Saving…" : "List on pipeline desk"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">
            Bird count, weights, and ready window are pulled from this flock. Add commercial fields for the desk.
          </p>
          <DistrictSelect
            value={optInForm.district}
            onChange={(district) => setOptInForm((f) => ({ ...f, district }))}
          />
          <Field label="Ask RWF/kg">
            <input
              type="number"
              min={0}
              className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-2 text-sm"
              value={optInForm.askPricePerKg}
              onChange={(e) => setOptInForm((f) => ({ ...f, askPricePerKg: e.target.value }))}
            />
          </Field>
          <Field label="Contact phone">
            <input
              className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-2 text-sm"
              value={optInForm.contactPhone}
              onChange={(e) => setOptInForm((f) => ({ ...f, contactPhone: e.target.value }))}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={optInForm.farmerCanSlaughter}
              onChange={(e) => setOptInForm((f) => ({ ...f, farmerCanSlaughter: e.target.checked }))}
            />
            Can slaughter
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={optInForm.deliveryAvailable}
              onChange={(e) => setOptInForm((f) => ({ ...f, deliveryAvailable: e.target.checked }))}
            />
            Can deliver (farm)
          </label>
          <p className="text-xs text-[var(--text-muted)]">
            Unchecked slaughter = live only. Delivery means the farm brings birds for a trip fee.
          </p>
          <Field label="Min order (birds)">
            <input
              className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-2 text-sm"
              type="number"
              min={1}
              placeholder="10"
              value={optInForm.minOrderBirds}
              onChange={(e) => setOptInForm((f) => ({ ...f, minOrderBirds: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>
    </ManagerPage>
  );
}
