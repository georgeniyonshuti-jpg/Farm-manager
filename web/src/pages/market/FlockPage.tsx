import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPipelineDesk } from "../../auth/permissions";
import { DistrictSelect } from "../../components/DistrictSelect";
import { PageHeader } from "../../components/PageHeader";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { Button, ConfirmDialog, Field, Input, ListBackLink, SectionCard, Select, StatusPill, type StatusTone } from "../../components/ui";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import {
  assignFlockScout,
  fetchFlockDesk,
  removeFlock,
  updatePipelineLot,
  verifyLot,
  type FlockBookRow,
  type NearbyBuyer,
} from "../../api/pipeline.api";
import { flockDeskStatus, flockStatusLabel, placeLabel, type FlockDeskStatus } from "./flockDesk";

function day(value?: string | null) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function weekly(buyer: NearbyBuyer) {
  if (buyer.weeklyBirdsMin && buyer.weeklyBirdsMax) return `${buyer.weeklyBirdsMin}–${buyer.weeklyBirdsMax} a week`;
  if (buyer.weeklyBirdsMin) return `From ${buyer.weeklyBirdsMin} a week`;
  if (buyer.weeklyBirdsMax) return `Up to ${buyer.weeklyBirdsMax} a week`;
  return "No weekly amount yet";
}

const STATUS_TONE: Record<FlockDeskStatus, StatusTone> = {
  needs_review: "warning",
  with_scout: "info",
  verified: "success",
};

