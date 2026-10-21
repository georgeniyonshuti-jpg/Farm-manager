import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Bird, ChevronRight, MapPin, UserPlus } from "lucide-react";
import { FieldLogSheet } from "../../components/field/FieldLogSheet";
import { Button, Checkbox, Field, Input, SegmentedControl, Textarea } from "../../components/ui";
import { DistrictSelect } from "../../components/DistrictSelect";
import { MarketPhotoField } from "../../components/market/MarketPhotoField";
import { useAuth } from "../../auth/AuthContext";
import { canScoutPipeline } from "../../auth/permissions";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useActiveFlock } from "../../context/ActiveFlockContext";
import { useToast } from "../../components/Toast";
import {
  createScoutFarm,
  fetchFlockPipelineLot,
  fetchScoutFarms,
  inviteScoutFarm,
  recordScoutVisit,
  scoutPipelineLot,
  type FarmProfile,
  type MarketMedia,
  type ScoutFarmRow,
} from "../../api/pipeline.api";
import { saveScoutInvite } from "../../lib/scoutInvite";
import { fieldRoute } from "../../lib/fieldRoutes";
import {
  clearScoutDraft,
  emptyScoutDraft,
  readScoutDraft,
  scoutDraftIsUseful,
  writeScoutDraft,
  type ScoutDraft,
} from "../../lib/scoutDraft";

type ScoutMode = "managed" | "offplatform";
type Step = "farm" | "visit" | "consent" | "lot" | "review";

const STEPS: Step[] = ["farm", "visit", "consent", "lot", "review"];

function formatForecast(birds: number, kg: number, price: number) {
  if (birds <= 0 || kg <= 0 || price <= 0) return "0";
  return Math.round(birds * kg * price * 0.02).toLocaleString();
}

