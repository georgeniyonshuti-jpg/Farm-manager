import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPipelineDesk, canWorkRecruitment } from "../../auth/permissions";
import { PageHeader } from "../../components/PageHeader";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { DistrictSelect } from "../../components/DistrictSelect";
import { Button, Field, Input, ListBackLink, SectionCard, SegmentedControl, Select, StatusPill, TextLink } from "../../components/ui";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import {
  addRecruitmentTouch,
  decideRecruitmentContact,
  fetchRecruitmentContact,
  fetchRecruitmentArea,
  patchRecruitmentContact,
  submitRecruitmentKyc,
  type RecruitmentContact,
  type RecruitmentTouch,
} from "../../api/marketInsights.api";
import { placeLabel } from "./flockDesk";
import {
  approvalGaps,
  kycSendBlocked,
  listingState,
  liveSellerWarning,
  personDeskMode,
  personDeskTitle,
  predictDecision,
  predictDesk,
  stageActions,
  stageLabel,
  statusLabel,
  contractBadgeLabel,
  statusesForStage,
  superuserStageChoices,
  wantLabel,
  PEOPLE_WANTS,
  type PersonDeskMode,
  type StageAction,
  type StageActionId,
} from "./people/peopleWork";
import { beginMove, finishMove, isCardMoving, rollbackMove } from "./people/recruitmentBoard";
import { CallScript } from "./people/CallScript";
import { KycPanel } from "./people/KycPanel";

const EMPTY_CALL = {
  outcome: "reached",
  locationConfirmed: "",
  locationCorrected: "",
  ownsBroilers: "",
  birdType: "broiler",
  quantityMin: "",
  quantityMax: "",
  flockSize: "",
  readyInWeeks: "",
  canSlaughter: "",
  canDeliver: "",
  deliveryRequired: "",
  farmsKnown: "",
  challenges: "",
  nextAction: "",
  note: "",
  scheduledFor: "",
  needsFollowUp: false,
  understoodNext: "",
  buyerFor: "",
  birdReady: "",
  willVisit: "",
  speakingWithThem: "",
  whoAnswered: "",
};

const EMPTY_DETAILS = { name: "", phone: "", email: "", district: "", sector: "" };

