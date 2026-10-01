import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import { useToast } from "../../../components/Toast";
import { ErrorState, SkeletonList } from "../../../components/LoadingSkeleton";
import { DistrictSelect } from "../../../components/DistrictSelect";
import {
  Button,
  DataTable,
  type DataColumn,
  Field,
  Modal,
  SegmentedControl,
  StatusPill,
  TableToolbar,
} from "../../../components/ui";
import {
  convertMarketLead,
  createPipelineBuyer,
  fetchMarketJobs,
  fetchMarketLeads,
  fetchPipelineBuyers,
  fetchVerifyQueue,
  patchMarketLead,
  updatePipelineBuyer,
  verifyBuyer,
  verifyCompany,
  verifyFarmProfile,
  verifyLot,
  type MarketLead,
  type PipelineBuyer,
  type FulfillmentJob,
} from "../../../api/pipeline.api";
import {
  DEMO_BUYERS,
  DEMO_JOBS,
  DEMO_LEADS,
  DEMO_VERIFY,
  isMarketDemoEligibleError,
} from "./demoMarketData";
import { useMarketDemoFlag } from "./useMarketDemoFlag";

type Panel = "accounts" | "locks" | "leads" | "verify";

type Props = {
  panel: string;
  openCreate?: boolean;
  onPanelChange: (panel: string) => void;
};

const BUYER_TYPES = ["butcher", "restaurant", "hotel", "vendor", "institution", "other"] as const;

const emptyForm = {
  name: "",
  buyerType: "butcher",
  district: "",
  whatsapp: "",
  phone: "",
  weeklyBirdsMin: "",
  weeklyBirdsMax: "",
  notes: "",
};

export function BuyersPanel({ panel, openCreate = false, onPanelChange }: Props) {
  const active: Panel =
    panel === "locks" || panel === "leads" || panel === "verify" || panel === "accounts" ? panel : "accounts";

  return (
    <div className="space-y-stack">
      <SegmentedControl
        size="sm"
        value={active}
        onChange={(v) => onPanelChange(v)}
        options={[
          { value: "accounts", label: "Accounts" },
          { value: "locks", label: "Locks" },
          { value: "leads", label: "Leads" },
          { value: "verify", label: "Verify" },
        ]}
      />
      {active === "accounts" ? <AccountsSubpanel openCreate={openCreate} /> : null}
      {active === "locks" ? <LocksSubpanel /> : null}
      {active === "leads" ? <LeadsSubpanel /> : null}
      {active === "verify" ? <VerifySubpanel /> : null}
    </div>
  );
}