export function PipelineScoutPage() {
  const { token, user } = useAuth();
  const { companyHref } = useCompanyNav();
  const { activeFlockId } = useActiveFlock();
  const [params, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const allowed = canScoutPipeline(user);
  const fieldScout = user?.role === "vet";

  const weighLotId = params.get("lotId");
  useEffect(() => {
    if (weighLotId) {
      navigate(companyHref(`/farm/pipeline/weigh/${weighLotId}`), { replace: true });
    }
  }, [weighLotId, navigate, companyHref]);

  const flockId = fieldScout ? "" : params.get("flockId") || activeFlockId || "";
  const modeFromUrl: ScoutMode = fieldScout
    ? "offplatform"
    : params.get("mode") === "offplatform" && !flockId
      ? "offplatform"
      : params.get("mode") === "offplatform"
        ? "offplatform"
        : flockId
          ? "managed"
          : "offplatform";

  const [draft, setDraft] = useState<ScoutDraft>(() => {
    const saved = readScoutDraft();
    return emptyScoutDraft({
      ...(saved || {}),
      mode: modeFromUrl,
      flockId: flockId || saved?.flockId || "",
    });
  });
  const [step, setStep] = useState<Step>("farm");
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<FarmProfile | null>(null);
  const [media, setMedia] = useState<MarketMedia[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [task, setTask] = useState<null | "seller" | "flock" | "visit">(null);
  const [knownSellers, setKnownSellers] = useState<ScoutFarmRow[] | null>(null);
  const scoutRoute = useRef({ open: false, board: 0 });
  const scoutOpen = /\/farm\/pipeline\/scout\/?$/.test(location.pathname);
  const boardTick = (location.state as { board?: number } | null)?.board ?? 0;

  useEffect(() => {
    if (!fieldScout) return;
    const previous = scoutRoute.current;
    scoutRoute.current = { open: scoutOpen, board: boardTick };
    if (!scoutOpen) return;
    const entered = !previous.open;
    const reselected = boardTick !== previous.board && boardTick !== 0;
    if (!entered && !reselected) return;
    const wanted = params.get("task");
    if (entered && !reselected && (wanted === "flock" || wanted === "visit") && params.get("farm")) return;
    setTask(null);
  }, [fieldScout, scoutOpen, boardTick, params]);

  useEffect(() => {
    if (!fieldScout || task !== null || !token) return;
    let cancelled = false;
    fetchScoutFarms(token)
      .then((res) => {
        if (!cancelled) setKnownSellers(res.farms);
      })
      .catch(() => {
        if (!cancelled) setKnownSellers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [fieldScout, task, token]);

  useEffect(() => {
    if (!fieldScout || !knownSellers || task !== null) return;
    const wanted = params.get("task");
    const farmId = params.get("farm");
    if ((wanted !== "flock" && wanted !== "visit") || !farmId) return;
    const farm = knownSellers.find((row) => row.id === farmId);
    if (!farm) return;
    const gate =
      farm.verificationStatus !== "verified" ? "wait" : !farm.lotId ? "flock" : !farm.scoutConfirmedAt ? "visit" : "ready";
    if (gate !== wanted) return;
    setProfile(farm);
    setDraft((d) => ({
      ...d,
      mode: "offplatform",
      farmProfileId: farm.id,
      displayName: farm.displayName || "",
      district: farm.district || "",
      locationLabel: farm.locationLabel || "",
      contactPhone: farm.contactPhone || "",
      birdCount: farm.birdCount ? String(farm.birdCount) : "",
      readyFrom: String(farm.readyFrom || "").slice(0, 10),
      readyTo: String(farm.readyTo || "").slice(0, 10),
    }));
    setTask(wanted);
    const next = new URLSearchParams(params);
    next.delete("task");
    next.delete("farm");
    setSearchParams(next, { replace: true });
  }, [fieldScout, knownSellers, task, params, setSearchParams]);

  useEffect(() => {
    writeScoutDraft(draft);
  }, [draft]);

  useEffect(() => {
    if (!token || !allowed || draft.mode !== "managed" || !draft.flockId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchFlockPipelineLot(token, draft.flockId);
        if (cancelled) return;
        const s = r.snapshot;
        const lot = r.lot;
        setDraft((f) => ({
          ...f,
          displayName: f.displayName || lot?.farmLabel || s.farmLabel || "",
          district: f.district || lot?.district || "",
          contactPhone: f.contactPhone || lot?.contactPhone || "",
          birdCount: f.birdCount || String(lot?.birdCount ?? s.birdCount ?? ""),
          saleableBirds: f.saleableBirds || String(lot?.saleableBirds ?? s.birdCount ?? ""),
          breedCode: f.breedCode || lot?.breedCode || s.breedCode || "",
          avgWeightKg: f.avgWeightKg || String(lot?.avgWeightKg ?? s.avgWeightKg ?? ""),
          expectedWeightKg: f.expectedWeightKg || String(lot?.expectedWeightKg ?? s.expectedWeightKg ?? ""),
          readyFrom: f.readyFrom || String(lot?.readyFrom || s.readyFrom || "").slice(0, 10),
          readyTo: f.readyTo || String(lot?.readyTo || s.readyTo || "").slice(0, 10),
          askPricePerKg: f.askPricePerKg || (lot?.askPricePerKg != null ? String(lot.askPricePerKg) : ""),
        }));
      } catch {
        /* leave draft */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, allowed, draft.mode, draft.flockId]);

  function switchMode(next: ScoutMode) {
    if (next === "managed" && !flockId && !draft.flockId) {
      showToast("info", "Select an active flock in the field header first.");
      return;
    }
    setDraft((d) => ({ ...d, mode: next, flockId: next === "managed" ? flockId || d.flockId : d.flockId }));
    const nextParams = new URLSearchParams(params);
    nextParams.set("mode", next);
    if (next === "managed" && (flockId || draft.flockId)) {
      nextParams.set("flockId", flockId || draft.flockId);
    }
    setSearchParams(nextParams, { replace: true });
  }

  if (!allowed) {
    return <p className="p-4 text-sm text-[var(--text-muted)]">You do not have permission to scout inventory.</p>;
  }

  async function ensureFarm() {
    if (profile) return profile;
    if (draft.mode === "managed") return null;
    const created = await createScoutFarm(token, {
      displayName: draft.displayName,
      district: draft.district,
      locationLabel: draft.locationLabel,
      contactPhone: draft.contactPhone,
      story: draft.story,
    });
    setProfile(created.profile);
    setDraft((d) => ({ ...d, farmProfileId: created.profile.id }));
    return created.profile;
  }

  async function submit() {
    if (!token || busy) return;
    if (!draft.district.trim() || !draft.birdCount || !draft.readyFrom || !draft.readyTo) {
      showToast("error", "District, birds, and ready window are required.");
      setStep("lot");
      return;
    }
    if (draft.mode === "offplatform" && !draft.displayName.trim()) {
      showToast("error", "Farm name is required for off-platform scouts.");
      setStep("farm");
      return;
    }
    setBusy(true);
    try {
      const farm = await ensureFarm();
      const lotRes = await scoutPipelineLot(token, {
        flockId: draft.mode === "managed" ? draft.flockId || flockId : null,
        farmLabel: draft.displayName || null,
        contactPhone: draft.contactPhone || null,
        district: draft.district.trim(),
        birdCount: Number(draft.birdCount),
        saleableBirds: draft.saleableBirds ? Number(draft.saleableBirds) : Number(draft.birdCount),
        breedCode: draft.breedCode || null,
        avgWeightKg: draft.avgWeightKg ? Number(draft.avgWeightKg) : null,
        expectedWeightKg: draft.expectedWeightKg ? Number(draft.expectedWeightKg) : null,
        readyFrom: draft.readyFrom,
        readyTo: draft.readyTo,
        askPricePerKg: draft.askPricePerKg ? Number(draft.askPricePerKg) : null,
        farmerCanSlaughter: draft.farmerCanSlaughter,
        deliveryAvailable: draft.deliveryAvailable,
        notes: draft.lotNotes || draft.visitNotes || null,
        farmProfileId: farm?.id || draft.farmProfileId || null,
      });
      if (farm) {
        await recordScoutVisit(token, farm.id, {
          notes: draft.visitNotes,
          consentRecorded: draft.consentRecorded,
          consentName: draft.consentName || (fieldScout ? draft.displayName : ""),
          consentPhone: draft.consentPhone || (fieldScout ? draft.contactPhone : ""),
          lotId: lotRes.lot.id,
        });
        try {
          const invite = await inviteScoutFarm(token, farm.id, {
            email: inviteEmail || undefined,
            phone: draft.contactPhone || undefined,
          });
          saveScoutInvite(farm.id, {
            url: invite.url,
            emailSent: invite.emailSent,
            emailError: invite.emailError,
            farmName: draft.displayName,
            birdCount: draft.birdCount,
            readyFrom: draft.readyFrom,
            readyTo: draft.readyTo,
            consentRecorded: draft.consentRecorded,
          });
        } catch (inviteErr) {
          saveScoutInvite(farm.id, {
            url: "",
            emailSent: false,
            emailError: inviteErr instanceof Error ? inviteErr.message : "Could not create an invite link.",
            farmName: draft.displayName,
          });
        }
      }
      clearScoutDraft();
      showToast("success", "Visit submitted for review");
      if (farm) {
        navigate(companyHref(`/farm/pipeline/scout/handoff?farmId=${encodeURIComponent(farm.id)}`));
      } else {
        navigate(
          fieldScout
            ? companyHref("/farm/pipeline/home")
            : companyHref(fieldRoute("/dashboard/vet", draft.flockId || flockId || null))
        );
      }
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Scout failed");
    } finally {
      setBusy(false);
    }
  }

  if (fieldScout) {
    function loadSeller(farm: ScoutFarmRow) {
      setProfile(farm);
      setDraft((d) => ({
        ...d,
        mode: "offplatform",
        farmProfileId: farm.id,
        displayName: farm.displayName || "",
        district: farm.district || "",
        locationLabel: farm.locationLabel || "",
        contactPhone: farm.contactPhone || "",
        birdCount: farm.birdCount ? String(farm.birdCount) : "",
        readyFrom: String(farm.readyFrom || "").slice(0, 10),
        readyTo: String(farm.readyTo || "").slice(0, 10),
      }));
    }

    function sellerGate(farm: ScoutFarmRow): "wait" | "flock" | "visit" | "ready" {
      if (farm.verificationStatus !== "verified") return "wait";
      if (!farm.lotId) return "flock";
      if (!farm.scoutConfirmedAt) return "visit";
      return "ready";
    }

    async function submitSeller() {
      if (!draft.displayName.trim() || !draft.district.trim()) {
        showToast("error", "Name and district are required.");
        return;
      }
      setBusy(true);
      try {
        await createScoutFarm(token, {
          displayName: draft.displayName,
          district: draft.district,
          locationLabel: draft.locationLabel,
          contactPhone: draft.contactPhone,
        });
        clearScoutDraft();
        setDraft(() => emptyScoutDraft({ mode: "offplatform" }));
        showToast("success", "Seller sent for approval");
        setKnownSellers(null);
        setTask(null);
      } catch (e) {
        showToast("error", e instanceof Error ? e.message : "Could not add seller");
      } finally {
        setBusy(false);
      }
    }

    async function submitFlock() {
      if (!draft.farmProfileId || !draft.district.trim() || !draft.birdCount || !draft.readyFrom || !draft.readyTo) {
        showToast("error", "Birds and ready dates are required.");
        return;
      }
      setBusy(true);
      try {
        await scoutPipelineLot(token, {
          flockId: null,
          farmLabel: draft.displayName || null,
          contactPhone: draft.contactPhone || null,
          district: draft.district.trim(),
          birdCount: Number(draft.birdCount),
          saleableBirds: Number(draft.birdCount),
          avgWeightKg: draft.avgWeightKg ? Number(draft.avgWeightKg) : null,
          readyFrom: draft.readyFrom,
          readyTo: draft.readyTo,
          askPricePerKg: draft.askPricePerKg ? Number(draft.askPricePerKg) : null,
          farmerCanSlaughter: draft.farmerCanSlaughter,
          deliveryAvailable: draft.deliveryAvailable,
          farmProfileId: draft.farmProfileId,
        });
        showToast("success", "Flock added");
        setKnownSellers(null);
        setTask(null);
      } catch (e) {
        showToast("error", e instanceof Error ? e.message : "Could not add flock");
      } finally {
        setBusy(false);
      }
    }

    async function submitVisit() {
      if (!draft.farmProfileId) return;
      setBusy(true);
      try {
        await recordScoutVisit(token, draft.farmProfileId, {
          notes: draft.visitNotes,
          consentRecorded: draft.consentRecorded,
          consentName: draft.displayName,
          consentPhone: draft.contactPhone,
          lotId: profile && "lotId" in profile ? (profile as ScoutFarmRow).lotId : null,
        });
        showToast("success", "Visit recorded");
        setKnownSellers(null);
        setTask(null);
      } catch (e) {
        showToast("error", e instanceof Error ? e.message : "Could not record visit");
      } finally {
        setBusy(false);
      }
    }

    const backRow = (label: string, onNext: () => void) => (
      <div className="grid grid-cols-[7rem_1fr] gap-2">
        <Button type="button" variant="secondary" className="min-h-12" onClick={() => setTask(null)}>
          Back
        </Button>
        <Button type="button" className="min-h-12" disabled={busy} onClick={onNext}>
          {busy ? "Sending…" : label}
        </Button>
      </div>
    );

    if (task === "seller") {
      return (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-4 pb-6">
          <h1 className="sr-only">New seller</h1>
          <Field label="Name">
            <Input value={draft.displayName} onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))} />
          </Field>
          <Field label="Phone">
            <Input value={draft.contactPhone} onChange={(e) => setDraft((d) => ({ ...d, contactPhone: e.target.value }))} />
          </Field>
          <DistrictSelect layout="stack" value={draft.district} onChange={(district) => setDraft((d) => ({ ...d, district }))} />
          <Field label="Place">
            <Input value={draft.locationLabel} onChange={(e) => setDraft((d) => ({ ...d, locationLabel: e.target.value }))} />
          </Field>
          {backRow("Send for approval", () => void submitSeller())}
        </div>
      );
    }

    if (task === "flock") {
      return (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-4 pb-6">
          <h1 className="sr-only">Add flock</h1>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{draft.displayName}</p>
          <Field label="Birds">
            <Input type="number" value={draft.birdCount} onChange={(e) => setDraft((d) => ({ ...d, birdCount: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ready from">
              <Input type="date" value={draft.readyFrom} onChange={(e) => setDraft((d) => ({ ...d, readyFrom: e.target.value }))} />
            </Field>
            <Field label="Ready to">
              <Input type="date" value={draft.readyTo} onChange={(e) => setDraft((d) => ({ ...d, readyTo: e.target.value }))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Avg kg">
              <Input type="number" step="0.1" value={draft.avgWeightKg} onChange={(e) => setDraft((d) => ({ ...d, avgWeightKg: e.target.value }))} />
            </Field>
            <Field label="RWF/kg">
              <Input type="number" value={draft.askPricePerKg} onChange={(e) => setDraft((d) => ({ ...d, askPricePerKg: e.target.value }))} />
            </Field>
          </div>
          <Checkbox
            label="Can slaughter"
            checked={draft.farmerCanSlaughter}
            onChange={(e) => setDraft((d) => ({ ...d, farmerCanSlaughter: e.target.checked }))}
          />
          <Checkbox
            label="Can deliver"
            checked={draft.deliveryAvailable}
            onChange={(e) => setDraft((d) => ({ ...d, deliveryAvailable: e.target.checked }))}
          />
          {profile ? (
            <MarketPhotoField token={token} ownerType="farm_profile" ownerId={profile.id} media={media} onChange={setMedia} />
          ) : null}
          {backRow("Add flock", () => void submitFlock())}
        </div>
      );
    }

    if (task === "visit") {
      return (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-4 pb-6">
          <h1 className="sr-only">Visit</h1>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {draft.displayName}
            {draft.birdCount ? ` · ${draft.birdCount} birds` : ""}
          </p>
          <Field label="What you saw">
            <Textarea value={draft.visitNotes} onChange={(e) => setDraft((d) => ({ ...d, visitNotes: e.target.value }))} rows={4} />
          </Field>
          {profile ? (
            <MarketPhotoField token={token} ownerType="farm_profile" ownerId={profile.id} media={media} onChange={setMedia} />
          ) : null}
          <Checkbox
            label="Ready to sell"
            checked={draft.consentRecorded}
            onChange={(e) => setDraft((d) => ({ ...d, consentRecorded: e.target.checked }))}
          />
          {backRow("Record visit", () => void submitVisit())}
        </div>
      );
    }

    const sellers = knownSellers ?? [];
    const flockTasks = sellers.filter((farm) => sellerGate(farm) === "flock");
    const visitTasks = sellers.filter((farm) => sellerGate(farm) === "visit");
    const waiting = sellers.filter((farm) => sellerGate(farm) === "wait").length;

    function openTask(farm: ScoutFarmRow, gate: "flock" | "visit") {
      loadSeller(farm);
      setTask(gate);
    }

    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3 pb-6">
        <h1 className="sr-only">Find</h1>
        <button
          type="button"
          className="flex min-h-[4.5rem] w-full items-center gap-3 rounded-2xl bg-[var(--primary-color)] px-4 py-3 text-left text-white shadow-[var(--shadow-sm)]"
          onClick={() => {
            setProfile(null);
            setDraft(() => emptyScoutDraft({ mode: "offplatform" }));
            setTask("seller");
          }}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <UserPlus className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">New seller</span>
            <span className="block text-sm text-white/80">
              {waiting > 0 ? `${waiting} waiting for approval` : "Name, phone, and place"}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-white/80" aria-hidden />
        </button>

        <TaskQueue
          id="flocks"
          icon={<Bird className="h-5 w-5" aria-hidden />}
          title="Add a flock"
          count={knownSellers == null ? null : flockTasks.length}
          empty="After a seller is approved"
          farms={flockTasks}
          onOpen={(farm) => openTask(farm, "flock")}
        />
        <TaskQueue
          id="visits"
          icon={<MapPin className="h-5 w-5" aria-hidden />}
          title="Visit"
          count={knownSellers == null ? null : visitTasks.length}
          empty="After a flock is added"
          farms={visitTasks}
          detail={(farm) => (farm.birdCount ? `${farm.birdCount} birds` : farm.district || "Flock")}
          onOpen={(farm) => openTask(farm, "visit")}
        />
      </div>
    );
  }

  const idx = STEPS.indexOf(step);
  const forecast = formatForecast(
    Number(draft.birdCount) || 0,
    Number(draft.avgWeightKg || draft.expectedWeightKg) || 0,
    Number(draft.askPricePerKg) || 0
  );

  return (
    <FieldLogSheet
      title={fieldScout ? "Record a visit" : "Scout visit"}
      backLabel="Back"
      onBack={() => navigate(-1)}
      submitLabel={step === "review" ? (fieldScout ? "Send for approval" : "Submit to pipeline") : "Continue"}
      submittingLabel="Submitting…"
      busy={busy}
      showAccount={false}
      hideTitle={fieldScout}
      onSubmit={() => {
        if (step !== "review") {
          setStep(STEPS[Math.min(idx + 1, STEPS.length - 1)]);
          return;
        }
        void submit();
      }}
    >
      <div className="space-y-3">
        {scoutDraftIsUseful(draft) ? (
          <p className="type-caption text-[var(--status-warning)]">Draft saved on this phone.</p>
        ) : null}
        <SegmentedControl
          value={step}
          onChange={(v) => setStep(v as Step)}
          options={STEPS.map((s) => ({
            value: s,
            label: fieldScout
              ? { farm: "Seller", visit: "Visit", consent: "Consent", lot: "Flock", review: "Review" }[s]
              : s[0].toUpperCase() + s.slice(1),
          }))}
        />

        {step === "farm" ? (
          <>
            {fieldScout ? null : (
              <Field label="Scout type">
                <SegmentedControl
                  value={draft.mode}
                  onChange={(v) => switchMode(v as ScoutMode)}
                  options={[
                    { value: "managed", label: "Cleva flock" },
                    { value: "offplatform", label: "Off-platform" },
                  ]}
                />
              </Field>
            )}
            <Field label={fieldScout ? "Seller name" : "Farm name"}>
              <Input value={draft.displayName} onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))} />
            </Field>
            <DistrictSelect value={draft.district} onChange={(district) => setDraft((d) => ({ ...d, district }))} />
            <Field label="Approximate location">
              <Input value={draft.locationLabel} onChange={(e) => setDraft((d) => ({ ...d, locationLabel: e.target.value }))} />
            </Field>
            <Field label="Seller phone">
              <Input value={draft.contactPhone} onChange={(e) => setDraft((d) => ({ ...d, contactPhone: e.target.value }))} />
            </Field>
          </>
        ) : null}

        {step === "visit" ? (
          <>
            <Field label="Visit notes">
              <Textarea value={draft.visitNotes} onChange={(e) => setDraft((d) => ({ ...d, visitNotes: e.target.value }))} rows={4} />
            </Field>
            {fieldScout ? (
              <p className="type-caption text-[var(--text-muted)]">
                Add photos of the birds and the place. A manager reviews the visit and the listing before buyers can see it.
              </p>
            ) : null}
            {profile ? (
              <MarketPhotoField token={token} ownerType="farm_profile" ownerId={profile.id} media={media} onChange={setMedia} />
            ) : (
              <Button type="button" variant="secondary" onClick={() => void ensureFarm().catch((e) => showToast("error", e instanceof Error ? e.message : "Could not create farm"))}>
                {fieldScout ? "Add flock photos" : "Create farm record to add photos"}
              </Button>
            )}
          </>
        ) : null}

        {step === "consent" ? (
          <>
            <Checkbox
              label={fieldScout ? "Seller agreed this visit and listing can be reviewed" : "Farmer agreed this visit can be recorded"}
              checked={draft.consentRecorded}
              onChange={(e) => setDraft((d) => ({ ...d, consentRecorded: e.target.checked }))}
            />
            <Field label="Consent name">
              <Input value={draft.consentName} onChange={(e) => setDraft((d) => ({ ...d, consentName: e.target.value }))} />
            </Field>
            <Field label="Consent phone">
              <Input value={draft.consentPhone} onChange={(e) => setDraft((d) => ({ ...d, consentPhone: e.target.value }))} />
            </Field>
            <Field label="Seller email (optional)">
              <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} autoComplete="email" />
            </Field>
            <p className="type-caption text-[var(--text-muted)]">
              {fieldScout
                ? "You can share a link or QR even without an email. The flock stays off the market until the seller agrees and a manager approves it."
                : "You can share an invite link or QR even when there is no email. The flock stays private until the seller consents and Cleva verifies it."}
            </p>
          </>
        ) : null}

        {step === "lot" ? (
          <>
            <Field label="Birds">
              <Input type="number" value={draft.birdCount} onChange={(e) => setDraft((d) => ({ ...d, birdCount: e.target.value }))} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Ready from">
                <Input type="date" value={draft.readyFrom} onChange={(e) => setDraft((d) => ({ ...d, readyFrom: e.target.value }))} />
              </Field>
              <Field label="Ready to">
                <Input type="date" value={draft.readyTo} onChange={(e) => setDraft((d) => ({ ...d, readyTo: e.target.value }))} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Avg kg">
                <Input type="number" step="0.1" value={draft.avgWeightKg} onChange={(e) => setDraft((d) => ({ ...d, avgWeightKg: e.target.value }))} />
              </Field>
              <Field label="Ask RWF/kg">
                <Input type="number" value={draft.askPricePerKg} onChange={(e) => setDraft((d) => ({ ...d, askPricePerKg: e.target.value }))} />
              </Field>
            </div>
            <Checkbox
              label="Slaughter available"
              checked={draft.farmerCanSlaughter}
              onChange={(e) => setDraft((d) => ({ ...d, farmerCanSlaughter: e.target.checked }))}
            />
            <Checkbox
              label="Delivery available"
              checked={draft.deliveryAvailable}
              onChange={(e) => setDraft((d) => ({ ...d, deliveryAvailable: e.target.checked }))}
            />
          </>
        ) : null}

        {step === "review" ? (
          <div className="space-y-2 rounded-lg border border-[var(--border-color)] p-card">
            <p className="type-title">{draft.displayName || "Farm"} · {draft.district}</p>
            <p className="type-body">{draft.birdCount || "0"} birds · {draft.readyFrom} – {draft.readyTo}</p>
            <p className="type-caption text-[var(--text-muted)]">
              {fieldScout
                ? `Most of your pay comes if this flock sells. About ${forecast} RWF at the current sale rate, which your manager sets.`
                : `Could earn ~ ${forecast} RWF if this lot delivers at 2%.`}
            </p>
            <p className="type-caption">
              {draft.consentRecorded
                ? fieldScout
                  ? "Seller agreed. Send this for approval so it can go on the market."
                  : "Consent recorded"
                : "No consent yet — stays private"}
            </p>
          </div>
        ) : null}
      </div>
    </FieldLogSheet>
  );
}

function TaskQueue({
  id,
  icon,
  title,
  count,
  empty,
  farms,
  detail,
  onOpen,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  count: number | null;
  empty: string;
  farms: ScoutFarmRow[];
  detail?: (farm: ScoutFarmRow) => string;
  onOpen: (farm: ScoutFarmRow) => void;
}) {
  const open = (count ?? 0) > 0;
  return (
    <section id={id} className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)]">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            open ? "bg-[var(--primary-color-soft)] text-[var(--primary-color)]" : "bg-[var(--surface-subtle)] text-[var(--text-muted)]"
          }`}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-[var(--text-primary)]">{title}</span>
          <span className="block text-sm text-[var(--text-muted)]">{open ? "Ready now" : empty}</span>
        </span>
        <span className={`text-3xl font-semibold tabular-nums leading-none ${open ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>
          {count == null ? "—" : count}
        </span>
      </div>
      {farms.length > 0 ? (
        <ul className="border-t border-[var(--border-color)]">
          {farms.map((farm) => (
            <li key={farm.id} className="border-b border-[var(--border-color)] last:border-b-0">
              <button
                type="button"
                className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
                onClick={() => onOpen(farm)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[var(--text-primary)]">{farm.displayName}</span>
                  <span className="block text-sm text-[var(--text-muted)]">
                    {detail ? detail(farm) : farm.district || "No district"}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-[var(--text-muted)]" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