export function PersonPage() {
  const { contactId = "" } = useParams();
  const { token, user } = useAuth();
  const { companyHref } = useCompanyNav();
  const { showToast } = useToast();
  const allowed = canWorkRecruitment(user);
  const canReviewKyc = canAccessPipelineDesk(user);
  const canMoveStage = user?.role === "superuser";
  const [moveTo, setMoveTo] = useState("");
  const [moveStatus, setMoveStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contact, setContact] = useState<RecruitmentContact | null>(null);
  const [touches, setTouches] = useState<RecruitmentTouch[]>([]);
  const [call, setCall] = useState(EMPTY_CALL);
  const [recordingNow, setRecordingNow] = useState(true);
  const [editingDetails, setEditingDetails] = useState(false);
  const [details, setDetails] = useState(EMPTY_DETAILS);
  const [busy, setBusy] = useState(false);
  const [areaNote, setAreaNote] = useState<string | null>(null);
  const [pendingWant, setPendingWant] = useState<"" | "sell" | "buy" | "scout">("");
  const [choosingWant, setChoosingWant] = useState(false);

  const reload = useCallback(async () => {
    if (!token || !allowed || !contactId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRecruitmentContact(token, contactId);
      setContact(data.contact);
      setTouches(data.touches || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this person");
    } finally {
      setLoading(false);
    }
  }, [allowed, contactId, token]);

  const refreshQuiet = useCallback(async () => {
    if (!token || !allowed || !contactId) return;
    try {
      const data = await fetchRecruitmentContact(token, contactId);
      setContact(data.contact);
      setTouches(data.touches || []);
    } catch {
      /* Keep the open page if this check fails. */
    }
  }, [allowed, contactId, token]);

  useEffect(() => {
    if (!allowed) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshQuiet();
    }, 20000);
    return () => window.clearInterval(id);
  }, [allowed, refreshQuiet]);

  useEffect(() => {
    if (!contact) return;
    const choices = superuserStageChoices(contact.stage);
    setMoveTo((current) => (choices.some(([value]) => value === current) ? current : choices[0]?.[0] || ""));
  }, [contact]);

  useEffect(() => {
    if (!token || !contact?.id || (!contact.district && !contact.sector)) {
      setAreaNote(null);
      return;
    }
    let cancelled = false;
    void fetchRecruitmentArea(token, contact.id)
      .then((data) => {
        if (!cancelled) setAreaNote(data.sentence);
      })
      .catch(() => {
        if (!cancelled) setAreaNote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, contact?.id, contact?.district, contact?.sector]);

  useEffect(() => {
    setCall(EMPTY_CALL);
    setRecordingNow(true);
    setEditingDetails(false);
    void reload();
  }, [reload]);

  function callBody(overrides: Partial<typeof EMPTY_CALL> = {}) {
    if (!contact) return {};
    const next = { ...call, ...overrides };
    const selling = contact.want === "sell" && next.ownsBroilers === "yes";
    const heard = [
      next.speakingWithThem === "no" && next.whoAnswered.trim() ? `On the phone: ${next.whoAnswered.trim()}.` : "",
      next.note.trim(),
    ].filter(Boolean).join(" ");
    return {
      kind: "call",
      outcome: next.outcome,
      note: heard,
      want: contact.want,
      scheduledFor: next.scheduledFor || undefined,
      locationConfirmed: next.locationConfirmed === "" ? null : next.locationConfirmed === "yes",
      locationCorrected: next.locationCorrected,
      ownsBroilers: contact.want === "sell" && next.ownsBroilers !== "" ? next.ownsBroilers === "yes" : null,
      birdType: selling ? next.birdType : null,
      quantityMin: contact.want === "sell" && !selling ? "" : next.quantityMin,
      quantityMax: contact.want === "sell" && !selling ? "" : next.quantityMax,
      flockSize: selling ? next.flockSize : "",
      readyInWeeks: selling ? next.readyInWeeks : "",
      canSlaughter: contact.want === "sell" && next.canSlaughter !== "" ? next.canSlaughter === "yes" : null,
      canDeliver: contact.want === "sell" && next.canDeliver !== "" ? next.canDeliver === "yes" : null,
      buyerFor: contact.want === "buy" ? next.buyerFor : "",
      birdForm: contact.want === "buy" ? next.birdReady : "",
      deliveryRequired: contact.want === "buy" && next.deliveryRequired !== "" ? next.deliveryRequired === "yes" : null,
      willVisit: contact.want === "scout" && next.willVisit !== "" ? next.willVisit === "yes" : null,
      farmsKnown: contact.want === "scout" ? next.farmsKnown : "",
      challenges: scriptChallenges() || next.challenges,
      nextAction: scriptNext(next) || next.nextAction,
      needsFollowUp: next.needsFollowUp,
      idempotencyKey: `${contact.id}:${next.outcome}:${next.scheduledFor}:${heard}`.slice(0, 80),
    };
  }

  async function saveCall(overrides: Partial<typeof EMPTY_CALL> = {}, ok = "Saved") {
    if (!token || !contact || isCardMoving(contact.id)) return false;
    const outcome = overrides.outcome || call.outcome;
    const needsFollowUp = overrides.needsFollowUp ?? call.needsFollowUp;
    const next = predictDesk(contact.stage, contact.deskStatus, outcome, needsFollowUp);
    const prev = beginMove(contact.id, { stage: next.stage, deskStatus: next.status });
    setBusy(true);
    try {
      const saved = await addRecruitmentTouch(token, contact.id, callBody(overrides));
      finishMove(contact.id, saved.contact);
      setContact(saved.contact);
      setCall(EMPTY_CALL);
      if (ok) showToast("success", ok);
      void reload();
      return true;
    } catch (e) {
      rollbackMove(contact.id, prev);
      showToast("error", e instanceof Error ? e.message : "Could not record the call");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: string) {
    if (!token || !contact || isCardMoving(contact.id)) return;
    const ready = ["kycContractStatus", "kycLocationStatus", "kycPaymentStatus", "kycIdentityStatus"].every(
      (key) => contact[key as keyof RecruitmentContact] === "approved"
    );
    const next = predictDecision(decision, ready);
    const prev = beginMove(contact.id, next ? { stage: next.stage, deskStatus: next.status } : {});
    setBusy(true);
    try {
      const saved = await decideRecruitmentContact(token, contact.id, {
        decision,
        note: call.note,
        idempotencyKey: `${contact.id}:${decision}:${call.note}:${Date.now()}`.slice(0, 80),
      });
      finishMove(contact.id, saved.contact);
      setContact(saved.contact);
      showToast("success", saved.contact.stage === "kyc" ? "Moved to KYC" : "Decision saved");
      void reload();
    } catch (e) {
      rollbackMove(contact.id, prev);
      showToast("error", e instanceof Error ? e.message : "Could not save the decision");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action: StageActionId) {
    if (action === "send_kyc") {
      const saved = await saveCall({ outcome: "reached", needsFollowUp: contact?.deskStatus === "follow_up" }, "");
      if (saved) await decide("approved");
      return;
    }
    if (action === "call_later") {
      await saveCall({ outcome: "reached", needsFollowUp: true }, "Call later");
      return;
    }
    if (action === "no_answer" || action === "try_again") {
      await saveCall({ outcome: "no_answer" }, action === "try_again" ? "Back on the list" : "No answer");
      return;
    }
    if (action === "schedule") {
      await saveCall({ outcome: "scheduled" }, "Call scheduled");
      return;
    }
    if (action === "reschedule") {
      await saveCall({ outcome: "scheduled" }, "Call rescheduled");
      return;
    }
    if (action === "save_follow_up") {
      await saveCall({ outcome: "reached", needsFollowUp: contact?.stage !== "onboarded" && contact?.stage !== "active" }, "Follow-up saved");
      return;
    }
    await decide(action);
  }

  async function moveStage() {
    if (!token || !contact || !moveTo || isCardMoving(contact.id)) return;
    if (moveTo === contact.stage && (!moveStatus || moveStatus === contact.deskStatus)) return;
    const label = [stageLabel(moveTo), statusLabel(moveTo, moveStatus)].filter(Boolean).join(" · ");
    const prev = beginMove(contact.id, { stage: moveTo, deskStatus: moveStatus || null });
    setBusy(true);
    try {
      const saved = await patchRecruitmentContact(token, contact.id, {
        stage: moveTo,
        ...(moveStatus ? { deskStatus: moveStatus } : {}),
      });
      finishMove(contact.id, saved.contact);
      try {
        await addRecruitmentTouch(token, contact.id, {
          kind: "note",
          outcome: "done",
          note: `Moved to ${label}`,
          want: contact.want,
        });
      } catch {
        /* The stage is already saved. A missed note does not put the card back. */
      }
      setContact(saved.contact);
      showToast("success", `Moved to ${label}`);
      void reload();
    } catch (e) {
      rollbackMove(contact.id, prev);
      showToast("error", e instanceof Error ? e.message : "Could not move this person");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return (
      <ManagerPage>
        <PageHeader title="Person" />
        <p className="text-sm text-[var(--text-secondary)]">Sales officer, sales coordinator, or superuser access required.</p>
      </ManagerPage>
    );
  }

  const back = companyHref("/farm/pipeline/people");
  const mode = contact ? personDeskMode(contact.stage, contact.deskStatus) : null;

  function openDetails() {
    if (!contact) return;
    setDetails({
      name: contact.name || "",
      phone: contact.phone || "",
      email: contact.email || "",
      district: contact.district || "",
      sector: contact.sector || "",
    });
    setEditingDetails(true);
  }

  async function changeApplication() {
    if (!token || !contact || !pendingWant || pendingWant === contact.want) return;
    if (isCardMoving(contact.id)) return;
    setBusy(true);
    const prev = beginMove(contact.id, { want: pendingWant, stage: "contact", deskStatus: "call_scheduled" });
    try {
      const saved = await patchRecruitmentContact(token, contact.id, { want: pendingWant });
      setContact(saved.contact);
      setCall(EMPTY_CALL);
      setPendingWant("");
      setChoosingWant(false);
      finishMove(contact.id, saved.contact);
      showToast("success", "They are back on Contact for another interview.");
      await reload();
    } catch (e) {
      rollbackMove(contact.id, prev);
      showToast("error", e instanceof Error ? e.message : "Could not change the application");
    } finally {
      setBusy(false);
    }
  }

  async function saveDetails() {
    if (!token || !contact) return;
    setBusy(true);
    try {
      const saved = await patchRecruitmentContact(token, contact.id, details);
      setContact(saved.contact);
      setEditingDetails(false);
      showToast("success", "Details saved");
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not save the details");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ManagerPage>
      <PageHeader
        title={contact ? contact.name || contact.phone : "Person"}
      />
      {loading ? <SkeletonList rows={4} /> : null}
      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}
      {contact && mode && !loading && !error ? (
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <ListBackLink to={back} label="People" />
            <p className="min-w-0 text-sm text-[var(--text-secondary)]">
              {[contact.phone, contact.email, placeLabel(contact) || "No place yet"].filter(Boolean).join(" · ")}
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              Applied as a {wantLabel(contact.want).toLowerCase()}
              {choosingWant || pendingWant ? null : (
                <TextLink className="ml-2" onClick={() => setChoosingWant(true)}>
                  Change
                </TextLink>
              )}
            </p>
            {contact.detailsEditedAt ? <StatusPill tone="warning">Edited</StatusPill> : null}
            {contact.stage === "kyc" || contact.contractStatus ? <StatusPill>{contractBadgeLabel(contact)}</StatusPill> : null}
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => (editingDetails ? setEditingDetails(false) : openDetails())}>
              {editingDetails ? "Close" : "Edit details"}
            </Button>
          </div>
          {choosingWant || pendingWant ? (
            <div className="space-y-2">
              {pendingWant ? (
                <>
                  <p className="text-sm text-[var(--text-primary)]">
                    Change to {wantLabel(pendingWant).toLowerCase()}? The interview starts again, and the answers for {wantLabel(contact.want).toLowerCase()} are cleared.
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" disabled={busy} onClick={() => void changeApplication()}>Change</Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setPendingWant("");
                        setChoosingWant(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  {PEOPLE_WANTS.map(([value, label]) =>
                    value === contact.want ? (
                      <span key={value} className="text-[var(--text-secondary)]">{label}</span>
                    ) : (
                      <TextLink key={value} onClick={() => setPendingWant(value)}>
                        {label}
                      </TextLink>
                    ),
                  )}
                  <TextLink onClick={() => setChoosingWant(false)}>
                    Cancel
                  </TextLink>
                </div>
              )}
            </div>
          ) : null}
          {editingDetails ? (
            <SectionCard title="Details">
              <div className="grid gap-3">
                <Field label="Name">
                  <Input value={details.name} onChange={(e) => setDetails((prev) => ({ ...prev, name: e.target.value }))} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Phone">
                    <Input inputMode="tel" value={details.phone} onChange={(e) => setDetails((prev) => ({ ...prev, phone: e.target.value }))} />
                  </Field>
                  <Field label="Email">
                    <Input type="email" value={details.email} onChange={(e) => setDetails((prev) => ({ ...prev, email: e.target.value }))} />
                  </Field>
                </div>
                <DistrictSelect
                  layout="stack"
                  value={details.district}
                  sector={details.sector}
                  onChange={(district) => setDetails((prev) => ({ ...prev, district }))}
                  onSectorChange={(sector) => setDetails((prev) => ({ ...prev, sector }))}
                />
                <div>
                  <Button type="button" size="sm" disabled={busy || !details.name.trim() || !details.phone.trim()} onClick={() => void saveDetails()}>
                    Save details
                  </Button>
                </div>
              </div>
            </SectionCard>
          ) : null}
          {liveSellerWarning(contact) ? (
            <p className="rounded-lg border border-[var(--status-warning)] bg-[var(--surface-subtle)] px-3 py-2 text-sm text-[var(--text-primary)]">
              {liveSellerWarning(contact)}
            </p>
          ) : null}
          {areaNote ? (
            <p className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] px-3 py-2 text-sm text-[var(--text-primary)]">
              {areaNote}
            </p>
          ) : null}
          {canMoveStage ? (
            <SectionCard title="Move stage">
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Send to">
                  <Select
                    value={moveTo}
                    onChange={(e) => {
                      const next = e.target.value;
                      setMoveTo(next);
                      const statuses = statusesForStage(next);
                      setMoveStatus(statuses[0]?.[0] || "");
                    }}
                  >
                    {superuserStageChoices(contact.stage).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Select>
                </Field>
                {statusesForStage(moveTo).length > 0 ? (
                  <Field label="Status">
                    <Select value={moveStatus} onChange={(e) => setMoveStatus(e.target.value)}>
                      {statusesForStage(moveTo).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
                <Button type="button" size="sm" disabled={busy || !moveTo || (moveTo === contact.stage && (!moveStatus || moveStatus === contact.deskStatus))} onClick={() => void moveStage()}>
                  Move
                </Button>
              </div>
            </SectionCard>
          ) : null}
          <SectionCard title={mode === "schedule" && recordingNow ? "Call now" : personDeskTitle(mode)}>
            <StageBody
              contact={contact}
              mode={mode}
              call={call}
              setCall={setCall}
              recordingNow={recordingNow}
              setRecordingNow={setRecordingNow}
              busy={busy}
              canReviewKyc={canReviewKyc}
              canMoveStage={canMoveStage}
              onAction={(action) => void runAction(action)}
              onContract={(next) => setContact(next)}
              onKyc={async (body) => {
                if (!token) return;
                setBusy(true);
                try {
                  const saved = await submitRecruitmentKyc(token, contact.id, body);
                  setContact(saved.contact);
                  finishMove(contact.id, saved.contact);
                  showToast("success", saved.contact.stage === "onboarded" || saved.contact.stage === "active" ? "They are onboarded" : "KYC saved");
                  await reload();
                } catch (e) {
                  showToast("error", e instanceof Error ? e.message : "Could not save KYC");
                } finally {
                  setBusy(false);
                }
              }}
            />
          </SectionCard>
          {touches.length > 0 ? (
            <SectionCard title="Recent notes">
              <ul className="divide-y divide-[var(--border-color)]">
                {touches.slice(0, 6).map((touch) => (
                  <li key={touch.id} className="py-2 first:pt-0 last:pb-0">
                    <p className="text-sm text-[var(--text-primary)]">{touch.note || touch.outcome || touch.kind}</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {[touch.byName, dayLabel(touch.createdAt)].filter(Boolean).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </div>
      ) : null}
    </ManagerPage>
  );
}

function dayLabel(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function yesNo(value?: boolean | null) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "Not recorded";
}

function StageBody({
  contact,
  mode,
  call,
  setCall,
  recordingNow,
  setRecordingNow,
  busy,
  canReviewKyc,
  canMoveStage,
  onAction,
  onKyc,
  onContract,
}: {
  contact: RecruitmentContact;
  mode: PersonDeskMode;
  call: typeof EMPTY_CALL;
  setCall: (next: typeof EMPTY_CALL) => void;
  recordingNow: boolean;
  setRecordingNow: (next: boolean) => void;
  busy: boolean;
  canReviewKyc: boolean;
  canMoveStage: boolean;
  onAction: (action: StageActionId) => void;
  onKyc: (body: Record<string, unknown>) => Promise<void>;
  onContract: (contact: RecruitmentContact) => void;
}) {
  const sendBlocked = kycSendBlocked(contact, call);
  const gaps = approvalGaps(contact);
  const buttons = (
    <StageButtons
      actions={stageActions({
        mode,
        stage: contact.stage,
        status: contact.deskStatus,
        recordingNow,
        outcome: call.outcome,
      })}
      busy={busy}
      sendBlocked={sendBlocked}
      hasTime={Boolean(call.scheduledFor)}
      onAction={onAction}
    />
  );

  if (mode === "schedule") {
    return (
      <div className="space-y-3">
        <SegmentedControl
          size="sm"
          value={recordingNow ? "now" : "schedule"}
          onChange={(value) => setRecordingNow(value === "now")}
          options={[
            { value: "now", label: "Call now" },
            { value: "schedule", label: "Schedule" },
          ]}
        />
        {recordingNow ? (
          <CallScript contact={contact} call={call} setCall={setCall} />
        ) : (
          <Field label="When to call">
            <Input type="datetime-local" value={call.scheduledFor} onChange={(e) => setCall({ ...call, scheduledFor: e.target.value })} />
          </Field>
        )}
        {buttons}
      </div>
    );
  }

  if (mode === "call") {
    return (
      <div className="space-y-3">
        {contact.nextCallAt ? (
          <p className="text-sm text-[var(--text-secondary)]">Booked for {dayLabel(contact.nextCallAt)}.</p>
        ) : null}
        <SegmentedControl
          size="sm"
          label="Call result"
          value={call.outcome}
          onChange={(outcome) => setCall({ ...call, outcome })}
          options={[
            { value: "reached", label: "Reached" },
            { value: "no_answer", label: "No answer" },
            { value: "scheduled", label: "Reschedule" },
          ]}
        />
        {call.outcome === "reached" ? <CallScript contact={contact} call={call} setCall={setCall} /> : null}
        {call.outcome === "scheduled" ? (
          <Field label="New time">
            <Input type="datetime-local" value={call.scheduledFor} onChange={(e) => setCall({ ...call, scheduledFor: e.target.value })} />
          </Field>
        ) : null}
        {call.outcome !== "reached" ? (
          <Field label="Notes">
            <Input value={call.note} onChange={(e) => setCall({ ...call, note: e.target.value })} />
          </Field>
        ) : null}
        {buttons}
      </div>
    );
  }

  if (mode === "decision" || mode === "follow_up") {
    return (
      <div className="space-y-3">
        <AnswerSummary contact={contact} />
        {mode === "follow_up" ? (
          <>
            <Field label="What is blocking the listing?">
              <Input value={call.challenges} onChange={(e) => setCall({ ...call, challenges: e.target.value })} />
            </Field>
            <Field label="Next follow-up">
              <Input type="datetime-local" value={call.scheduledFor} onChange={(e) => setCall({ ...call, scheduledFor: e.target.value })} />
            </Field>
          </>
        ) : null}
        {gaps.length > 0 ? (
          <>
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
              {gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
            <CallScript contact={contact} call={call} setCall={setCall} />
          </>
        ) : (
          <Field label="Notes">
            <Input value={call.note} onChange={(e) => setCall({ ...call, note: e.target.value })} />
          </Field>
        )}
        {buttons}
      </div>
    );
  }

  if (mode === "kyc") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--text-secondary)]">
          {canReviewKyc
          ? "The call is approved. They can trade after the contract, place, mobile money, and ID are approved."
          : "Sent to KYC. You can send the signing link. A coordinator approves the contract, place, payment, and ID."}
        </p>
        <KycPanel
          key={contact.id}
          contact={contact}
          desk
          canApprove={canReviewKyc}
          busy={busy}
          onSubmit={onKyc}
          onContract={onContract}
        />
        {buttons}
      </div>
    );
  }

  if (mode === "active") {
    const flocks = listingState(contact);
    return (
      <div className="space-y-3">
        {flocks ? <StatusPill tone={flocks === "Listed" ? "success" : "warning"}>{flocks}</StatusPill> : null}
        <div className="flex flex-wrap gap-2">
          <StatusPill tone="success">Contract</StatusPill>
          <StatusPill tone="success">Place</StatusPill>
          <StatusPill tone="success">Payment</StatusPill>
          <StatusPill tone="success">ID</StatusPill>
        </div>
        <Field label="What is blocking the listing?">
          <Input value={call.challenges} onChange={(e) => setCall({ ...call, challenges: e.target.value })} />
        </Field>
        <Field label="Next follow-up">
          <Input type="datetime-local" value={call.scheduledFor} onChange={(e) => setCall({ ...call, scheduledFor: e.target.value })} />
        </Field>
        <Field label="Notes">
          <Input value={call.note} onChange={(e) => setCall({ ...call, note: e.target.value })} />
        </Field>
        {buttons}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--text-secondary)]">
        {contact.deskStatus === "not_a_fit" || contact.stage === "not_a_fit"
          ? canMoveStage
            ? "They are not a fit. Move stage puts them back on the list."
            : "They are not a fit. Nothing else is waiting on this person."
          : canMoveStage
            ? "They could not be reached. Move stage puts them back on the list."
            : "They could not be reached. Nothing else is waiting on this person."}
      </p>
      {buttons}
    </div>
  );
}

function StageButtons({
  actions,
  busy,
  sendBlocked,
  hasTime,
  onAction,
}: {
  actions: StageAction[];
  busy: boolean;
  sendBlocked: boolean;
  hasTime: boolean;
  onAction: (action: StageActionId) => void;
}) {
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const needsTime = action.id === "schedule" || action.id === "reschedule";
        const blocked = (action.id === "send_kyc" && sendBlocked) || (needsTime && !hasTime);
        return (
          <Button
            key={action.id}
            type="button"
            size="sm"
            variant={action.primary ? "primary" : "secondary"}
            disabled={busy || blocked}
            onClick={() => onAction(action.id)}
          >
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}


function AnswerSummary({ contact }: { contact: RecruitmentContact }) {
  const rows = [
    ["Location correct", yesNo(contact.locationConfirmed)],
    contact.locationCorrected ? ["Corrected place", contact.locationCorrected] : null,
    contact.want === "sell" ? ["Owns broilers", yesNo(contact.ownsBroilers)] : null,
    contact.want === "sell" && contact.birdType ? ["Bird type", contact.birdType] : null,
    contact.want === "sell" && contact.flockSize != null ? ["Birds in the flock", String(contact.flockSize)] : null,
    contact.want === "sell" && contact.readyInWeeks != null
      ? ["Weeks until they can sell", contact.readyInWeeks === 0 ? "Ready now" : String(contact.readyInWeeks)]
      : null,
    contact.quantityMin != null
      ? [
          contact.want === "buy" ? "Birds in a normal week" : "Birds they will sell",
          contact.quantityMax != null ? `${contact.quantityMin}–${contact.quantityMax}` : String(contact.quantityMin),
        ]
      : null,
    contact.want === "sell" ? ["Can slaughter", yesNo(contact.canSlaughter)] : null,
    contact.want === "sell" ? ["Can deliver", yesNo(contact.canDeliver)] : null,
    contact.want === "buy" && contact.buyerFor ? ["Buying for", titleWord(contact.buyerFor)] : null,
    contact.want === "buy" && contact.birdForm ? ["How they want the birds", titleWord(contact.birdForm)] : null,
    contact.want === "buy" ? ["Must be delivered", yesNo(contact.deliveryRequired)] : null,
    contact.want === "scout" ? ["Will visit farms", yesNo(contact.willVisit)] : null,
    contact.want === "scout" && contact.farmsKnown != null ? ["Farms they know", String(contact.farmsKnown)] : null,
    contact.nextAction ? ["Next step", contact.nextAction] : null,
    contact.challenges ? ["Notes from the call", contact.challenges] : null,
  ].filter(Boolean) as [string, string][];
  if (rows.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-[var(--text-secondary)]">{label}</dt>
          <dd className="text-[var(--text-primary)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function titleWord(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function scriptNext(call: typeof EMPTY_CALL) {
  const bits = [];
  if (call.understoodNext === "yes") bits.push("Understands the next step.");
  if (call.understoodNext === "no") bits.push("Does not understand the next step yet.");
  return bits.join(" ");
}

function scriptChallenges() {
  return "";
}
