import { useCallback, useEffect, useMemo, useState } from "react";
import { MarketPageHead } from "../../components/layout/MarketAppHeader";
import {
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  PageTabs,
  Select,
  StatusPill,
  Textarea,
} from "../../components/ui";
import { useAuth } from "../../auth/AuthContext";
import { canListFarmerMarketLots, isMarketOnlySeller } from "../../auth/permissions";
import { useToast } from "../../components/Toast";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { DistrictSelect } from "../../components/DistrictSelect";
import { ListingPreview } from "../../components/market/ListingPreview";
import { ListBirdsSheet } from "../../components/market/ListBirdsSheet";
import { MarketPhotoField } from "../../components/market/MarketPhotoField";
import { listingPhaseCopy, sellingWeekLabel, visitBeforeLabel } from "../../lib/sellingWeek";
import {
  cancelFarmerListing,
  createFarmerListing,
  fetchFarmProfile,
  fetchLotBookings,
  fetchMarketJobs,
  fetchMarketMe,
  fetchMyListings,
  publishFarmProfile,
  claimFarmProfile,
  saveFarmProfile,
  setFarmConsent,
  updateFarmerListing,
  type FarmAnalytics,
  type FarmProfile,
  type FulfillmentJob,
  type LotBooking,
  type MarketMedia,
  type PipelineLot,
} from "../../api/pipeline.api";
import { FulfillmentCard } from "../../components/market/FulfillmentCard";
import { FarmerMoneySplitView } from "../../components/market/MoneySplit";
import { useOptionalMarketLocale } from "../../context/MarketLocaleContext";
import { storeT } from "../../lib/publicStoreCopy";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import {
  publicListingPreview,
  previewDisclosureLines,
  type FarmPreviewInput,
  type ListingPreviewInput,
  type VisibilityTier,
} from "../../lib/marketVisibility";

function formatDay(d: string | null | undefined) {
  if (!d) return "?";
  return String(d).slice(0, 10);
}

type ListingForm = {
  birdCount: string;
  district: string;
  readyFrom: string;
  readyTo: string;
  avgWeightKg: string;
  askPricePerKg: string;
  contactPhone: string;
  publicTitle: string;
  publicStory: string;
  visibilityTier: VisibilityTier;
  farmerCanSlaughter: boolean;
  deliveryAvailable: boolean;
};

const emptyForm = (): ListingForm => ({
  birdCount: "",
  district: "",
  readyFrom: "",
  readyTo: "",
  avgWeightKg: "",
  askPricePerKg: "",
  contactPhone: "",
  publicTitle: "",
  publicStory: "",
  visibilityTier: "brokered_public",
  farmerCanSlaughter: true,
  deliveryAvailable: false,
});

function formFromLot(lot: PipelineLot): ListingForm {
  return {
    birdCount: String(lot.birdCount ?? ""),
    district: lot.district || "",
    readyFrom: formatDay(lot.readyFrom),
    readyTo: formatDay(lot.readyTo),
    avgWeightKg: lot.avgWeightKg != null ? String(lot.avgWeightKg) : "",
    askPricePerKg: lot.askPricePerKg != null ? String(lot.askPricePerKg) : "",
    contactPhone: lot.contactPhone || "",
    publicTitle: lot.publicTitle || "",
    publicStory: lot.publicStory || "",
    visibilityTier: (lot.visibilityTier as VisibilityTier) || "brokered_public",
    farmerCanSlaughter: lot.farmerCanSlaughter,
    deliveryAvailable: lot.deliveryAvailable,
  };
}

