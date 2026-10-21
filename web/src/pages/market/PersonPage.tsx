import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPipelineDesk } from "../../auth/permissions";
import { PageHeader } from "../../components/PageHeader";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { DistrictSelect } from "../../components/DistrictSelect";
import { Button, Field, Input, ListBackLink, SectionCard, SegmentedControl, StatusPill } from "../../components/ui";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import {
  addRecruitmentTouch,
  decideRecruitmentContact,
  fetchRecruitmentContact,
  patchRecruitmentContact,
  submitRecruitmentKyc,
  type RecruitmentContact,
  type RecruitmentTouch,
} from "../../api/marketInsights.api";
import { placeLabel } from "./flockDesk";
import {
  approvalGaps,
  listingState,
  personDeskMode,
  personDeskTitle,
  wantLabel,
  type PersonDeskMode,
} from "./people/peopleWork";
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
  canSlaughter: "",
  canDeliver: "",
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
  const allowed = canAccessPipelineDesk(user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contact, setContact] = useState<RecruitmentContact | null>(null);
  const [touches, setTouches] = useState<RecruitmentTouch[]>([]);
  const [call, setCall] = useState(EMPTY_CALL);
  const [recordingNow, setRecordingNow] = useState(true);
  const [editingDetails, setEditingDetails] = useState(false);
  const [details, setDetails] = useState(EMPTY_DETAILS);
  const [busy, setBusy] = useState(false);

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
      canSlaughter: contact.want === "sell" && next.canSlaughter !== "" ? next.canSlaughter === "yes" : null,
      canDeliver: contact.want === "sell" && next.canDeliver !== "" ? next.canDeliver === "yes" : null,
      challenges: scriptChallenges(contact.want, next) || next.challenges,
      nextAction: scriptNext(contact.want, next) || next.nextAction,
      needsFollowUp: next.needsFollowUp,
      idempotencyKey: `${contact.id}:${next.outcome}:${next.scheduledFor}:${heard}`.slice(0, 80),
    };
  }

  async function saveCall(overrides: Partial<typeof EMPTY_CALL> = {}, ok = "Saved") {
    if (!token || !contact) return;
    setBusy(true);
    try {
      const saved = await addRecruitmentTouch(token, contact.id, callBody(overrides));
      setContact(saved.contact);
      setCall(EMPTY_CALL);
      showToast("success", ok);
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not record the call");
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: string) {
    if (!token || !contact) return;
    setBusy(true);
    try {
      const saved = await decideRecruitmentContact(token, contact.id, {
        decision,
        note: call.note,
        idempotencyKey: `${contact.id}:${decision}:${call.note}:${Date.now()}`.slice(0, 80),
      });
      setContact(saved.contact);
      showToast("success", saved.contact.stage === "kyc" ? "Moved to KYC" : "Decision saved");
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not save the decision");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return (
      <ManagerPage>
        <PageHeader title="Person" />
        <p className="text-sm text-[var(--text-secondary)]">Sales coordinator or superuser access required.</p>
      </ManagerPage>
    );
  }

  const back = companyHref("/farm/pipeline/people");
  const mode = contact ? personDeskMode(contact.stage) : null;

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
        title={contact ? `${wantLabel(contact.want)} · ${contact.name || contact.phone}` : "Person"}
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
            {contact.detailsEditedAt ? <StatusPill tone="warning">Edited</StatusPill> : null}
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => (editingDetails ? setEditingDetails(false) : openDetails())}>
              {editingDetails ? "Close" : "Edit details"}
            </Button>
          </div>
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
          <SectionCard title={mode === "schedule" && recordingNow ? "Call now" : personDeskTitle(mode)}>
            <StageBody
              contact={contact}
              mode={mode}
              call={call}
              setCall={setCall}
              recordingNow={recordingNow}
              setRecordingNow={setRecordingNow}
              busy={busy}
              onSave={saveCall}
              onDecide={decide}
              onKyc={async (body) => {
                if (!token) return;
                setBusy(true);
                try {
                  const saved = await submitRecruitmentKyc(token, contact.id, body);
                  setContact(saved.contact);
                  showToast("success", saved.contact.stage === "active" ? "They are active" : "KYC saved");
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
  onSave,
  onDecide,
  onKyc,
}: {
  contact: RecruitmentContact;
  mode: PersonDeskMode;
  call: typeof EMPTY_CALL;
  setCall: (next: typeof EMPTY_CALL) => void;
  recordingNow: boolean;
  setRecordingNow: (next: boolean) => void;
  busy: boolean;
  onSave: (overrides?: Partial<typeof EMPTY_CALL>, ok?: string) => Promise<void>;
  onDecide: (decision: string) => Promise<void>;
  onKyc: (body: Record<string, unknown>) => Promise<void>;
}) {
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
        <div className="flex flex-wrap gap-2">
          {recordingNow ? (
            <Button type="button" size="sm" disabled={busy} onClick={() => void onSave({ outcome: "reached" }, "Call recorded")}>
              Save the call
            </Button>
          ) : (
            <Button type="button" size="sm" disabled={busy || !call.scheduledFor} onClick={() => void onSave({ outcome: "scheduled" }, "Call scheduled")}>
              Schedule call
            </Button>
          )}
        </div>
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
        <Button type="button" size="sm" disabled={busy} onClick={() => void onSave({}, "Call recorded")}>
          Save the call
        </Button>
      </div>
    );
  }

  if (mode === "decision" || mode === "follow_up") {
    const gaps = approvalGaps(contact);
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
            <Button type="button" size="sm" disabled={busy} onClick={() => void onSave({ outcome: "reached", needsFollowUp: mode === "follow_up" }, "Answers saved")}>
              Save answers
            </Button>
          </>
        ) : (
          <>
            <Field label="Notes">
              <Input value={call.note} onChange={(e) => setCall({ ...call, note: e.target.value })} />
            </Field>
            <div className="flex flex-wrap gap-2">
              {mode === "follow_up" ? (
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void onSave({ outcome: "reached", needsFollowUp: true }, "Follow-up saved")}>
                  Save follow-up
                </Button>
              ) : null}
              <Button type="button" size="sm" disabled={busy} onClick={() => void onDecide("approved")}>
                Approve
              </Button>
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void onDecide("not_a_fit")}>
                Not a fit
              </Button>
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void onDecide("unreachable")}>
                Unreachable
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (mode === "kyc") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--text-secondary)]">The call is approved. They can trade after the contract, place, mobile money, and ID are approved.</p>
        <KycPanel key={contact.id} contact={contact} desk busy={busy} onSubmit={onKyc} />
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
        <Button type="button" size="sm" disabled={busy} onClick={() => void onSave({ outcome: "reached" }, "Follow-up saved")}>
          Save follow-up
        </Button>
      </div>
    );
  }

  return (
    <p className="text-sm text-[var(--text-secondary)]">
      {contact.stage === "not_a_fit"
        ? "They are not a fit. Nothing else is waiting on this person."
        : "They could not be reached. Nothing else is waiting on this person."}
    </p>
  );
}

