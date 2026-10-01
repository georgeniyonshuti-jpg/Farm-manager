import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { FarmTreatmentFieldView } from "./FarmTreatmentFieldView";
import { readAuthHeaders, jsonAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { SectionCard } from "../../components/ui/SectionCard";
import { Button } from "../../components/ui/Button";
import { TextLink } from "../../components/ui/TextLink";
import { useToast } from "../../components/Toast";
import { useReferenceOptions } from "../../hooks/useReferenceOptions";
import { syncTreatmentToERPNext } from "../../api/erpnext.api";
import { DataTable, Modal, PageTabs, StatusPill, TableToolbar, FacetFilter } from "../../components/ui";
import { ERPNextSyncBadge } from "../../components/accounting/ERPNextSyncBadge";
import { ManagerPage } from "../../components/layout/ManagerPage";
import {
  getStoredErpnextCompany,
  getStoredErpnextCostCenter,
  CLIENT_ERPNEXT_ENTITY_SYNC,
} from "../../lib/erpnextPrefs";
import { useFarmCapabilities } from "../../hooks/useFarmCapabilities";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useErpnextSyncBySource } from "../../hooks/useErpnextSyncBySource";

type Flock = { id: string; label: string; code?: string | null; initialCount?: number };
type Medicine = {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  withdrawalDays: number;
  lowStockThreshold: number;
};
type Treatment = {
  id: string;
  at: string;
  reasonCode?: string;
  diseaseOrReason: string;
  medicineName: string;
  dose: number;
  doseUnit: string;
  route: string;
  durationDays: number;
  withdrawalDays: number;
  notes: string;
};
type Round = {
  id: string;
  flockId: string;
  medicineId: string;
  medicineName: string;
  plannedFor: string;
  route: string;
  plannedQuantity: number;
  status: "planned" | "in_progress" | "completed" | "missed" | "cancelled";
  assignedToUserId?: string | null;
};
type OverdueRound = Round & { overdueMinutes: number };
type ForecastRow = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  lowStockThreshold: number;
  totalUsedInWindow: number;
  avgDailyUse: number;
  daysOfCover: number | null;
  stockoutRisk7d: boolean;
};

const TREATMENT_REASON_OPTIONS = [
  { value: "routine_prevention", label: "Routine prevention" },
  { value: "suspected_infection", label: "Suspected infection" },
  { value: "confirmed_infection", label: "Confirmed infection" },
  { value: "vet_directive", label: "Vet directive" },
  { value: "other", label: "Other" },
];

const ROUTE_OPTIONS = ["oral", "injection", "waterline", "spray", "other"];
const DOSE_UNIT_OPTIONS = ["ml", "g", "mg", "tablet", "drop", "other"];

/** Must match `medicine_inventory.unit` CHECK in database migrations. */
const MED_STOCK_UNITS = ["ml", "g", "doses", "sachets"] as const;

const FALLBACK_ROUTE_OPTIONS = ROUTE_OPTIONS.map((r) => ({ value: r, label: r }));
const FALLBACK_DOSE_UNITS = DOSE_UNIT_OPTIONS.map((r) => ({ value: r, label: r }));
const FALLBACK_MED_STOCK = MED_STOCK_UNITS.map((r) => ({ value: r, label: r }));
const FALLBACK_MED_CATEGORIES = [
  { value: "vaccine", label: "vaccine" },
  { value: "antibiotic", label: "antibiotic" },
  { value: "coccidiostat", label: "coccidiostat" },
  { value: "vitamin", label: "vitamin" },
  { value: "electrolyte", label: "electrolyte" },
  { value: "other", label: "other" },
];
const FALLBACK_ADMIN_ROUTES = [
  { value: "drinking_water", label: "drinking water" },
  { value: "feed_additive", label: "feed additive" },
  { value: "injection", label: "injection" },
  { value: "topical", label: "topical" },
];

type MedicineLot = {
  id: string | number;
  medicineId: string;
  medicineName: string;
  lotNumber: string | null;
  receivedAt: string;
  expiryDate: string | null;
  quantityReceived: number;
  quantityRemaining: number;
  supplier: string | null;
  unitCostRwf: number | null;
  accountingStatus: string | null;
};

type MedTab = "treatments" | "rounds" | "inventory";

function treatmentReasonLabel(row: Treatment, reasons: { value: string; label: string }[]): string {
  const source = row.reasonCode ?? row.diseaseOrReason;
  return reasons.find((r) => r.value === source)?.label ?? row.diseaseOrReason;
}