function ListingFormFields({
  form,
  setForm,
}: {
  form: ListingForm;
  setForm: (fn: (f: ListingForm) => ListingForm) => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="Public title">
        <Input value={form.publicTitle} onChange={(e) => setForm((f) => ({ ...f, publicTitle: e.target.value }))} />
      </Field>
      <Field label="Birds">
        <Input type="number" value={form.birdCount} onChange={(e) => setForm((f) => ({ ...f, birdCount: e.target.value }))} />
      </Field>
      <DistrictSelect value={form.district} onChange={(district) => setForm((f) => ({ ...f, district }))} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Selling week from">
          <Input type="date" value={form.readyFrom} onChange={(e) => setForm((f) => ({ ...f, readyFrom: e.target.value }))} />
        </Field>
        <Field label="Selling week to">
          <Input type="date" value={form.readyTo} onChange={(e) => setForm((f) => ({ ...f, readyTo: e.target.value }))} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Avg kg">
          <Input type="number" step="0.1" value={form.avgWeightKg} onChange={(e) => setForm((f) => ({ ...f, avgWeightKg: e.target.value }))} />
        </Field>
        <Field label="Ask RWF/kg">
          <Input type="number" value={form.askPricePerKg} onChange={(e) => setForm((f) => ({ ...f, askPricePerKg: e.target.value }))} />
        </Field>
      </div>
      <Field label="Visibility">
        <Select
          value={form.visibilityTier}
          onChange={(e) => setForm((f) => ({ ...f, visibilityTier: e.target.value as VisibilityTier }))}
        >
          <option value="brokered_public">Anonymous public card</option>
          <option value="profile_public">Show my farm storefront</option>
          <option value="verified_buyers">Verified buyers only</option>
        </Select>
      </Field>
      <Field label="Story">
        <Textarea value={form.publicStory} onChange={(e) => setForm((f) => ({ ...f, publicStory: e.target.value }))} rows={3} />
      </Field>
      <Checkbox
        label="Processing available"
        checked={form.farmerCanSlaughter}
        onChange={(e) => setForm((f) => ({ ...f, farmerCanSlaughter: e.target.checked }))}
      />
      <Checkbox
        label="Delivery available"
        checked={form.deliveryAvailable}
        onChange={(e) => setForm((f) => ({ ...f, deliveryAvailable: e.target.checked }))}
      />
      <Field label="Contact phone">
        <Input value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} />
      </Field>
    </div>
  );
}

