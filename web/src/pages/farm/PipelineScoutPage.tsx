import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  inviteScoutFarm,
  recordScoutVisit,
  scoutPipelineLot,
  type FarmProfile,
  type MarketMedia,
} from "../../api/pipeline.api";
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
  const navigate = useNavigate();
  const { showToast } = useToast();
  const allowed = canScoutPipeline(user);

  const weighLotId = params.get("lotId");
  useEffect(() => {
    if (weighLotId) {
      navigate(companyHref(`/farm/pipeline/weigh/${weighLotId}`), { replace: true });
    }
  }, [weighLotId, navigate, companyHref]);

  const flockId = params.get("flockId") || activeFlockId || "";
  const modeFromUrl: ScoutMode =
    params.get("mode") === "offplatform" && !flockId
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
    if (!token) return;
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
          consentName: draft.consentName,
          consentPhone: draft.consentPhone,
          lotId: lotRes.lot.id,
        });
        if (inviteEmail) {
          await inviteScoutFarm(token, farm.id, { email: inviteEmail, phone: draft.contactPhone });
        }
      }
      clearScoutDraft();
      showToast("success", "Visit submitted for review");
      navigate(companyHref(fieldRoute("/dashboard/vet", draft.flockId || flockId || null)));
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Scout failed");
    } finally {
      setBusy(false);
    }
  }

  const idx = STEPS.indexOf(step);
  const forecast = formatForecast(
    Number(draft.birdCount) || 0,
    Number(draft.avgWeightKg || draft.expectedWeightKg) || 0,
    Number(draft.askPricePerKg) || 0
  );

  return (
    <FieldLogSheet
      title="Scout visit"
      backLabel="Back"
      onBack={() => navigate(-1)}
      submitLabel={step === "review" ? "Submit to pipeline" : "Continue"}
      submittingLabel="Submitting…"
      busy={busy}
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
          options={STEPS.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))}
        />

        {step === "farm" ? (
          <>
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
            <Field label="Farm name">
              <Input value={draft.displayName} onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))} />
            </Field>
            <DistrictSelect value={draft.district} onChange={(district) => setDraft((d) => ({ ...d, district }))} />
            <Field label="Approximate location">
              <Input value={draft.locationLabel} onChange={(e) => setDraft((d) => ({ ...d, locationLabel: e.target.value }))} />
            </Field>
            <Field label="Farmer phone">
              <Input value={draft.contactPhone} onChange={(e) => setDraft((d) => ({ ...d, contactPhone: e.target.value }))} />
            </Field>
          </>
        ) : null}

        {step === "visit" ? (
          <>
            <Field label="Visit notes">
              <Textarea value={draft.visitNotes} onChange={(e) => setDraft((d) => ({ ...d, visitNotes: e.target.value }))} rows={4} />
            </Field>
            {profile ? (
              <MarketPhotoField token={token} ownerType="farm_profile" ownerId={profile.id} media={media} onChange={setMedia} />
            ) : (
              <Button type="button" variant="secondary" onClick={() => void ensureFarm().catch((e) => showToast("error", e instanceof Error ? e.message : "Could not create farm"))}>
                Create farm record to add photos
              </Button>
            )}
          </>
        ) : null}

        {step === "consent" ? (
          <>
            <Checkbox
              label="Farmer agreed this visit can be recorded"
              checked={draft.consentRecorded}
              onChange={(e) => setDraft((d) => ({ ...d, consentRecorded: e.target.checked }))}
            />
            <Field label="Consent name">
              <Input value={draft.consentName} onChange={(e) => setDraft((d) => ({ ...d, consentName: e.target.value }))} />
            </Field>
            <Field label="Consent phone">
              <Input value={draft.consentPhone} onChange={(e) => setDraft((d) => ({ ...d, consentPhone: e.target.value }))} />
            </Field>
            <Field label="Invite farmer email">
              <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            </Field>
            <p className="type-caption text-[var(--text-muted)]">
              The farm stays private until the farmer claims it, consents, and Cleva verifies.
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
              Could earn ~ {forecast} RWF if this lot delivers at 2%.
            </p>
            <p className="type-caption">{draft.consentRecorded ? "Consent recorded" : "No consent yet — stays private"}</p>
          </div>
        ) : null}
      </div>
    </FieldLogSheet>
  );
}