export function FarmTreatmentPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  if (user?.role === "vet" && (!tabParam || tabParam === "treatments")) {
    return <FarmTreatmentFieldView />;
  }
  return <FarmTreatmentManagerPage />;
}

function FarmTreatmentManagerPage() {
  const { token, user } = useAuth();
  const { erpnextAccess } = useFarmCapabilities();
  const { companyHref } = useCompanyNav();
  const { bySource } = useErpnextSyncBySource(user?.erpnextAccess || erpnextAccess ? token : null);
  const { showToast } = useToast();
  const treatmentReasonOptions = useReferenceOptions("treatment_reason", token, TREATMENT_REASON_OPTIONS);
  const routeOptions = useReferenceOptions("treatment_route", token, FALLBACK_ROUTE_OPTIONS);
  const doseUnitOptions = useReferenceOptions("treatment_dose_unit", token, FALLBACK_DOSE_UNITS);
  const medStockOptions = useReferenceOptions("medicine_stock_unit", token, FALLBACK_MED_STOCK);
  const medCategoryOptions = useReferenceOptions("medicine_category", token, FALLBACK_MED_CATEGORIES);
  const adminRouteOptions = useReferenceOptions("medicine_admin_route", token, FALLBACK_ADMIN_ROUTES);
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [flockId, setFlockId] = useState("");
  const [rows, setRows] = useState<Treatment[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [overdueRounds, setOverdueRounds] = useState<OverdueRound[]>([]);
  const [forecastRows, setForecastRows] = useState<ForecastRow[]>([]);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    reasonCode: "routine_prevention",
    diseaseOrReason: "",
    medicineName: "",
    dose: "",
    doseUnit: "ml",
    route: "oral",
    durationDays: "1",
    withdrawalDays: "0",
    notes: "",
  });
  const [medForm, setMedForm] = useState({
    name: "",
    category: "vaccine",
    unit: "ml",
    quantity: "",
    withdrawalDays: "0",
    lowStockThreshold: "10",
    supplier: "",
    expiryDate: "",
  });
  const [roundForm, setRoundForm] = useState({
    medicineId: "",
    plannedFor: new Date().toISOString().slice(0, 16),
    route: "drinking_water",
    plannedQuantity: "",
    assignedToUserId: "",
    notes: "",
  });
  const [tab, setTab] = useState<MedTab>("treatments");
  const [showTreatmentForm, setShowTreatmentForm] = useState(false);
  const [showRoundForm, setShowRoundForm] = useState(false);
  const [showMedicineForm, setShowMedicineForm] = useState(false);
  const [showLotForm, setShowLotForm] = useState(false);
  const [lots, setLots] = useState<MedicineLot[]>([]);
  const [lotForm, setLotForm] = useState({
    medicineId: "",
    lotNumber: "",
    quantityReceived: "",
    unitCostRwf: "",
    supplier: "",
    expiryDate: "",
    receivedAt: new Date().toISOString().slice(0, 10),
  });

  const preset = useMemo(() => ({
    set7d: () => {
      const end = new Date();
      const start = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
      setStartAt(start.toISOString().slice(0, 10));
      setEndAt(end.toISOString().slice(0, 10));
    },
    set30d: () => {
      const end = new Date();
      const start = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
      setStartAt(start.toISOString().slice(0, 10));
      setEndAt(end.toISOString().slice(0, 10));
    },
    setCycle: () => {
      const flock = flocks.find((f) => f.id === flockId);
      void flock;
      setStartAt("");
      setEndAt(new Date().toISOString().slice(0, 10));
    },
  }), [flocks, flockId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fr, mr] = await Promise.all([
        fetch(`${API_BASE_URL}/api/flocks`, { headers: readAuthHeaders(token) }),
        fetch(`${API_BASE_URL}/api/medicine`, { headers: readAuthHeaders(token) }),
      ]);
      const fd = await fr.json();
      const md = await mr.json().catch(() => ({ medicines: [] }));
      if (!fr.ok) throw new Error(fd.error ?? "Failed to load flocks");
      const f = (fd.flocks as Flock[]) ?? [];
      setFlocks(f);
      setMedicines((md.medicines as Medicine[]) ?? []);
      const selected = flockId;
      const q = new URLSearchParams();
      if (startAt) q.set("start_at", `${startAt}T00:00:00.000Z`);
      if (endAt) q.set("end_at", `${endAt}T23:59:59.999Z`);
      const flockQ = encodeURIComponent(selected);
      const treatmentFetches = selected
        ? [
            fetch(`${API_BASE_URL}/api/flocks/${selected}/treatments?${q.toString()}`, {
              headers: readAuthHeaders(token),
            }),
          ]
        : f.map((fl) =>
            fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(fl.id)}/treatments?${q.toString()}`, {
              headers: readAuthHeaders(token),
            })
          );
      const [trResults, rr, orr, frs] = await Promise.all([
        Promise.all(treatmentFetches),
        fetch(`${API_BASE_URL}/api/treatment-rounds?flock_id=${flockQ}`, {
          headers: readAuthHeaders(token),
        }),
        fetch(`${API_BASE_URL}/api/treatment-rounds/overdue?flock_id=${flockQ}`, {
          headers: readAuthHeaders(token),
        }),
        fetch(`${API_BASE_URL}/api/medicine/forecast?lookback_days=30`, {
          headers: readAuthHeaders(token),
        }),
      ]);
      const treatmentJson = await Promise.all(
        trResults.map(async (tr) => {
          const td = await tr.json();
          if (!tr.ok) throw new Error((td as { error?: string }).error ?? "Failed to load treatments");
          return (td as { treatments?: Treatment[] }).treatments ?? [];
        })
      );
      const rd = await rr.json().catch(() => ({ rounds: [] }));
      const od = await orr.json().catch(() => ({ overdueRounds: [] }));
      const fd2 = await frs.json().catch(() => ({ forecast: [] }));
      setRows(
        treatmentJson
          .flat()
          .sort((a, b) => (a.at < b.at ? 1 : -1))
      );
      setRounds((rd.rounds as Round[]) ?? []);
      setOverdueRounds((od.overdueRounds as OverdueRound[]) ?? []);
      setForecastRows((fd2.forecast as ForecastRow[]) ?? []);
      setRoundForm((prev) => ({ ...prev, medicineId: prev.medicineId || ((md.medicines as Medicine[])?.[0]?.id ?? "") }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token, flockId, startAt, endAt]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setShowTreatmentForm(false);
    setShowRoundForm(false);
    setShowMedicineForm(false);
  }, [tab]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!flockId) return;
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/flocks/${flockId}/treatments`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          ...form,
          dose: Number(form.dose),
          durationDays: Number(form.durationDays),
          withdrawalDays: Number(form.withdrawalDays),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Save failed");
      const treatmentId = (d as { id?: string }).id;
      showToast("success", "Treatment logged.");

      // Non-blocking ERPNext medicine expense sync
      const company = getStoredErpnextCompany();
      if (erpnextAccess && CLIENT_ERPNEXT_ENTITY_SYNC && token && company && treatmentId) {
        void syncTreatmentToERPNext(token, {
          company,
          supplier: "Farm Veterinary Supplier",
          date: new Date().toISOString().slice(0, 10),
          medicineName: form.medicineName || "Medicine",
          amount: Number(form.dose) || 0,
          costCenter: getStoredErpnextCostCenter() || undefined,
          sourceId: treatmentId,
        }).catch(() => {});
      }
      setForm((v) => ({ ...v, diseaseOrReason: "", medicineName: "", dose: "", notes: "" }));
      setShowTreatmentForm(false);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitMedicine(e: React.FormEvent) {
    e.preventDefault();
    const name = medForm.name.trim();
    const qty = Number(medForm.quantity);
    const wdays = Number(medForm.withdrawalDays);
    const lowTh = Number(medForm.lowStockThreshold);
    if (!name) {
      showToast("error", "Medicine name is required.");
      return;
    }
    if (!medStockOptions.some((o) => o.value === medForm.unit)) {
      showToast("error", "Choose a stock unit allowed by the catalog.");
      return;
    }
    if (!Number.isFinite(qty) || qty < 0) {
      showToast("error", "Enter a valid opening quantity (0 or more).");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/medicine`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          ...medForm,
          name,
          quantity: qty,
          withdrawalDays: Number.isFinite(wdays) ? Math.max(0, wdays) : 0,
          lowStockThreshold: Number.isFinite(lowTh) ? Math.max(0, lowTh) : 10,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Failed to add medicine");
      showToast("success", "Medicine stock item created.");
      setMedForm((v) => ({ ...v, name: "", quantity: "", supplier: "", expiryDate: "" }));
      setShowMedicineForm(false);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitRound(e: React.FormEvent) {
    e.preventDefault();
    if (!flockId || !roundForm.medicineId) return;
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/treatment-rounds`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          flockId,
          medicineId: roundForm.medicineId,
          plannedFor: new Date(roundForm.plannedFor).toISOString(),
          route: roundForm.route,
          plannedQuantity: Number(roundForm.plannedQuantity),
          assignedToUserId: roundForm.assignedToUserId || null,
          notes: roundForm.notes || null,
          checklist: ["confirm_stock", "mixing_done", "distribution_done"],
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Failed to create round");
      showToast("success", "Treatment round scheduled.");
      setRoundForm((v) => ({ ...v, plannedQuantity: "", notes: "" }));
      setShowRoundForm(false);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function updateRoundStatus(id: string, status: Round["status"]) {
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/treatment-rounds/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ status }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Update failed");
      showToast("success", `Round marked ${status}.`);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  const loadLots = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`${API_BASE_URL}/api/medicine/lots`, { headers: readAuthHeaders(token) });
      const d = await r.json().catch(() => ({ lots: [] }));
      if (r.ok) setLots((d as { lots: MedicineLot[] }).lots ?? []);
    } catch { /* non-critical */ }
  }, [token]);

  useEffect(() => { void loadLots(); }, [loadLots]);

  async function submitLot(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(lotForm.quantityReceived);
    if (!lotForm.medicineId) { showToast("error", "Select a medicine."); return; }
    if (!Number.isFinite(qty) || qty <= 0) { showToast("error", "Enter a valid quantity."); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/medicine/lots`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          medicineId: lotForm.medicineId,
          lotNumber: lotForm.lotNumber.trim() || null,
          quantityReceived: qty,
          unitCostRwf: lotForm.unitCostRwf ? Number(lotForm.unitCostRwf) : undefined,
          supplier: lotForm.supplier.trim() || null,
          expiryDate: lotForm.expiryDate || null,
          receivedAt: lotForm.receivedAt ? new Date(lotForm.receivedAt).toISOString() : undefined,
          medicineName: medicines.find((m) => m.id === lotForm.medicineId)?.name ?? "Medicine",
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Save failed");
      const costMsg = lotForm.unitCostRwf ? " Cost saved for ERPNext sync." : "";
      showToast("success", `Lot received (${qty} units).${costMsg}`);
      setLotForm((v) => ({ ...v, lotNumber: "", quantityReceived: "", unitCostRwf: "", supplier: "", expiryDate: "" }));
      setShowLotForm(false);
      await Promise.all([load(), loadLots()]);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ManagerPage>
      <PageHeader
        title="Medicine tracking"
        action={
          tab === "treatments" ? (
            <Button size="sm" onClick={() => setShowTreatmentForm(true)}>
              Record treatment
            </Button>
          ) : null
        }
        tabs={
          <PageTabs
            aria-label="Medicine sections"
            value={tab}
            onChange={(v) => setTab(v as MedTab)}
            options={[
              { value: "treatments", label: "Treatments" },
              { value: "rounds", label: "Rounds" },
              { value: "inventory", label: "Inventory" },
            ]}
          />
        }
      />
      {loading && <SkeletonList rows={3} />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}
      {!loading && !error ? (
        <>
          {tab === "treatments" ? (
            <>
              {overdueRounds.length > 0 ? (
                <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--status-warning)", backgroundColor: "var(--status-warning-soft)", color: "var(--text-primary)" }}>
                  <span className="font-semibold">{overdueRounds.length} overdue round{overdueRounds.length === 1 ? "" : "s"}.</span>{" "}
                  <TextLink className="font-medium text-[var(--status-warning)]" onClick={() => setTab("rounds")}>
                    Open rounds
                  </TextLink>
                </div>
              ) : null}

              <SectionCard flushBody>
                <DataTable
                  columns={[
                    {
                      key: "med",
                      header: "Medicine",
                      render: (r: (typeof rows)[number]) => (
                        <span className="font-medium">
                          {r.medicineName} — {treatmentReasonLabel(r, treatmentReasonOptions)}
                        </span>
                      ),
                    },
                    {
                      key: "dose",
                      header: "Dose",
                      render: (r: (typeof rows)[number]) => `${r.dose} ${r.doseUnit} · ${r.route}`,
                    },
                    {
                      key: "withdrawal",
                      header: "Withdrawal",
                      badge: true,
                      render: (r: (typeof rows)[number]) => {
                        const endsAt = new Date(new Date(r.at).getTime() + r.withdrawalDays * 24 * 60 * 60 * 1000).getTime();
                        const leftDays = Math.ceil((endsAt - Date.now()) / (24 * 60 * 60 * 1000));
                        return leftDays > 0 ? (
                          <StatusPill tone="warning">{leftDays}d left</StatusPill>
                        ) : (
                          <StatusPill tone="success">Cleared</StatusPill>
                        );
                      },
                    },
                    {
                      key: "days",
                      header: "Days",
                      numeric: true,
                      render: (r: (typeof rows)[number]) => r.withdrawalDays,
                    },
                  ]}
                  rows={rows}
                  rowKey={(r: (typeof rows)[number]) => r.id}
                  isFiltered={Boolean(flockId) || Boolean(startAt) || Boolean(endAt)}
                  emptyTitle="No treatments yet"
                  emptyDescription="Recorded treatments for this flock and date range will appear here."
                  emptyAction={<Button variant="primary" size="sm" onClick={() => setShowTreatmentForm(true)}>Record treatment</Button>}
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
                          <Button variant="secondary" size="xs" onClick={preset.set7d}>Last 7d</Button>
                          <Button variant="secondary" size="xs" onClick={preset.set30d}>Last 30d</Button>
                          <Button variant="secondary" size="xs" onClick={preset.setCycle}>Cycle to date</Button>
                          <input
                            className="h-control-sm rounded-control border border-[var(--border-input)] bg-[var(--surface-input)] px-2 text-xs"
                            type="date"
                            value={startAt}
                            onChange={(e) => setStartAt(e.target.value)}
                            aria-label="Start date"
                          />
                          <input
                            className="h-control-sm rounded-control border border-[var(--border-input)] bg-[var(--surface-input)] px-2 text-xs"
                            type="date"
                            value={endAt}
                            onChange={(e) => setEndAt(e.target.value)}
                            aria-label="End date"
                          />
                        </>
                      }
                      actions={
                        <a
                          className="inline-flex h-control-sm items-center rounded-control px-2.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--status-neutral-soft)] hover:text-[var(--text-primary)]"
                          href={`${API_BASE_URL}/api/reports/treatments.csv?flock_id=${encodeURIComponent(flockId)}${startAt ? `&start_at=${encodeURIComponent(`${startAt}T00:00:00.000Z`)}` : ""}${endAt ? `&end_at=${encodeURIComponent(`${endAt}T23:59:59.999Z`)}` : ""}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Download CSV
                        </a>
                      }
                    />
                  }
                  renderMobileCard={(r: (typeof rows)[number]) => (
                    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3">
                      <p className="font-medium text-sm">
                        {r.medicineName} — {treatmentReasonLabel(r, treatmentReasonOptions)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {r.dose} {r.doseUnit} via {r.route}
                      </p>
                    </div>
                  )}
                />
              </SectionCard>

              <Modal open={showTreatmentForm} title="Record treatment" onClose={() => setShowTreatmentForm(false)} wide>
                <form onSubmit={submit} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select className="rounded-lg border border-neutral-300 px-3 py-2" value={form.reasonCode} onChange={(e) => setForm((v) => ({ ...v, reasonCode: e.target.value }))}>
                      {treatmentReasonOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Condition details (optional)" value={form.diseaseOrReason} onChange={(e) => setForm((v) => ({ ...v, diseaseOrReason: e.target.value }))} />
                    <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Medicine name" value={form.medicineName} onChange={(e) => setForm((v) => ({ ...v, medicineName: e.target.value }))} />
                    <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Dose" inputMode="decimal" value={form.dose} onChange={(e) => setForm((v) => ({ ...v, dose: e.target.value }))} />
                    <select className="rounded-lg border border-neutral-300 px-3 py-2" value={form.doseUnit} onChange={(e) => setForm((v) => ({ ...v, doseUnit: e.target.value }))}>
                      {doseUnitOptions.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                    <select className="rounded-lg border border-neutral-300 px-3 py-2" value={form.route} onChange={(e) => setForm((v) => ({ ...v, route: e.target.value }))}>
                      {routeOptions.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Duration days" inputMode="numeric" value={form.durationDays} onChange={(e) => setForm((v) => ({ ...v, durationDays: e.target.value }))} />
                    <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Withdrawal days" inputMode="numeric" value={form.withdrawalDays} onChange={(e) => setForm((v) => ({ ...v, withdrawalDays: e.target.value }))} />
                  </div>
                  <textarea className="w-full rounded-lg border border-neutral-300 px-3 py-2" rows={3} placeholder="Notes" value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} />
                  <div className="flex justify-end">
                    <Button variant="primary" size="sm" type="submit" disabled={busy} loading={busy}>Save treatment</Button>
                  </div>
                </form>
              </Modal>
            </>
          ) : null}

          {tab === "rounds" ? (
            <>
              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-sm">
                <p className="mb-2 text-sm font-semibold text-neutral-800">Overdue rounds</p>
                <div className="space-y-2">
                  {overdueRounds.slice(0, 8).map((r) => (
                    <div key={r.id} className="rounded-lg border p-2 text-xs" style={{ borderColor: "var(--status-warning)", backgroundColor: "var(--status-warning-soft)", color: "var(--text-primary)" }}>
                      {r.medicineName} overdue by {Math.max(1, Math.floor(r.overdueMinutes / 60))}h ({r.flockId})
                    </div>
                  ))}
                  {!overdueRounds.length ? <p className="text-sm text-[var(--status-success)]">No overdue rounds.</p> : null}
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-sm">
                <TableToolbar
                  filters={
                    <FacetFilter
                      label="Flock"
                      value={flockId || "all"}
                      allValue="all"
                      allLabel="All flocks"
                      onChange={(v) => setFlockId(v === "all" ? "" : v)}
                      options={flocks.map((f) => ({ value: f.id, label: f.label }))}
                    />
                  }
                />
                <p className="mt-4 mb-2 text-sm font-semibold text-neutral-800">Scheduled rounds</p>
                <div className="space-y-2">
                  {rounds.slice(0, 12).map((r) => (
                    <div key={r.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
                      <p className="font-medium">{r.medicineName} · {new Date(r.plannedFor).toLocaleString(undefined, { timeZone: "Africa/Kigali" })}</p>
                      <p className="text-neutral-600">Status: {r.status} · Qty {r.plannedQuantity}</p>
                      <div className="mt-2 flex gap-2">
                        {r.status !== "completed" ? <Button variant="secondary" size="sm" onClick={() => void updateRoundStatus(r.id, "completed")}>Mark completed</Button> : null}
                        {r.status !== "missed" ? <Button variant="secondary" size="sm" onClick={() => void updateRoundStatus(r.id, "missed")}>Mark missed</Button> : null}
                      </div>
                    </div>
                  ))}
                  {!rounds.length ? <p className="text-sm text-neutral-500">No rounds scheduled yet.</p> : null}
                </div>
              </div>

              {!showRoundForm ? (
                <Button variant="secondary" size="sm" onClick={() => setShowRoundForm(true)}>Schedule round</Button>
              ) : (
                <form onSubmit={submitRound} className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-neutral-800">Schedule medicine / vaccine round</p>
                    <TextLink className="text-sm text-neutral-600" onClick={() => setShowRoundForm(false)}>
                      Cancel
                    </TextLink>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <select className="rounded-lg border border-neutral-300 px-3 py-2" value={roundForm.medicineId} onChange={(e) => setRoundForm((v) => ({ ...v, medicineId: e.target.value }))}>
                      {medicines.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <input className="rounded-lg border border-neutral-300 px-3 py-2" type="datetime-local" value={roundForm.plannedFor} onChange={(e) => setRoundForm((v) => ({ ...v, plannedFor: e.target.value }))} />
                    <select className="rounded-lg border border-neutral-300 px-3 py-2" value={roundForm.route} onChange={(e) => setRoundForm((v) => ({ ...v, route: e.target.value }))}>
                      {adminRouteOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Planned qty" inputMode="decimal" value={roundForm.plannedQuantity} onChange={(e) => setRoundForm((v) => ({ ...v, plannedQuantity: e.target.value }))} />
                    <input className="rounded-lg border border-neutral-300 px-3 py-2 sm:col-span-2" placeholder="Assign to user id (optional)" value={roundForm.assignedToUserId} onChange={(e) => setRoundForm((v) => ({ ...v, assignedToUserId: e.target.value }))} />
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button variant="primary" size="sm" type="submit" disabled={busy} loading={busy}>Schedule round</Button>
                  </div>
                </form>
              )}
            </>
          ) : null}

          {tab === "inventory" ? (
            <div className="space-y-stack">
              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-sm">
                <p className="mb-3 text-sm font-semibold text-neutral-800">Stock forecast (30 days)</p>
                <div className="mb-6 grid gap-2 sm:grid-cols-2">
                  {forecastRows.slice(0, 6).map((f) => (
                    <div key={f.id} className="rounded-lg border border-neutral-200 p-2 text-xs">
                      <p className="font-medium text-neutral-900">{f.name}</p>
                      <p className="text-neutral-700">
                        Cover: {f.daysOfCover != null ? `${f.daysOfCover} days` : "insufficient usage data"} · Avg/day {Number(f.avgDailyUse).toFixed(2)} {f.unit}
                      </p>
                      {f.stockoutRisk7d ? <p className="font-semibold text-[var(--status-danger)]">Risk: stockout within 7 days</p> : null}
                    </div>
                  ))}
                  {!forecastRows.length ? <p className="text-sm text-neutral-500">No forecast data yet.</p> : null}
                </div>

                <p className="mb-3 text-sm font-semibold text-neutral-800">On-hand inventory</p>
                <div className="mb-4 grid gap-3 sm:grid-cols-2">
                  {medicines.map((m) => {
                    const low = Number(m.quantity) < Number(m.lowStockThreshold ?? 10);
                    return (
                      <div key={m.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
                        <p className="font-medium">{m.name}</p>
                        <p className="text-neutral-600">{m.category} · withdrawal {m.withdrawalDays} day(s)</p>
                        <p className={low ? "font-semibold text-[var(--status-danger)]" : "font-semibold text-neutral-800"}>
                          Stock: {m.quantity} {m.unit}{low ? " (LOW)" : ""}
                        </p>
                      </div>
                    );
                  })}
                  {!medicines.length ? <p className="text-sm text-neutral-500">No medicines in stock yet.</p> : null}
                </div>

                {!showMedicineForm ? (
                  <Button variant="secondary" size="sm" onClick={() => setShowMedicineForm(true)}>Add catalog item</Button>
                ) : (
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-neutral-800">New catalog item</p>
                      <TextLink className="text-sm text-neutral-600" onClick={() => setShowMedicineForm(false)}>
                        Cancel
                      </TextLink>
                    </div>
                    <form onSubmit={submitMedicine} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                      <input className="rounded-lg border border-neutral-300 px-3 py-2 lg:col-span-2" placeholder="Medicine name" value={medForm.name} onChange={(e) => setMedForm((v) => ({ ...v, name: e.target.value }))} />
                      <select className="rounded-lg border border-neutral-300 px-3 py-2" value={medForm.category} onChange={(e) => setMedForm((v) => ({ ...v, category: e.target.value }))}>
                        {medCategoryOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <select className="rounded-lg border border-neutral-300 px-3 py-2" value={medForm.unit} onChange={(e) => setMedForm((v) => ({ ...v, unit: e.target.value }))} title="Stock unit (database-enforced)">
                        {medStockOptions.map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                      <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Opening qty" inputMode="decimal" value={medForm.quantity} onChange={(e) => setMedForm((v) => ({ ...v, quantity: e.target.value }))} />
                      <Button variant="primary" size="sm" type="submit" disabled={busy} loading={busy}>Add item</Button>
                      <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Withdrawal days" inputMode="numeric" value={medForm.withdrawalDays} onChange={(e) => setMedForm((v) => ({ ...v, withdrawalDays: e.target.value }))} />
                      <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Low-stock alert at" inputMode="numeric" value={medForm.lowStockThreshold} onChange={(e) => setMedForm((v) => ({ ...v, lowStockThreshold: e.target.value }))} />
                    </form>
                  </div>
                )}
              </div>

              {/* ── Medicine lot receipts ── */}
              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-neutral-800">Medicine lot receipts</p>
                  <span className="text-xs text-neutral-500">Received batches — add unit cost to record cost for ERPNext sync</span>
                </div>

                {lots.length > 0 ? (
                  <div className="mb-4">
                    <DataTable<MedicineLot>
                      columns={[
                        { key: "med", header: "Medicine", render: (l) => <span className="font-medium">{l.medicineName}</span> },
                        { key: "lot", header: "Lot #", className: "tbl-mono", render: (l) => l.lotNumber ?? "—" },
                        {
                          key: "received",
                          header: "Received",
                          className: "tbl-mono",
                          render: (l) =>
                            new Date(l.receivedAt).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              timeZone: "Africa/Kigali",
                            }),
                        },
                        { key: "qty", header: "Qty received", numeric: true, render: (l) => l.quantityReceived },
                        { key: "rem", header: "Remaining", numeric: true, render: (l) => l.quantityRemaining },
                        {
                          key: "cost",
                          header: "Unit cost (RWF)",
                          numeric: true,
                          render: (l) => (l.unitCostRwf != null ? l.unitCostRwf.toLocaleString() : "—"),
                        },
                        { key: "supplier", header: "Supplier", render: (l) => l.supplier ?? "—" },
                        ...(user?.erpnextAccess || erpnextAccess
                          ? [
                              {
                                key: "erpnext",
                                header: "ERPNext",
                                badge: true,
                                render: (l: MedicineLot) => {
                                  const hint = bySource.get(String(l.id));
                                  if (!hint) return null;
                                  return (
                                    <ERPNextSyncBadge
                                      state={hint.state}
                                      reference={hint.reference}
                                      compact
                                      href={companyHref(`farm/erpnext-setup?q=${encodeURIComponent(String(l.id))}`)}
                                    />
                                  );
                                },
                              },
                            ]
                          : []),
                      ]}
                      rows={lots}
                      rowKey={(l) => String(l.id)}
                      renderMobileCard={(l) => (
                        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3">
                          <p className="font-semibold text-sm">{l.medicineName}</p>
                          <p className="text-xs text-[var(--text-muted)]">
                            Lot {l.lotNumber ?? "—"} · rem {l.quantityRemaining}
                          </p>
                        </div>
                      )}
                    />
                  </div>
                ) : (
                  <p className="mb-4 text-sm text-[var(--text-muted)]">No lots received yet.</p>
                )}

                {!showLotForm ? (
                  <Button variant="secondary" size="sm" onClick={() => {
                      setLotForm((v) => ({ ...v, medicineId: v.medicineId || medicines[0]?.id || "" }));
                      setShowLotForm(true);
                    }}>Receive medicine lot</Button>
                ) : (
                  <form onSubmit={submitLot} className="rounded-lg border p-4" style={{ borderColor: "var(--status-success)", backgroundColor: "var(--status-success-soft)" }}>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-neutral-800">Receive lot — adds to inventory &amp; records cost for ERPNext if set</p>
                      <TextLink className="text-sm text-neutral-600" onClick={() => setShowLotForm(false)}>Cancel</TextLink>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-neutral-600">Medicine</label>
                        <select
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                          value={lotForm.medicineId}
                          onChange={(e) => setLotForm((v) => ({ ...v, medicineId: e.target.value }))}
                          required
                        >
                          <option value="">Select medicine…</option>
                          {medicines.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-neutral-600">Quantity received</label>
                        <input
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                          placeholder="e.g. 500"
                          inputMode="decimal"
                          value={lotForm.quantityReceived}
                          onChange={(e) => setLotForm((v) => ({ ...v, quantityReceived: e.target.value }))}
                          required
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-neutral-600">Unit cost (RWF)</label>
                        <input
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                          placeholder="e.g. 1200"
                          inputMode="decimal"
                          value={lotForm.unitCostRwf}
                          onChange={(e) => setLotForm((v) => ({ ...v, unitCostRwf: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-neutral-600">Supplier</label>
                        <input
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                          placeholder="Optional"
                          value={lotForm.supplier}
                          onChange={(e) => setLotForm((v) => ({ ...v, supplier: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-neutral-600">Lot number</label>
                        <input
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                          placeholder="Optional"
                          value={lotForm.lotNumber}
                          onChange={(e) => setLotForm((v) => ({ ...v, lotNumber: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-neutral-600">Received date</label>
                        <input
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                          type="date"
                          value={lotForm.receivedAt}
                          onChange={(e) => setLotForm((v) => ({ ...v, receivedAt: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-neutral-600">Expiry date</label>
                        <input
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                          type="date"
                          value={lotForm.expiryDate}
                          onChange={(e) => setLotForm((v) => ({ ...v, expiryDate: e.target.value }))}
                        />
                      </div>
                    </div>
                    {lotForm.unitCostRwf && (
                      <p className="mt-2 text-xs text-[var(--status-success)]">
                        Cost will sync to ERPNext on save.
                      </p>
                    )}
                    <div className="mt-3">
                      <Button variant="primary" size="sm" type="submit" disabled={busy || !lotForm.medicineId || !lotForm.quantityReceived} loading={busy}>Save lot receipt</Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </ManagerPage>
  );
}