export function MarketListingsPage() {
  const { token, user } = useAuth();
  const locale = useOptionalMarketLocale()?.locale || "en";
  const { companyHref } = useCompanyNav();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { showToast } = useToast();
  const allowed = canListFarmerMarketLots(user);
  const tab =
    params.get("tab") === "storefront" ? "storefront" : params.get("tab") === "jobs" ? "jobs" : "listings";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lots, setLots] = useState<PipelineLot[]>([]);
  const [profile, setProfile] = useState<FarmProfile | null>(null);
  const [media, setMedia] = useState<MarketMedia[]>([]);
  const [analytics, setAnalytics] = useState<FarmAnalytics | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editLot, setEditLot] = useState<PipelineLot | null>(null);
  const [bookingsLot, setBookingsLot] = useState<PipelineLot | null>(null);
  const [bookings, setBookings] = useState<LotBooking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [jobs, setJobs] = useState<FulfillmentJob[]>([]);
  const [cancelLot, setCancelLot] = useState<PipelineLot | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<ListingForm>(emptyForm);
  const [storefront, setStorefront] = useState({
    displayName: "",
    district: "",
    locationLabel: "",
    story: "",
    specialties: "",
    contactPhone: "",
    discloseContact: false,
    discloseExactLocation: false,
    discloseExactPrice: false,
    slaughterAvailable: false,
    deliveryAvailable: false,
  });

  const reload = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const me = await fetchMarketMe(token);
      if (me.accountType === "farmer" && me.verificationStatus !== "verified") {
        navigate(companyHref("/market/pending"), { replace: true });
        return;
      }
      const [listRes, prof, jobsRes] = await Promise.all([
        fetchMyListings(token),
        fetchFarmProfile(token).catch(() => ({ profile: null, media: [], analytics: null })),
        fetchMarketJobs(token).catch(() => ({ jobs: [] as FulfillmentJob[] })),
      ]);
      setLots(listRes.lots);
      setJobs(jobsRes.jobs || []);
      setProfile(prof.profile);
      setMedia(prof.media || []);
      setAnalytics(prof.analytics);
      if (prof.profile) {
        setStorefront({
          displayName: prof.profile.displayName || "",
          district: prof.profile.district || "",
          locationLabel: prof.profile.locationLabel || "",
          story: prof.profile.story || "",
          specialties: (prof.profile.specialties || []).join(", "),
          contactPhone: prof.profile.contactPhone || "",
          discloseContact: prof.profile.discloseContact,
          discloseExactLocation: prof.profile.discloseExactLocation,
          discloseExactPrice: prof.profile.discloseExactPrice,
          slaughterAvailable: prof.profile.slaughterAvailable,
          deliveryAvailable: prof.profile.deliveryAvailable,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load listings";
      if (msg.toLowerCase().includes("verification")) {
        navigate(companyHref("/market/pending"), { replace: true });
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [allowed, token, navigate, companyHref]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const claim = params.get("claim");
    if (!claim || !token || !allowed) return;
    void claimFarmProfile(token, claim)
      .then((r) => {
        setProfile(r.profile);
        showToast("success", "Farm storefront claimed");
        setParams({ tab: "storefront" }, { replace: true });
      })
      .catch((e) => showToast("error", e instanceof Error ? e.message : "Could not claim farm"));
  }, [allowed, params, setParams, showToast, token]);

  const farmPreview: FarmPreviewInput = useMemo(
    () => ({
      displayName: storefront.displayName,
      district: storefront.district,
      locationLabel: storefront.locationLabel,
      story: storefront.story,
      specialties: storefront.specialties.split(",").map((s) => s.trim()).filter(Boolean),
      slaughterAvailable: storefront.slaughterAvailable,
      deliveryAvailable: storefront.deliveryAvailable,
      discloseContact: storefront.discloseContact,
      discloseExactLocation: storefront.discloseExactLocation,
      discloseExactPrice: storefront.discloseExactPrice,
      contactPhone: storefront.contactPhone,
      coverUrl: media.find((m) => m.purpose === "cover")?.secureUrl || media[0]?.secureUrl || null,
      published: profile?.published ?? false,
      consentStatus: profile?.consentStatus ?? "none",
      verificationStatus: profile?.verificationStatus ?? "pending",
    }),
    [storefront, media, profile]
  );

  const listingPreviewInput: ListingPreviewInput = {
    district: form.district || farmPreview.district,
    birds: Number(form.birdCount) || 0,
    readyFrom: form.readyFrom,
    readyTo: form.readyTo,
    avgWeightKg: form.avgWeightKg,
    askPricePerKg: form.askPricePerKg,
    slaughterAvailable: form.farmerCanSlaughter,
    deliveryAvailable: form.deliveryAvailable,
    visibilityTier: form.visibilityTier,
    title: form.publicTitle,
    story: form.publicStory,
    coverUrl: farmPreview.coverUrl,
  };

  async function openBookings(lot: PipelineLot) {
    setBookingsLot(lot);
    setBookings([]);
    setBookingsLoading(true);
    try {
      const res = await fetchLotBookings(token, lot.id);
      setBookings(res.bookings);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not load bookings");
      setBookingsLot(null);
    } finally {
      setBookingsLoading(false);
    }
  }

  async function submitCreate(payload: {
    birdCount: number;
    district: string;
    placementDate: string;
    chicksInRelative: string;
    readyFrom: string;
    readyTo: string;
    contactPhone: string | null;
    avgWeightKg: number;
    askPricePerKg: number | null;
  }) {
    setBusy(true);
    try {
      await createFarmerListing(token, {
        birdCount: payload.birdCount,
        district: payload.district,
        placementDate: payload.placementDate,
        chicksInRelative: payload.chicksInRelative,
        readyFrom: payload.readyFrom,
        readyTo: payload.readyTo,
        contactPhone: payload.contactPhone,
        avgWeightKg: payload.avgWeightKg,
        askPricePerKg: payload.askPricePerKg,
        farmProfileId: profile?.id,
      });
      showToast("success", storeT(locale, "farmerOnTheBook"));
      setCreateOpen(false);
      setForm(emptyForm());
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not list");
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit() {
    if (!editLot) return;
    setBusy(true);
    try {
      const updated = await updateFarmerListing(token, editLot.id, {
        birdCount: Number(form.birdCount),
        district: form.district,
        readyFrom: form.readyFrom,
        readyTo: form.readyTo,
        avgWeightKg: form.avgWeightKg ? Number(form.avgWeightKg) : null,
        askPricePerKg: form.askPricePerKg ? Number(form.askPricePerKg) : null,
        contactPhone: form.contactPhone || null,
        publicTitle: form.publicTitle || null,
        publicStory: form.publicStory || null,
        visibilityTier: form.visibilityTier,
        farmerCanSlaughter: form.farmerCanSlaughter,
        deliveryAvailable: form.deliveryAvailable,
      });
      const pending = updated.lot.verificationStatus === "pending_review";
      showToast("success", pending ? "Saved — listing sent back for review" : "Listing updated");
      setEditLot(null);
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancel() {
    if (!cancelLot) return;
    setBusy(true);
    try {
      await cancelFarmerListing(token, cancelLot.id);
      showToast("success", "Listing cancelled");
      setCancelLot(null);
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not cancel");
    } finally {
      setBusy(false);
    }
  }

  async function saveStorefront() {
    setBusy(true);
    try {
      const saved = await saveFarmProfile(token, {
        ...storefront,
        specialties: storefront.specialties,
      });
      setProfile(saved.profile);
      setMedia(saved.media);
      showToast("success", "Storefront saved");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not save storefront");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return (
      <div className="store-wrap space-y-3 pb-8">
        <MarketPageHead title="My listings" />
        <p className="text-sm text-[var(--store-muted)]">Farmer account required.</p>
      </div>
    );
  }

  const editable = (lot: PipelineLot) =>
    lot.status !== "cancelled" &&
    lot.status !== "matched" &&
    (lot.verificationStatus === "pending_review" ||
      lot.verificationStatus === "verified" ||
      !lot.verificationStatus);

  const t = (key: Parameters<typeof storeT>[1]) => storeT(locale, key);
  const farmName =
    profile?.displayName ||
    (isMarketOnlySeller(user) ? user?.displayName : user?.companyName) ||
    user?.displayName ||
    "Your farm";
  const sellerMeta = [
    farmName,
    profile?.district || storefront.district,
    storefront.contactPhone || profile?.contactPhone,
  ]
    .filter(Boolean)
    .join(" · ");
  const previewLot = lots.find((lot) => lot.status === "open" || lot.status === "partial") || lots[0] || null;
  const listingPreviewFromLot: ListingPreviewInput = previewLot
    ? {
        district: previewLot.district || farmPreview.district,
        birds: previewLot.remainingBirds ?? previewLot.birdCount ?? 0,
        readyFrom: formatDay(previewLot.readyFrom),
        readyTo: formatDay(previewLot.readyTo),
        avgWeightKg: previewLot.avgWeightKg != null ? String(previewLot.avgWeightKg) : "",
        askPricePerKg: previewLot.askPricePerKg != null ? String(previewLot.askPricePerKg) : "",
        slaughterAvailable: previewLot.farmerCanSlaughter,
        deliveryAvailable: previewLot.deliveryAvailable,
        visibilityTier: (previewLot.visibilityTier as VisibilityTier) || "brokered_public",
        title: previewLot.publicTitle || "",
        story: previewLot.publicStory || "",
        coverUrl: farmPreview.coverUrl,
        publicRef: previewLot.publicRef,
      }
    : listingPreviewInput;

  return (
    <div className="store-wrap space-y-4 pb-8">
      <MarketPageHead
        title="My market"
        action={
          tab === "listings" && lots.length > 0 ? (
            <button
              type="button"
              className="store-btn store-btn-ember"
              style={{ minHeight: 40, padding: "0 0.95rem", fontSize: "0.85rem" }}
              onClick={() => {
                setForm(emptyForm());
                setCreateOpen(true);
              }}
            >
              {t("farmerListBirds")}
            </button>
          ) : undefined
        }
      />
      {sellerMeta ? <p className="type-caption text-[var(--store-muted)]">{sellerMeta}</p> : null}
      <div className="hidden md:block">
        <PageTabs
          value={tab}
          onChange={(v) =>
            setParams(v === "listings" ? {} : { tab: v }, { replace: true })
          }
          options={[
            { value: "listings", label: t("farmerNavListings"), badge: lots.length },
            { value: "jobs", label: t("farmerNavOrders"), badge: jobs.filter((j) => j.status === "committed").length },
            { value: "storefront", label: t("farmerNavFarmPage") },
          ]}
        />
      </div>

      {analytics?.totals && lots.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Card className="!p-3">
            <p className="type-caption text-[var(--text-muted)]">Views</p>
            <p className="type-title tabular-nums">{analytics.totals.listingViews + analytics.totals.profileViews}</p>
          </Card>
          <Card className="!p-3">
            <p className="type-caption text-[var(--text-muted)]">Requests</p>
            <p className="type-title tabular-nums">{analytics.totals.requestSubmitted}</p>
          </Card>
          <Card className="!p-3">
            <p className="type-caption text-[var(--text-muted)]">Reservations</p>
            <p className="type-title tabular-nums">{analytics.totals.reservations}</p>
          </Card>
          <Card className="!p-3">
            <p className="type-caption text-[var(--text-muted)]">Consent</p>
            <p className="type-title">{profile?.consentStatus || "none"}</p>
          </Card>
        </div>
      ) : null}

      {loading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : tab === "jobs" ? (
        jobs.length === 0 ? (
          <div className="rounded-2xl border border-[var(--store-line)] bg-[var(--store-card)] p-5">
            <h2 className="font-[var(--font-display)] text-xl font-bold text-[var(--store-ink)]">
              {t("farmerOrdersEmptyTitle")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--store-muted)]">{t("farmerOrdersEmptyBody")}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {jobs.map((job) => (
              <FulfillmentCard
                key={job.id}
                job={job}
                viewer="farmer"
                token={token}
                onChanged={() => void reload()}
              />
            ))}
          </ul>
        )
      ) : tab === "storefront" ? (
        lots.length === 0 ? (
          <div className="rounded-2xl border border-[var(--store-line)] bg-[var(--store-card)] p-5">
            <h2 className="font-[var(--font-display)] text-xl font-bold text-[var(--store-ink)]">
              {t("farmerFarmPageEmptyTitle")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--store-muted)]">{t("farmerFarmPageEmptyBody")}</p>
            <button type="button" className="store-btn store-btn-ember mt-5" onClick={() => setCreateOpen(true)}>
              {t("farmerListBirds")}
            </button>
          </div>
        ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3">
            <Field label="Farm name">
              <Input value={storefront.displayName} onChange={(e) => setStorefront((s) => ({ ...s, displayName: e.target.value }))} />
            </Field>
            <DistrictSelect
              value={storefront.district}
              onChange={(district) => setStorefront((s) => ({ ...s, district }))}
            />
            <Field label="Approximate location">
              <Input value={storefront.locationLabel} onChange={(e) => setStorefront((s) => ({ ...s, locationLabel: e.target.value }))} />
            </Field>
            <Field label="Story">
              <Textarea value={storefront.story} onChange={(e) => setStorefront((s) => ({ ...s, story: e.target.value }))} rows={4} />
            </Field>
            <Field label="Specialties">
              <Input value={storefront.specialties} onChange={(e) => setStorefront((s) => ({ ...s, specialties: e.target.value }))} />
            </Field>
            <Field label="Contact phone">
              <Input value={storefront.contactPhone} onChange={(e) => setStorefront((s) => ({ ...s, contactPhone: e.target.value }))} />
            </Field>
            <Checkbox label="Show contact on storefront" checked={storefront.discloseContact} onChange={(e) => setStorefront((s) => ({ ...s, discloseContact: e.target.checked }))} />
            <Checkbox label="Show exact location" checked={storefront.discloseExactLocation} onChange={(e) => setStorefront((s) => ({ ...s, discloseExactLocation: e.target.checked }))} />
            {profile ? (
              <MarketPhotoField token={token} ownerType="farm_profile" ownerId={profile.id} media={media} onChange={setMedia} />
            ) : (
              <p className="type-caption text-[var(--text-muted)]">Save the storefront first to add photos.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={() => void saveStorefront()}>
                Save storefront
              </Button>
              {profile ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void setFarmConsent(token, { granted: profile.consentStatus !== "granted", consentPhone: storefront.contactPhone })
                      .then((r) => {
                        setProfile(r.profile);
                        showToast("success", r.profile.consentStatus === "granted" ? "Consent recorded" : "Consent revoked");
                      })
                      .catch((e) => showToast("error", e instanceof Error ? e.message : "Consent failed"))
                  }
                >
                  {profile.consentStatus === "granted" ? "Revoke consent" : "Grant consent"}
                </Button>
              ) : null}
              {profile ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void publishFarmProfile(token, !profile.published)
                      .then((r) => {
                        setProfile(r.profile);
                        showToast("success", r.profile.published ? "Published" : "Unpublished");
                      })
                      .catch((e) => showToast("error", e instanceof Error ? e.message : "Publish failed"))
                  }
                >
                  {profile.published ? "Unpublish" : "Publish"}
                </Button>
              ) : null}
            </div>
          </Card>
          <ListingPreview
            lot={publicListingPreview(listingPreviewFromLot, farmPreview)}
            lines={previewDisclosureLines(farmPreview, listingPreviewFromLot)}
            verified={previewLot?.verificationStatus === "verified"}
            showRequest={false}
          />
        </div>
        )
      ) : lots.length === 0 ? (
        <div className="rounded-lg border border-[var(--store-line)] bg-[var(--store-card)] p-5">
          <h2 className="font-[var(--font-display)] text-xl font-bold text-[var(--store-ink)]">
            {t("farmerEmptyTitle")}
          </h2>
          <p className="mt-2 text-sm text-[var(--store-muted)]">{t("farmerEmptyBody")}</p>
          <ol className="mt-4 space-y-2 text-sm text-[var(--store-ink)]">
            <li>1. {t("farmerEmptyHow1")}</li>
            <li>2. {t("farmerEmptyHow2")}</li>
            <li>3. {t("farmerEmptyHow3")}</li>
            <li>4. {t("farmerEmptyHow4")}</li>
          </ol>
          <div className="mt-5">
            <button type="button" className="store-btn store-btn-ember" onClick={() => setCreateOpen(true)}>
              {t("farmerListBirds")}
            </button>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {lots.map((lot) => {
            const stats = analytics?.byLot?.[lot.id];
            const phase = listingPhaseCopy(lot.listingPhase);
            const live = lot.listingPhase === "live";
            return (
              <li key={lot.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">
                        {lot.district || "—"} · {lot.remainingBirds ?? lot.birdCount} birds
                      </p>
                      <p className="type-caption text-[var(--text-muted)]">
                        {lot.sellingWeekLabel || sellingWeekLabel(lot.readyFrom, lot.readyTo)}
                      </p>
                      {lot.listingPhase !== "live" && lot.listingPhase !== "weighed" ? (
                        <p className="type-caption text-[var(--text-secondary)]">
                          {visitBeforeLabel(lot.readyFrom)}
                        </p>
                      ) : null}
                    </div>
                    <StatusPill tone={phase.tone}>{phase.label}</StatusPill>
                  </div>
                  {stats ? (
                    <p className="mt-2 type-caption text-[var(--text-secondary)]">
                      {stats.listingViews} views · {stats.requestSubmitted} requests · {stats.reservations} reservations
                    </p>
                  ) : null}
                  {lot.farmerSplit ? <FarmerMoneySplitView split={lot.farmerSplit} locale={locale} /> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => void openBookings(lot)}>
                      Bookings
                    </Button>
                    {editable(lot) ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setForm(formFromLot(lot));
                          setEditLot(lot);
                        }}
                      >
                        Edit
                      </Button>
                    ) : null}
                    {lot.status !== "cancelled" ? (
                      <Button type="button" size="sm" variant="ghost" onClick={() => setCancelLot(lot)}>
                        Cancel
                      </Button>
                    ) : null}
                    {live ? (
                      <a
                        className="inline-flex min-h-control-sm items-center text-sm font-semibold text-[var(--primary-color)]"
                        href={`/market/lot/${encodeURIComponent(lot.publicRef!)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Share
                      </a>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <ListBirdsSheet
        open={createOpen}
        token={token}
        initialDistrict={profile?.district || storefront.district}
        initialPhone={storefront.contactPhone}
        busy={busy}
        onClose={() => setCreateOpen(false)}
        onSubmit={(payload) => void submitCreate(payload)}
      />

      <Modal
        open={!!editLot}
        onClose={() => setEditLot(null)}
        title="Edit listing"
        footer={
          <Button type="button" disabled={busy} onClick={() => void submitEdit()}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        }
      >
        <ListingFormFields form={form} setForm={setForm} />
        {editLot?.farmerSplit ? (
          <div className="mt-4">
            <FarmerMoneySplitView split={editLot.farmerSplit} locale={locale} />
          </div>
        ) : null}
        {editLot ? (
          <div className="mt-4">
            <MarketPhotoField token={token} ownerType="lot" ownerId={editLot.id} media={[]} onChange={() => undefined} />
          </div>
        ) : null}
      </Modal>

      <Modal open={!!bookingsLot} onClose={() => setBookingsLot(null)} title="Bookings on this lot">
        {bookingsLoading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
        ) : bookings.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No bookings yet.</p>
        ) : (
          <ul className="space-y-3">
            {bookings.map((b) => (
              <FulfillmentCard
                key={b.id}
                job={b}
                viewer="farmer"
                token={token}
                onChanged={() => void openBookings(bookingsLot!)}
              />
            ))}
          </ul>
        )}
      </Modal>

      <ConfirmDialog
        open={!!cancelLot}
        onCancel={() => setCancelLot(null)}
        title="Cancel listing?"
        message={
          cancelLot
            ? `Cancel ${cancelLot.district || "this"} lot (${cancelLot.birdCount} birds)? Only allowed if there are no committed bookings.`
            : ""
        }
        confirmLabel="Cancel listing"
        loading={busy}
        onConfirm={() => void confirmCancel()}
      />
    </div>
  );
}
