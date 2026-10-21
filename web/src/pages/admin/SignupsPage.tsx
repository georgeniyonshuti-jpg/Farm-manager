import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { PageHeader } from "../../components/PageHeader";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import {
  Field,
  Input,
  PageTabs,
  SegmentedControl,
  Select,
  StatusPill,
  Textarea,
} from "../../components/ui";
import { useToast } from "../../components/Toast";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import {
  downloadSignupsCsv,
  fetchSignupAttempts,
  fetchSignupsFunnel,
  patchSignupAttempt,
  type SignupAttempt,
  type SignupPerson,
  type SignupsFunnel,
  type SignupTouch,
} from "../../api/signups.api";
type Tab = "funnel" | "failed" | "links";

const STAGES = [
  "new",
  "contacted",
  "call_booked",
  "onboarded",
  "active",
  "unreachable",
  "not_a_fit",
] as const;

const TYPE_LABEL: Record<string, string> = {
  farmer: "Seller",
  buyer: "Buyer",
  scout: "Scout",
};

function stageLabel(stage: string) {
  return stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function verifyTone(status: string): "success" | "warning" | "neutral" | "danger" {
  if (status === "verified" || status === "approved" || status === "active") return "success";
  if (status === "pending" || status === "pending_review") return "warning";
  if (status === "rejected") return "danger";
  return "neutral";
}

function stageTone(stage: string): "success" | "warning" | "neutral" | "danger" {
  if (stage === "active" || stage === "onboarded") return "success";
  if (stage === "new" || stage === "call_booked") return "warning";
  if (stage === "not_a_fit") return "danger";
  return "neutral";
}

function waHref(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "").replace(/^0/, "250");
  if (digits.length < 9) return null;
  return `https://wa.me/${digits}`;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function SignupsPage() {
  const { token } = useAuth();
  const { companyHref } = useCompanyNav();
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (["funnel", "failed", "links"].includes(params.get("tab") || "")
    ? params.get("tab")
    : "funnel") as Tab;

  const [funnel, setFunnel] = useState<SignupsFunnel | null>(null);
  const [attempts, setAttempts] = useState<SignupAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  const source = params.get("source") || "";
  const days = Number(params.get("days") || 7);

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    next.set("tab", t);
    setParams(next, { replace: true });
  };

  /** Funnel day window — keep current tab. */
  const setDays = (d: number) => {
    const next = new URLSearchParams(params);
    next.set("days", String(d));
    setParams(next, { replace: true });
  };

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "funnel" || tab === "links") {
        setFunnel(await fetchSignupsFunnel(token, days, source));
      } else if (tab === "failed") {
        const r = await fetchSignupAttempts(token, {
          outcome: "failed",
          handled: "open",
          days: 30,
          limit: 100,
        });
        setAttempts(r.attempts);
      }
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not load signups");
    } finally {
      setLoading(false);
    }
  }, [token, tab, days, source, showToast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <ManagerPage>
      <PageHeader
        title="Signups"
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                void downloadSignupsCsv(token).catch((e) =>
                  showToast("error", e instanceof Error ? e.message : "Export failed")
                )
              }
            >
              Export CSV
            </Button>
            <Link
              to={companyHref("/farm/pipeline/people")}
              className="inline-flex items-center rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm text-[var(--text-secondary)]"
            >
              People
            </Link>
          </div>
        }
      />

      <div className="mb-4 border-b border-[var(--border-color)]">
        <PageTabs
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          aria-label="Signups sections"
          options={[
            { value: "funnel", label: "Funnel" },
            { value: "failed", label: "Failed attempts" },
            { value: "links", label: "Ad links" },
          ]}
        />
      </div>

      {tab === "funnel" ? (
        <FunnelPanel funnel={funnel} loading={loading} days={days} onDays={setDays} />
      ) : null}

      {tab === "links" ? <LinksPanel funnel={funnel} loading={loading} /> : null}

      {tab === "failed" ? (
        <FailedPanel
          attempts={attempts}
          loading={loading}
          onHandled={async (id) => {
            await patchSignupAttempt(token, id, true);
            showToast("success", "Marked handled");
            void reload();
          }}
        />
      ) : null}

    </ManagerPage>
  );
}