function AccountsSubpanel({ openCreate }: { openCreate: boolean }) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [apiFailed, setApiFailed] = useState(false);
  const demo = useMarketDemoFlag(apiFailed);
  const [buyers, setBuyers] = useState<PipelineBuyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(openCreate);
  const [editing, setEditing] = useState<PipelineBuyer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (openCreate) setOpen(true);
  }, [openCreate]);

  const reload = useCallback(async () => {
    if (!token && !demo) return;
    setLoading(true);
    setError(null);
    try {
      if (demo) {
        setBuyers(DEMO_BUYERS);
        setApiFailed(false);
        return;
      }
      const r = await fetchPipelineBuyers(token, false);
      setApiFailed(false);
      setBuyers(r.buyers);
    } catch (e) {
      if (isMarketDemoEligibleError(e)) {
        setApiFailed(true);
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load buyers");
    } finally {
      setLoading(false);
    }
  }, [token, demo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (demo) {
      showToast("success", editing ? "Buyer updated (demo)" : "Buyer created (demo)");
      setOpen(false);
      setEditing(null);
      return;
    }
    if (!token) return;
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(),
        buyerType: form.buyerType,
        district: form.district || null,
        whatsapp: form.whatsapp || null,
        phone: form.phone || null,
        weeklyBirdsMin: form.weeklyBirdsMin ? Number(form.weeklyBirdsMin) : null,
        weeklyBirdsMax: form.weeklyBirdsMax ? Number(form.weeklyBirdsMax) : null,
        notes: form.notes || null,
      };
      if (editing) await updatePipelineBuyer(token, editing.id, body);
      else await createPipelineBuyer(token, body);
      showToast("success", editing ? "Buyer updated" : "Buyer created");
      setOpen(false);
      setEditing(null);
      await reload();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const columns: DataColumn<PipelineBuyer>[] = useMemo(
    () => [
      {
        key: "name",
        header: "Buyer",
        sortable: true,
        render: (b) => (
          <div>
            <p className="font-semibold">{b.name}</p>
            <p className="type-caption text-[var(--text-muted)]">
              {b.buyerType}
              {b.district ? ` · ${b.district}` : ""}
            </p>
          </div>
        ),
      },
      {
        key: "volume",
        header: "Weekly birds",
        render: (b) =>
          b.weeklyBirdsMin != null || b.weeklyBirdsMax != null
            ? `${b.weeklyBirdsMin ?? "?"}–${b.weeklyBirdsMax ?? "?"}`
            : "—",
      },
      {
        key: "contact",
        header: "Contact",
        render: (b) => b.whatsapp || b.phone || "—",
      },
      {
        key: "status",
        header: "Status",
        badge: true,
        render: (b) => (
          <StatusPill tone={b.active === false ? "neutral" : "success"}>
            {b.active === false ? "Inactive" : "Active"}
          </StatusPill>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        className: "tbl-actions",
        render: (b) => (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setEditing(b);
              setForm({
                name: b.name,
                buyerType: b.buyerType || "other",
                district: b.district ?? "",
                whatsapp: b.whatsapp ?? "",
                phone: b.phone ?? "",
                weeklyBirdsMin: b.weeklyBirdsMin != null ? String(b.weeklyBirdsMin) : "",
                weeklyBirdsMax: b.weeklyBirdsMax != null ? String(b.weeklyBirdsMax) : "",
                notes: b.notes ?? "",
              });
              setOpen(true);
            }}
          >
            Edit
          </Button>
        ),
      },
    ],
    []
  );

  if (loading) return <SkeletonList rows={4} />;
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;

  return (
    <>
      <div className="table-block">
        <DataTable
          flush
          columns={columns}
          rows={buyers}
          rowKey={(b) => b.id}
          emptyTitle="No buyers yet"
          toolbar={
            <TableToolbar
              meta={`${buyers.length} buyer${buyers.length === 1 ? "" : "s"}`}
              actions={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditing(null);
                    setForm(emptyForm);
                    setOpen(true);
                  }}
                >
                  Add buyer
                </Button>
              }
            />
          }
        />
      </div>
      <Modal open={open} title={editing ? "Edit buyer" : "Add buyer"} onClose={() => setOpen(false)}>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => void save(e)}>
          <Field label="Name" className="sm:col-span-2">
            <input
              className="h-[var(--control-h-md)] w-full rounded-control border border-[var(--border-input)] bg-[var(--surface-input)] px-3 text-sm"
              value={form.name}
              onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
              required
            />
          </Field>
          <Field label="Type">
            <select
              className="h-[var(--control-h-md)] w-full rounded-control border border-[var(--border-input)] bg-[var(--surface-input)] px-3 text-sm"
              value={form.buyerType}
              onChange={(e) => setForm((v) => ({ ...v, buyerType: e.target.value }))}
            >
              {BUYER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="District">
            <DistrictSelect
              value={form.district}
              onChange={(district) => setForm((v) => ({ ...v, district }))}
            />
          </Field>
          <Field label="WhatsApp">
            <input
              className="h-[var(--control-h-md)] w-full rounded-control border border-[var(--border-input)] bg-[var(--surface-input)] px-3 text-sm"
              value={form.whatsapp}
              onChange={(e) => setForm((v) => ({ ...v, whatsapp: e.target.value }))}
            />
          </Field>
          <Field label="Phone">
            <input
              className="h-[var(--control-h-md)] w-full rounded-control border border-[var(--border-input)] bg-[var(--surface-input)] px-3 text-sm"
              value={form.phone}
              onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))}
            />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={busy} loading={busy}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function LocksSubpanel() {
  const { token } = useAuth();
  const [apiFailed, setApiFailed] = useState(false);
  const demo = useMarketDemoFlag(apiFailed);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<FulfillmentJob[]>([]);

  const reload = useCallback(async () => {
    if (!token && !demo) return;
    setLoading(true);
    setError(null);
    try {
      if (demo) {
        setJobs(
          DEMO_JOBS.filter(
            (j) =>
              j.status === "committed" &&
              (j.buyerPaymentStatus == null ||
                j.buyerPaymentStatus === "unpaid" ||
                j.buyerPaymentStatus === "pending" ||
                j.handshake === "awaiting_payment" ||
                j.handshake === "reserved" ||
                j.handshake === "planned")
          )
        );
        setApiFailed(false);
        return;
      }
      const res = await fetchMarketJobs(token, "open");
      setApiFailed(false);
      setJobs(
        res.jobs.filter(
          (j) =>
            j.status === "committed" &&
            (j.buyerPaymentStatus == null ||
              j.buyerPaymentStatus === "unpaid" ||
              j.buyerPaymentStatus === "pending" ||
              j.handshake === "awaiting_payment" ||
              j.handshake === "reserved" ||
              j.handshake === "planned")
        )
      );
    } catch (e) {
      if (isMarketDemoEligibleError(e)) {
        setApiFailed(true);
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load locks");
    } finally {
      setLoading(false);
    }
  }, [token, demo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const columns: DataColumn<FulfillmentJob>[] = useMemo(
    () => [
      {
        key: "buyer",
        header: "Buyer",
        render: (j) => (
          <div>
            <p className="font-semibold">{j.buyerName ?? "Buyer"}</p>
            <p className="type-caption text-[var(--text-muted)]">{j.lotFarmLabel ?? j.publicRef ?? "—"}</p>
          </div>
        ),
      },
      { key: "birds", header: "Birds", numeric: true, render: (j) => j.birds },
      {
        key: "pay",
        header: "Payment",
        badge: true,
        render: (j) => (
          <StatusPill tone={j.buyerPaymentStatus === "paid" ? "success" : "warning"}>
            {j.buyerPaymentStatus ?? "unpaid"}
          </StatusPill>
        ),
      },
      {
        key: "phase",
        header: "Phase",
        render: (j) => j.handshake ?? j.status,
      },
    ],
    []
  );

  if (loading) return <SkeletonList rows={3} />;
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;

  return (
    <div className="table-block">
      <DataTable
        flush
        columns={columns}
        rows={jobs}
        rowKey={(j) => j.id}
        emptyTitle="No open locks"
        toolbar={<TableToolbar meta={`${jobs.length} lock${jobs.length === 1 ? "" : "s"}`} />}
      />
    </div>
  );
}

function LeadsSubpanel() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [apiFailed, setApiFailed] = useState(false);
  const demo = useMarketDemoFlag(apiFailed);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<MarketLead[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!token && !demo) return;
    setLoading(true);
    setError(null);
    try {
      if (demo) {
        setLeads(DEMO_LEADS);
        setApiFailed(false);
        return;
      }
      const res = await fetchMarketLeads(token, "new");
      setApiFailed(false);
      setLeads(res.leads);
    } catch (e) {
      if (isMarketDemoEligibleError(e)) {
        setApiFailed(true);
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [token, demo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function act(id: string, fn: () => Promise<unknown>, ok: string) {
    if (demo) {
      showToast("success", `${ok} (demo)`);
      setLeads((rows) => rows.filter((l) => l.id !== id));
      return;
    }
    if (!token) return;
    setBusyId(id);
    try {
      await fn();
      showToast("success", ok);
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <SkeletonList rows={3} />;
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;

  return (
    <div className="table-block">
      <div className="table-toolbar">
        <span className="text-xs text-[var(--text-muted)] tabular-nums">
          {leads.length} new lead{leads.length === 1 ? "" : "s"}
        </span>
      </div>
      {leads.length === 0 ? (
        <p className="px-card py-6 type-caption text-[var(--text-muted)]">No new public leads.</p>
      ) : (
        <ul className="divide-y divide-[var(--border-color)]">
          {leads.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-card py-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-[var(--text-primary)]">
                  {l.contactName || l.businessName || l.phone || "Lead"}
                </p>
                <p className="type-caption text-[var(--text-muted)]">
                  {l.birds != null ? `${l.birds} birds` : null}
                  {l.district ? ` · ${l.district}` : ""}
                  {l.source ? ` · ${l.source}` : ""}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={busyId === l.id}
                  onClick={() => void act(l.id, () => convertMarketLead(token, l.id), "Converted")}
                >
                  Convert
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={busyId === l.id}
                  onClick={() =>
                    void act(l.id, () => patchMarketLead(token, l.id, { status: "contacted" }), "Marked contacted")
                  }
                >
                  Contacted
                </Button>
                <Button
                  size="xs"
                  variant="dangerGhost"
                  disabled={busyId === l.id}
                  onClick={() => void act(l.id, () => patchMarketLead(token, l.id, { status: "spam" }), "Marked spam")}
                >
                  Spam
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VerifySubpanel() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [apiFailed, setApiFailed] = useState(false);
  const demo = useMarketDemoFlag(apiFailed);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<Awaited<ReturnType<typeof fetchVerifyQueue>> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!token && !demo) return;
    setLoading(true);
    setError(null);
    try {
      if (demo) {
        setQueue(DEMO_VERIFY);
        setApiFailed(false);
        return;
      }
      setQueue(await fetchVerifyQueue(token));
      setApiFailed(false);
    } catch (e) {
      if (isMarketDemoEligibleError(e)) {
        setApiFailed(true);
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load verify queue");
    } finally {
      setLoading(false);
    }
  }, [token, demo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function act(id: string, fn: () => Promise<unknown>, ok: string) {
    if (demo) {
      showToast("success", `${ok} (demo)`);
      setQueue((q) =>
        q
          ? {
              companies: q.companies.filter((c) => c.id !== id),
              buyers: q.buyers.filter((b) => b.id !== id),
              lots: q.lots.filter((l) => l.id !== id),
              profiles: (q.profiles ?? []).filter((p) => p.id !== id),
            }
          : q
      );
      return;
    }
    if (!token) return;
    setBusyId(id);
    try {
      await fn();
      showToast("success", ok);
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Verify failed");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <SkeletonList rows={3} />;
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!queue) return null;

  const sections = [
    {
      title: "Companies",
      rows: queue.companies.map((c) => ({
        id: c.id,
        label: c.name,
        meta: c.slug,
        approve: () => verifyCompany(token, c.id, "verified"),
        reject: () => verifyCompany(token, c.id, "rejected"),
      })),
    },
    {
      title: "Buyers",
      rows: queue.buyers.map((b) => ({
        id: b.id,
        label: b.name,
        meta: `${b.buyerType}${b.district ? ` · ${b.district}` : ""}`,
        approve: () => verifyBuyer(token, b.id, "verified"),
        reject: () => verifyBuyer(token, b.id, "rejected"),
      })),
    },
    {
      title: "Lots",
      rows: queue.lots.map((l) => ({
        id: l.id,
        label: l.farmLabel || l.breedCode || "Lot",
        meta: `${l.remainingBirds ?? l.birdCount} birds`,
        approve: () => verifyLot(token, l.id, "verified"),
        reject: () => verifyLot(token, l.id, "rejected"),
      })),
    },
    {
      title: "Storefronts",
      rows: (queue.profiles ?? []).map((p) => ({
        id: p.id,
        label: p.displayName,
        meta: p.district || p.slug,
        approve: () => verifyFarmProfile(token, p.id, "verified"),
        reject: () => verifyFarmProfile(token, p.id, "rejected"),
      })),
    },
  ];

  const total = sections.reduce((s, x) => s + x.rows.length, 0);

  return (
    <div className="space-y-stack">
      {total === 0 ? (
        <p className="type-caption text-[var(--text-muted)]">Nothing pending verification.</p>
      ) : (
        sections.map((sec) =>
          sec.rows.length === 0 ? null : (
            <div key={sec.title} className="table-block">
              <div className="table-toolbar">
                <p className="text-sm font-semibold">{sec.title}</p>
                <span className="text-xs text-[var(--text-muted)] tabular-nums">{sec.rows.length}</span>
              </div>
              <ul className="divide-y divide-[var(--border-color)]">
                {sec.rows.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-card py-3 text-sm">
                    <div>
                      <p className="font-semibold">{r.label}</p>
                      <p className="type-caption text-[var(--text-muted)]">{r.meta}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="xs"
                        variant="secondary"
                        disabled={busyId === r.id}
                        onClick={() => void act(r.id, r.approve, "Verified")}
                      >
                        Approve
                      </Button>
                      <Button
                        size="xs"
                        variant="dangerGhost"
                        disabled={busyId === r.id}
                        onClick={() => void act(r.id, r.reject, "Rejected")}
                      >
                        Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )
        )
      )}
    </div>
  );
}
