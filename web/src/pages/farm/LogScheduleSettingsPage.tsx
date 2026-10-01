import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import type { UserRole } from "../../auth/types";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { API_BASE_URL } from "../../api/config";
import { useReferenceOptions } from "../../hooks/useReferenceOptions";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import {
  FacetFilter,
  Field,
  Input,
  Modal,
  PageTabs,
  Select,
  TableToolbar,
  Checkbox,
} from "../../components/ui";

type Schedule = {
  id: string;
  flockId: string;
  role: string;
  logType?: string;
  intervalHours: number;
  windowOpen: string;
  windowClose: string;
  createdAt: string;
};

type FlockRow = { id: string; label: string };

const ROLE_OPTIONS: UserRole[] = [
  "laborer",
  "dispatcher",
  "vet",
  "vet_manager",
  "manager",
  "procurement_officer",
  "sales_coordinator",
];

const ROLE_LABELS: Record<string, string> = {
  laborer: "Laborer",
  dispatcher: "Dispatcher",
  vet: "Veterinarian",
  vet_manager: "Vet Manager",
  manager: "Manager",
  procurement_officer: "Procurement Officer",
  sales_coordinator: "Sales Coordinator",
};

function humanRole(role: string): string {
  return ROLE_LABELS[role] ?? role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const FALLBACK_LOG_SCHEDULE_ROLES = ROLE_OPTIONS.map((r) => ({ value: r, label: ROLE_LABELS[r] ?? r }));
/** Dense manager controls — keep height ≥ line-box or native select/time text clips. */
const mgrInput = "!min-h-10 h-10 box-border py-0 text-sm leading-10";

type FieldReportingMode = "laborer_rounds" | "vet_only" | "both" | "none";

function modeFromPicks(vetVisits: boolean, laborerRounds: boolean): FieldReportingMode {
  if (vetVisits && laborerRounds) return "both";
  if (vetVisits) return "vet_only";
  if (laborerRounds) return "laborer_rounds";
  return "none";
}

function picksFromMode(mode: FieldReportingMode): { vetVisits: boolean; laborerRounds: boolean } {
  return {
    vetVisits: mode === "vet_only" || mode === "both",
    laborerRounds: mode === "laborer_rounds" || mode === "both",
  };
}

function detailForMode(mode: FieldReportingMode): string {
  if (mode === "both") return "Laborers and vet visits both collect rounds";
  if (mode === "laborer_rounds") return "Laborers check in on the windows below · vet visit rounds off";
  if (mode === "none") return "No field rounds · laborer check-in and visit rounds off";
  return "Rounds during vet visits · laborer check-in off";
}


export function LogScheduleSettingsPage() {
  const { token } = useAuth();
  const logScheduleRoleOptions = useReferenceOptions("log_schedule_role", token, FALLBACK_LOG_SCHEDULE_ROLES);
  const { showToast } = useToast();
  const [flocks, setFlocks] = useState<FlockRow[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [serverKigali, setServerKigali] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [formFlock, setFormFlock] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("laborer");
  const [formLogType, setFormLogType] = useState<"check_in" | "vet_visit">("check_in");
  const [scheduleTab, setScheduleTab] = useState<"check_in" | "vet_visit">("check_in");
  const [flockFilter, setFlockFilter] = useState("all");
  const [fieldReportingMode, setFieldReportingMode] = useState<FieldReportingMode>("vet_only");
  const [modeBusy, setModeBusy] = useState(false);
  const [formInterval, setFormInterval] = useState("8");
  const [formOpen, setFormOpen] = useState("06:00");
  const [formClose, setFormClose] = useState("20:00");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [tf, ts] = await Promise.all([
        fetch(`${API_BASE_URL}/api/server-time`, { headers: readAuthHeaders(token) }).then((r) => r.json()),
        fetch(`${API_BASE_URL}/api/flocks`, { headers: readAuthHeaders(token) }).then((r) => r.json()),
      ]);
      setServerKigali(String((tf as { kigali?: string }).kigali ?? ""));

      if (!(ts as { flocks?: FlockRow[] }).flocks) throw new Error((ts as { error?: string }).error ?? "Flocks failed");
      const fl = (ts as { flocks: FlockRow[] }).flocks;
      setFlocks(fl.map((f) => ({ id: f.id, label: String(f.label ?? f.id) })));

      const allSched: Schedule[] = [];
      for (const f of fl) {
        const r = await fetch(`${API_BASE_URL}/api/log-schedule/${f.id}`, { headers: readAuthHeaders(token) });
        const d = await r.json();
        if (!r.ok) throw new Error((d as { error?: string }).error);
        for (const s of (d.schedules as Schedule[]) ?? []) allSched.push(s);
      }
      setSchedules(allSched);
      try {
        const modeRes = await fetch(`${API_BASE_URL}/api/company/field-reporting-mode`, {
          headers: readAuthHeaders(token),
        });
        const modeData = await modeRes.json();
        if (modeRes.ok) {
          const m = String((modeData as { fieldReportingMode?: string }).fieldReportingMode ?? "vet_only");
          if (m === "laborer_rounds" || m === "both" || m === "vet_only" || m === "none") {
            setFieldReportingMode(m);
          }
        }
      } catch {
        /* optional */
      }
      setFormFlock((prev) => {
        if (prev && fl.some((x) => x.id === prev)) return prev;
        return fl[0]?.id ?? "";
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const flockLabel = useMemo(() => {
    const map = new Map(flocks.map((f) => [f.id, f.label]));
    return (id: string) => map.get(id) ?? id;
  }, [flocks]);

  const visibleRows = useMemo(() => {
    return schedules
      .filter((s) => (s.logType || "check_in") === scheduleTab)
      .filter((s) => flockFilter === "all" || s.flockId === flockFilter)
      .sort((a, b) => {
        const fl = flockLabel(a.flockId).localeCompare(flockLabel(b.flockId));
        if (fl !== 0) return fl;
        return humanRole(a.role).localeCompare(humanRole(b.role));
      });
  }, [schedules, scheduleTab, flockFilter, flockLabel]);

  const showFlockCol = flockFilter === "all" && flocks.length > 1;
  const isFiltered = flockFilter !== "all";

  async function saveFieldReportingMode(mode: FieldReportingMode) {
    setModeBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/company/field-reporting-mode`, {
        method: "PATCH",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ fieldReportingMode: mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Save failed");
      setFieldReportingMode(mode);
      showToast("success", "Field reporting mode updated.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setModeBusy(false);
    }
  }

  function openAdd(forFlockId?: string) {
    setFormLogType(scheduleTab);
    if (scheduleTab === "vet_visit") setFormRole("vet");
    else setFormRole("laborer");
    if (forFlockId) setFormFlock(forFlockId);
    else if (flockFilter !== "all") setFormFlock(flockFilter);
    setPanelOpen(true);
  }

  async function submitSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!formFlock) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/log-schedule`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          flockId: formFlock,
          role: formRole,
          logType: formLogType,
          intervalHours: Number(formInterval),
          windowOpen: formOpen,
          windowClose: formClose,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Save failed");
      setPanelOpen(false);
      await loadAll();
      showToast("success", "Schedule saved.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSchedule(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/log-schedule/${id}`, {
        method: "DELETE",
        headers: readAuthHeaders(token),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error);
      await loadAll();
      showToast("success", "Schedule removed.");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  const kigaliShort = useMemo(() => {
    if (!serverKigali) return "";
    const at = serverKigali.lastIndexOf(" at ");
    if (at >= 0) return serverKigali.slice(at + 4);
    return serverKigali;
  }, [serverKigali]);

  const reportingPicks = picksFromMode(fieldReportingMode);

  return (
    <ManagerPage variant="settings">
      <PageHeader
        title="Schedule settings"
        primaryAction={{
          label: "Add schedule",
          onClick: () => openAdd(),
          disabled: busy || loading || flocks.length === 0,
        }}
        tabs={
          <PageTabs
            aria-label="Schedule type"
            value={scheduleTab}
            onChange={(v) => setScheduleTab(v as typeof scheduleTab)}
            options={[
              { value: "check_in", label: "Check-in" },
              { value: "vet_visit", label: "Vet visits" },
            ]}
          />
        }
      />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Field reporting mode</h2>
        <div className="space-y-1 rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] px-3 py-2">
          <Checkbox
            label="Vet visits"
            className="!min-h-10 w-full"
            checked={reportingPicks.vetVisits}
            disabled={modeBusy}
            onChange={(e) => {
              void saveFieldReportingMode(modeFromPicks(e.target.checked, reportingPicks.laborerRounds));
            }}
          />
          <Checkbox
            label="Laborer rounds"
            className="!min-h-10 w-full"
            checked={reportingPicks.laborerRounds}
            disabled={modeBusy}
            onChange={(e) => {
              void saveFieldReportingMode(modeFromPicks(reportingPicks.vetVisits, e.target.checked));
            }}
          />
        </div>
        <p className="type-caption text-[var(--text-secondary)]">{detailForMode(fieldReportingMode)}</p>
      </section>

      {loading ? <SkeletonList rows={4} /> : null}
      {error ? <ErrorState message={error} onRetry={() => void loadAll()} /> : null}

      {!loading && !error ? (
        <div className="table-block">
          <div className="table-toolbar">
            <TableToolbar
              filters={
                flocks.length > 1 ? (
                  <FacetFilter
                    label="Flock"
                    value={flockFilter}
                    allValue="all"
                    allLabel="All flocks"
                    onChange={setFlockFilter}
                    options={flocks.map((f) => ({ value: f.id, label: f.label }))}
                  />
                ) : undefined
              }
              meta={
                [
                  `${visibleRows.length} window${visibleRows.length === 1 ? "" : "s"}`,
                  kigaliShort ? `Kigali ${kigaliShort}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              }
            />
          </div>

          {visibleRows.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {isFiltered ? "No windows for this flock" : "No payroll windows yet"}
              </p>
              <p className="mt-1 type-caption text-[var(--text-secondary)]">
                Windows define when on-time check-ins earn full pay.
              </p>
              <Button className="mt-3" variant="secondary" size="sm" onClick={() => openAdd()}>
                Add schedule
              </Button>
            </div>
          ) : (
            <ul>
              {visibleRows.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 border-b border-[var(--border-color)] px-3 py-2.5 last:border-b-0 hover:bg-[var(--surface-subtle)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {humanRole(s.role)}
                      {showFlockCol ? (
                        <span className="font-normal text-[var(--text-secondary)]">
                          {" "}
                          · {flockLabel(s.flockId)}
                        </span>
                      ) : null}
                    </p>
                    <p className="type-caption text-[var(--text-secondary)]">
                      Every {s.intervalHours}h
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-sm tabular-nums text-[var(--text-primary)]">
                    {s.windowOpen} – {s.windowClose}
                  </p>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="shrink-0 text-[var(--status-danger)] hover:bg-[var(--status-danger-soft)] hover:text-[var(--status-danger)]"
                    onClick={() => setConfirmDeleteId(s.id)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <Modal
        open={panelOpen}
        title="Add schedule"
        onClose={() => setPanelOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPanelOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              onClick={() => {
                const form = document.getElementById("log-schedule-form") as HTMLFormElement | null;
                form?.requestSubmit();
              }}
            >
              Save schedule
            </Button>
          </div>
        }
      >
        <form id="log-schedule-form" className="space-y-3" onSubmit={(e) => void submitSchedule(e)}>
          <Field label="Flock">
            <Select
              className={mgrInput}
              value={formFlock}
              onChange={(e) => setFormFlock(e.target.value)}
              required
            >
              {flocks.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Role">
            <Select
              className={mgrInput}
              value={formRole}
              onChange={(e) => setFormRole(e.target.value as UserRole)}
            >
              {logScheduleRoleOptions.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type">
            <Select
              className={mgrInput}
              value={formLogType}
              onChange={(e) => {
                const next = e.target.value as "check_in" | "vet_visit";
                setFormLogType(next);
                if (next === "vet_visit") setFormRole("vet");
              }}
            >
              <option value="check_in">Round check-in</option>
              <option value="vet_visit">Vet visit</option>
            </Select>
          </Field>
          <Field label="Interval (hours)" help="How often a round is due inside the window.">
            <Input
              type="number"
              min={0.5}
              step={0.5}
              className={mgrInput}
              value={formInterval}
              onChange={(e) => setFormInterval(e.target.value)}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Opens">
              <Input
                type="time"
                className={mgrInput}
                value={formOpen}
                onChange={(e) => setFormOpen(e.target.value)}
                required
              />
            </Field>
            <Field label="Closes">
              <Input
                type="time"
                className={mgrInput}
                value={formClose}
                onChange={(e) => setFormClose(e.target.value)}
                required
              />
            </Field>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Remove schedule"
        message="This window will stop applying to payroll. You can add it again later."
        confirmLabel="Remove"
        variant="danger"
        loading={busy}
        onConfirm={() => {
          if (confirmDeleteId) void deleteSchedule(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </ManagerPage>
  );
}