function BuyerBlock({ title, rows }: { title: string; rows: NearbyBuyer[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-[var(--text-secondary)]">{title}</p>
      <ul className="divide-y divide-[var(--border-color)]">
        {rows.map((buyer) => (
          <li key={buyer.id} className="flex items-baseline justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="truncate font-medium text-[var(--text-primary)]">{buyer.name}</p>
              <p className="truncate text-sm text-[var(--text-secondary)]">{placeLabel(buyer)}</p>
            </div>
            <p className="shrink-0 text-sm text-[var(--text-secondary)]">{weekly(buyer)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FlockPage() {
  const { lotId = "" } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { companyHref } = useCompanyNav();
  const { showToast } = useToast();
  const allowed = canAccessPipelineDesk(user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flock, setFlock] = useState<FlockBookRow | null>(null);
  const [scouts, setScouts] = useState<{ id: string; name: string }[]>([]);
  const [buyers, setBuyers] = useState<{ sameSector: NearbyBuyer[]; sameDistrict: NearbyBuyer[]; sameProvince: NearbyBuyer[] }>({
    sameSector: [],
    sameDistrict: [],
    sameProvince: [],
  });
  const [farmLabel, setFarmLabel] = useState("");
  const [birdCount, setBirdCount] = useState("");
  const [district, setDistrict] = useState("");
  const [sector, setSector] = useState("");
  const [readyFrom, setReadyFrom] = useState("");
  const [readyTo, setReadyTo] = useState("");
  const [scoutId, setScoutId] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!token || !allowed || !lotId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFlockDesk(token, lotId);
      setFlock(data.flock);
      setScouts(data.scouts);
      setBuyers(data.buyers);
      setFarmLabel(data.flock.farmLabel || "");
      setBirdCount(String(data.flock.birdCount ?? ""));
      setDistrict(data.flock.district || "");
      setSector(data.flock.sector || "");
      setReadyFrom(day(data.flock.readyFrom));
      setReadyTo(day(data.flock.readyTo));
      setScoutId(data.flock.assignedScoutUserId || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this flock");
    } finally {
      setLoading(false);
    }
  }, [allowed, lotId, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      showToast("success", ok);
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not do that");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return (
      <ManagerPage>
        <PageHeader title="Flock" />
        <p className="text-sm text-[var(--text-muted)]">Sales coordinator or superuser access required.</p>
      </ManagerPage>
    );
  }

  const mark = flock ? flockDeskStatus(flock) : null;
  const back = companyHref("/farm/pipeline/flocks");
  const buyerCount = buyers.sameSector.length + buyers.sameDistrict.length + buyers.sameProvince.length;
  const knownScout = scouts.some((scout) => scout.id === flock?.assignedScoutUserId);

  function save(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (!flock) return;
    const birds = Number(birdCount);
    if (!Number.isInteger(birds) || birds <= 0) {
      showToast("error", "Bird count must be a whole number.");
      return;
    }
    void run(
      () =>
        updatePipelineLot(token, flock.id, {
          farmLabel,
          birdCount: birds,
          district,
          sector,
          readyFrom,
          readyTo,
        }),
      "Saved"
    );
  }

  return (
    <ManagerPage>
      <PageHeader title={flock?.farmLabel || "Flock"} />
      {loading ? <SkeletonList rows={4} /> : null}
      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}
      {!loading && !error && flock ? (
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <ListBackLink to={back} label="Flocks" />
            {mark ? <StatusPill tone={STATUS_TONE[mark]}>{flockStatusLabel(mark)}</StatusPill> : null}
            {flock.registeredByName ? (
              <p className="text-sm text-[var(--text-secondary)]">Registered by {flock.registeredByName}</p>
            ) : null}
            <div className="ml-auto">
              <Button type="button" size="sm" variant="dangerGhost" disabled={busy} onClick={() => setConfirmRemove(true)}>
                Remove
              </Button>
            </div>
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,20rem)]">
            <SectionCard title="Details">
              <form className="space-y-4" onSubmit={save}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Farm">
                    <Input value={farmLabel} onChange={(e) => setFarmLabel(e.target.value)} />
                  </Field>
                  <Field label="Birds">
                    <Input type="number" min={1} value={birdCount} onChange={(e) => setBirdCount(e.target.value)} />
                  </Field>
                </div>
                <DistrictSelect
                  value={district}
                  sector={sector}
                  onChange={setDistrict}
                  onSectorChange={setSector}
                  required
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Ready from">
                    <Input type="date" value={readyFrom} onChange={(e) => setReadyFrom(e.target.value)} />
                  </Field>
                  <Field label="Ready to">
                    <Input type="date" value={readyTo} onChange={(e) => setReadyTo(e.target.value)} />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-[var(--border-color)] pt-4">
                  <Button type="submit" variant="secondary" disabled={busy}>
                    Save
                  </Button>
                  {mark === "needs_review" ? (
                    <Button type="button" disabled={busy} onClick={() => void run(() => verifyLot(token, flock.id, "verified"), "Approved")}>
                      Approve
                    </Button>
                  ) : null}
                  {mark === "needs_review" ? (
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => setRejecting((open) => !open)}>
                      {rejecting ? "Close" : "Reject"}
                    </Button>
                  ) : null}
                </div>
                {rejecting && mark === "needs_review" ? (
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <Field label="Reason">
                      <Input value={reason} placeholder="Why this flock is not a fit" onChange={(e) => setReason(e.target.value)} />
                    </Field>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={busy || !reason.trim()}
                      onClick={() => void run(() => verifyLot(token, flock.id, "rejected", reason.trim()), "Rejected")}
                    >
                      Reject
                    </Button>
                  </div>
                ) : null}
                <div className="grid gap-2 border-t border-[var(--border-color)] pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <Field label="Scout">
                    <Select value={scoutId} onChange={(e) => setScoutId(e.target.value)}>
                      <option value="">Choose a scout</option>
                      {flock.assignedScoutUserId && !knownScout ? (
                        <option value={flock.assignedScoutUserId}>{flock.assignedScoutName || "Assigned scout"}</option>
                      ) : null}
                      {scouts.map((scout) => (
                        <option key={scout.id} value={scout.id}>
                          {scout.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || !scoutId}
                    onClick={() => void run(() => assignFlockScout(token, flock.id, scoutId), "Scout assigned")}
                  >
                    Assign
                  </Button>
                </div>
              </form>
            </SectionCard>
            <SectionCard title="Nearby buyers">
              {buyerCount === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">No active buyers in this province yet.</p>
              ) : (
                <div className="space-y-4">
                  <BuyerBlock title="This sector" rows={buyers.sameSector} />
                  <BuyerBlock title="Rest of this district" rows={buyers.sameDistrict} />
                  <BuyerBlock title="Rest of this province" rows={buyers.sameProvince} />
                </div>
              )}
            </SectionCard>
          </div>
          <ConfirmDialog
            open={confirmRemove}
            title="Remove this flock?"
            message="It leaves the desk and the shop. Use this when the flock was entered by mistake."
            confirmLabel="Remove"
            loading={busy}
            onCancel={() => setConfirmRemove(false)}
            onConfirm={() => {
              setBusy(true);
              void removeFlock(token, flock.id)
                .then(() => {
                  showToast("success", "Flock removed");
                  navigate(back);
                })
                .catch((e: unknown) => {
                  showToast("error", e instanceof Error ? e.message : "Could not remove this flock");
                  setBusy(false);
                });
            }}
          />
        </div>
      ) : null}
    </ManagerPage>
  );
}