function FunnelPanel({
  funnel,
  loading,
  days,
  onDays,
}: {
  funnel: SignupsFunnel | null;
  loading: boolean;
  days: number;
  onDays: (d: number) => void;
}) {
  if (loading && !funnel) return <p className="text-sm text-[var(--text-muted)]">Loading…</p>;
  if (!funnel) return null;
  const dayValue = days === 30 || days === 90 ? String(days) : "7";
  return (
    <div className="space-y-4">
      <SegmentedControl
        size="sm"
        label="Period"
        value={dayValue}
        onChange={(v) => onDays(Number(v))}
        options={[
          { value: "7", label: "7d" },
          { value: "30", label: "30d" },
          { value: "90", label: "90d" },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Link opens (${dayValue}d)`} value={funnel.reach.week.opened} />
        <Stat label="Started joining" value={funnel.reach.week.joinStarted} />
        <Stat label="Attempts" value={funnel.attempts.total} />
        <Stat label="Succeeded" value={funnel.attempts.succeeded} />
        <Stat label="Failed" value={funnel.attempts.failed} />
        <Stat label="New in pipeline" value={funnel.newCount} />
        <Stat label="Onboarded" value={funnel.stages.onboarded || 0} />
        <Stat label="Active" value={funnel.stages.active || 0} />
      </div>
      {funnel.topErrors.length ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Top fail reasons</h3>
          <ul className="space-y-1 text-sm">
            {funnel.topErrors.map((e) => (
              <li key={e.code} className="flex justify-between gap-4">
                <span>{e.code}</span>
                <span className="tabular-nums text-[var(--text-muted)]">{e.n}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {funnel.bySource.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border-color)] text-[var(--text-muted)]">
                <th className="py-2 pr-3 font-medium">Source</th>
                <th className="py-2 pr-3 font-medium">Campaign</th>
                <th className="py-2 pr-3 font-medium">Attempts</th>
                <th className="py-2 pr-3 font-medium">OK</th>
                <th className="py-2 font-medium">Fail</th>
              </tr>
            </thead>
            <tbody>
              {funnel.bySource.map((row) => (
                <tr key={`${row.source}-${row.campaign}`} className="border-b border-[var(--border-color)]/60">
                  <td className="py-2 pr-3">{row.source}</td>
                  <td className="py-2 pr-3">{row.campaign || "—"}</td>
                  <td className="py-2 pr-3 tabular-nums">{row.attempts}</td>
                  <td className="py-2 pr-3 tabular-nums">{row.succeeded}</td>
                  <td className="py-2 tabular-nums">{row.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function buildAdLink(source: string, campaign: string): string {
  // from=market keeps seller/buyer/scout even if a platform strips utm_*; channel in utm_source.
  let url = `https://market.cleva.rw/signup?from=market&utm_source=${encodeURIComponent(source)}`;
  const camp = campaign.trim();
  if (camp && camp.toLowerCase() !== "launch") {
    url += `&utm_campaign=${encodeURIComponent(camp)}`;
  }
  return url;
}

function LinksPanel({ funnel, loading }: { funnel: SignupsFunnel | null; loading: boolean }) {
  const { showToast } = useToast();
  const [campaign, setCampaign] = useState("launch");
  if (loading && !funnel) return <p className="text-sm text-[var(--text-muted)]">Loading…</p>;
  const built = ["facebook", "instagram", "google", "whatsapp"].map((source) => ({
    source,
    url: buildAdLink(source, campaign),
  }));
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">
        Use these links in Meta / Google Ads. They open the market signup (not Full Clevafarm).
      </p>
      <div className="max-w-xs">
        <Field label="Campaign name (optional)">
          <Input
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            placeholder="launch"
          />
        </Field>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Leave as launch for the short link. Any other name adds utm_campaign.
        </p>
      </div>
      <ul className="space-y-2">
        {built.map((link) => (
          <li
            key={link.source}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-color)] px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium capitalize">{link.source}</p>
              <p className="truncate font-mono text-xs text-[var(--text-muted)]" title={link.url}>
                {link.url}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(link.url).then(() => showToast("success", "Copied"));
              }}
            >
              Copy
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FailedPanel({
  attempts,
  loading,
  onHandled,
}: {
  attempts: SignupAttempt[];
  loading: boolean;
  onHandled: (id: string) => Promise<void>;
}) {
  if (loading) return <p className="text-sm text-[var(--text-muted)]">Loading…</p>;
  if (!attempts.length) return <p className="text-sm text-[var(--text-muted)]">No open failed attempts.</p>;
  return (
    <ul className="space-y-3">
      {attempts.map((a) => (
        <li key={a.id} className="rounded-xl border border-[var(--border-color)] px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium">{a.fullName || a.email || "Unknown"}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {TYPE_LABEL[a.accountType || ""] || a.accountType || "—"} · {a.source || "direct"} ·{" "}
                {fmtDate(a.createdAt)}
              </p>
              <p className="mt-1 text-sm text-red-700">
                {a.errorCode}: {a.errorMessage}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {a.email ? (
                  <a href={`mailto:${a.email}`} className="text-[var(--primary-color)]">
                    Email
                  </a>
                ) : null}
                {waHref(a.phone) ? (
                  <a href={waHref(a.phone)!} target="_blank" rel="noreferrer" className="text-[var(--primary-color)]">
                    WhatsApp
                  </a>
                ) : null}
              </div>
            </div>
            <Button type="button" variant="secondary" onClick={() => void onHandled(a.id)}>
              Mark handled
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--border-color)] px-4 py-3">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function PersonCard({
  person,
  touches,
  profiles,
  lots,
  scoutApp,
  note,
  scheduleAt,
  busy,
  onNote,
  onScheduleAt,
  onStage,
  onLogCall,
  onScheduleCall,
  onBlock,
  onApproveProfile,
  onApproveLot,
  onApproveScout,
  onRejectScout,
}: {
  person: SignupPerson;
  touches: SignupTouch[];
  profiles: Array<{ id: string; displayName: string; verificationStatus: string }>;
  lots: Array<{ id: string; birdCount: number; verificationStatus: string | null }>;
  scoutApp: { status: string } | null;
  note: string;
  scheduleAt: string;
  busy: boolean;
  onNote: (value: string) => void;
  onScheduleAt: (value: string) => void;
  onStage: (stage: string) => void;
  onLogCall: () => void;
  onScheduleCall: () => void;
  onBlock: () => void;
  onApproveProfile: (id: string) => void;
  onApproveLot: (id: string) => void;
  onApproveScout: () => void;
  onRejectScout: () => void;
}) {
  const wa = waHref(person.phone);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone="info">{TYPE_LABEL[person.accountType] || person.accountType}</StatusPill>
        <StatusPill tone={stageTone(person.stage)}>{stageLabel(person.stage)}</StatusPill>
        {person.isBlocked ? <StatusPill tone="danger">Blocked</StatusPill> : null}
        <p className="text-sm text-[var(--text-muted)]">
          {person.source}
          {person.utmCampaign ? ` / ${person.utmCampaign}` : ""}
          {" · "}
          Signed up {fmtDate(person.createdAt)}
        </p>
      </div>

      <div className="grid gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-3 sm:grid-cols-2">
        <div className="min-w-0 sm:col-span-2">
          <p className="text-xs text-[var(--text-muted)]">Email</p>
          <a href={`mailto:${person.email}`} className="mt-0.5 block text-sm text-[var(--text-primary)]">
            {person.email}
          </a>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[var(--text-muted)]">Phone</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="text-sm text-[var(--text-primary)]">{person.phone || "—"}</span>
            {wa ? (
              <a
                href={wa}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-control-sm items-center rounded-control border border-[var(--border-color)] bg-[var(--surface-card)] px-2.5 text-xs font-semibold text-[var(--primary-color)] hover:bg-[var(--surface-subtle)]"
              >
                WhatsApp
              </a>
            ) : null}
          </div>
        </div>
        {person.district ? (
          <div>
            <p className="text-xs text-[var(--text-muted)]">District</p>
            <p className="mt-0.5 text-sm">{person.district}</p>
          </div>
        ) : null}
        {person.nextCallAt ? (
          <div>
            <p className="text-xs text-[var(--text-muted)]">Next call</p>
            <p className="mt-0.5 text-sm">{fmtDate(person.nextCallAt)}</p>
          </div>
        ) : null}
      </div>

      <section className="space-y-3 rounded-xl border border-[var(--border-color)] p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Follow up</h3>
        <Field label="Note">
          <Textarea
            rows={3}
            autoFocus
            placeholder="What happened, or what to say on the next call"
            value={note}
            disabled={busy}
            onChange={(e) => onNote(e.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Stage">
            <Select
              className="capitalize"
              value={person.stage}
              disabled={busy}
              onChange={(e) => onStage(e.target.value)}
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {stageLabel(s)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Call time">
            <Input
              type="datetime-local"
              value={scheduleAt}
              disabled={busy}
              onChange={(e) => onScheduleAt(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled={busy} onClick={onLogCall}>
            Log call
          </Button>
          <Button type="button" variant="secondary" disabled={busy || !scheduleAt} onClick={onScheduleCall}>
            Schedule call
          </Button>
          <span className="min-w-[1rem] flex-1" />
          <Button
            type="button"
            variant="dangerGhost"
            size="sm"
            disabled={busy || person.isBlocked}
            onClick={onBlock}
          >
            {person.isBlocked ? "Account blocked" : "Block account"}
          </Button>
        </div>
      </section>

      {profiles.length ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Seller profiles</h3>
          <ul className="space-y-2">
            {profiles.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.displayName}</p>
                  <div className="mt-1">
                    <StatusPill tone={verifyTone(p.verificationStatus)}>{p.verificationStatus}</StatusPill>
                  </div>
                </div>
                {p.verificationStatus === "pending" ? (
                  <Button type="button" size="sm" disabled={busy} onClick={() => onApproveProfile(p.id)}>
                    Approve
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {lots.length ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Flocks</h3>
          <ul className="space-y-2">
            {lots.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium">{l.birdCount} birds</p>
                  <div className="mt-1">
                    <StatusPill tone={verifyTone(l.verificationStatus || "")}>
                      {l.verificationStatus || "—"}
                    </StatusPill>
                  </div>
                </div>
                {l.verificationStatus === "pending_review" ? (
                  <Button type="button" size="sm" disabled={busy} onClick={() => onApproveLot(l.id)}>
                    Approve
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {scoutApp ? (
        <section className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] px-3 py-2.5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Scout application</p>
            <div className="mt-1">
              <StatusPill tone={verifyTone(scoutApp.status)}>{scoutApp.status}</StatusPill>
            </div>
          </div>
          {scoutApp.status === "pending" ? (
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={busy} onClick={onApproveScout}>
                Approve
              </Button>
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onRejectScout}>
                Not a fit
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Timeline</h3>
        {touches.length === 0 ? (
          <p className="rounded-xl bg-[var(--surface-subtle)] px-3 py-3 text-sm text-[var(--text-muted)]">
            No calls logged yet. Add a note, then log the call.
          </p>
        ) : (
          <ul className="space-y-2">
            {touches.map((t) => (
              <li key={t.id} className="rounded-xl border border-[var(--border-color)] px-3 py-2.5 text-sm">
                <p className="font-medium">
                  {stageLabel(t.kind)}
                  {t.outcome ? ` · ${stageLabel(t.outcome)}` : ""}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {fmtDate(t.createdAt)}
                  {t.byName ? ` · ${t.byName}` : ""}
                  {t.scheduledFor ? ` · scheduled ${fmtDate(t.scheduledFor)}` : ""}
                </p>
                {t.note ? <p className="mt-1 text-[var(--text-secondary)]">{t.note}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Local-only sample of the person card. Not routed in production. */
export function SignupPersonPreview() {
  const { showToast } = useToast();
  const [person, setPerson] = useState<SignupPerson>({
    userId: "preview",
    accountType: "farmer",
    phone: "0784208580",
    district: "Muhanga",
    source: "facebook",
    stage: "new",
    createdAt: "2026-10-20T14:28:43.000Z",
    email: "sindayigayapacifique28@gmail.com",
    fullName: "Sindayigaya Pacifique",
    role: "farmer",
    isBlocked: false,
  });
  const [touches, setTouches] = useState<SignupTouch[]>([]);
  const [profiles, setProfiles] = useState([
    { id: "p1", displayName: "Sindayigaya Pacifique", verificationStatus: "pending" },
  ]);
  const [note, setNote] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");

  return (
    <div className="min-h-screen bg-[var(--surface-color)]">
      <Modal open onClose={() => undefined} title={person.fullName}>
        <PersonCard
          person={person}
          touches={touches}
          profiles={profiles}
          lots={[]}
          scoutApp={null}
          note={note}
          scheduleAt={scheduleAt}
          busy={false}
          onNote={setNote}
          onScheduleAt={setScheduleAt}
          onStage={(stage) => {
            setPerson((p) => ({ ...p, stage }));
            showToast("success", "Stage updated");
          }}
          onLogCall={() => {
            setTouches((list) => [
              {
                id: `t-${list.length + 1}`,
                kind: "call",
                outcome: "reached",
                scheduledFor: null,
                note: note || null,
                createdAt: new Date().toISOString(),
                byName: "You",
              },
              ...list,
            ]);
            setNote("");
            if (person.stage === "new") setPerson((p) => ({ ...p, stage: "contacted" }));
            showToast("success", "Call logged");
          }}
          onScheduleCall={() => {
            const when = new Date(scheduleAt).toISOString();
            setTouches((list) => [
              {
                id: `t-${list.length + 1}`,
                kind: "call",
                outcome: "scheduled",
                scheduledFor: when,
                note: note || null,
                createdAt: new Date().toISOString(),
                byName: "You",
              },
              ...list,
            ]);
            setPerson((p) => ({ ...p, stage: "call_booked", nextCallAt: when }));
            setNote("");
            showToast("success", "Call scheduled");
          }}
          onBlock={() => {
            setPerson((p) => ({ ...p, isBlocked: true }));
            showToast("success", "Account blocked");
          }}
          onApproveProfile={(id) => {
            setProfiles((rows) =>
              rows.map((row) => (row.id === id ? { ...row, verificationStatus: "verified" } : row))
            );
            showToast("success", "Profile approved");
          }}
          onApproveLot={() => showToast("success", "Flock approved")}
          onApproveScout={() => showToast("success", "Scout approved")}
          onRejectScout={() => showToast("success", "Marked not a fit")}
        />
      </Modal>
    </div>
  );
}