function AnswerSummary({ contact }: { contact: RecruitmentContact }) {
  const rows = [
    ["Location correct", yesNo(contact.locationConfirmed)],
    contact.locationCorrected ? ["Corrected place", contact.locationCorrected] : null,
    contact.want === "sell" ? ["Owns broilers", yesNo(contact.ownsBroilers)] : null,
    contact.want === "sell" && contact.birdType ? ["Bird type", contact.birdType] : null,
    contact.quantityMin != null ? ["Birds", contact.quantityMax != null ? `${contact.quantityMin}–${contact.quantityMax}` : String(contact.quantityMin)] : null,
    contact.want === "sell" ? ["Can slaughter", yesNo(contact.canSlaughter)] : null,
    contact.want === "sell" ? ["Can deliver", yesNo(contact.canDeliver)] : null,
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

function scriptNext(want: string, call: typeof EMPTY_CALL) {
  const bits = [];
  if (call.understoodNext === "yes") bits.push("Understands the next step.");
  if (call.understoodNext === "no") bits.push("Does not understand the next step yet.");
  if (want === "scout" && call.willVisit === "yes") bits.push("Will visit farms in this place.");
  if (want === "scout" && call.willVisit === "no") bits.push("Will not visit farms in this place.");
  if (want === "buy" && call.birdReady) bits.push(`Wants the birds ${call.birdReady}.`);
  return bits.join(" ");
}

function scriptChallenges(want: string, call: typeof EMPTY_CALL) {
  if (want === "buy" && call.buyerFor) return `Buys for a ${call.buyerFor}.`;
  return "";
}
