import { useRef, useState } from "react";
import { Button, FacetFilter, Field, Input, SegmentedControl, Select, TableToolbar, Textarea, TextLink } from "../../../components/ui";
import { formatRwf } from "../../../lib/formatRwf";
import type { ChannelRow, CommandSnapshot, CommandTile, PersonRow, WeeklyNotes } from "./api";
import { formatRate, formatWhen } from "./format";
import { useCompanyNav } from "../../../hooks/useCompanyNav";
import { SourceFollowUp } from "./sourceFollowUp";
import { DistrictMap } from "../../../components/maps/DistrictMap";
import { whiteSpaceDistricts } from "../../../components/maps/districtMapModel";
import { BarRow, DotPipeline, HeroTile, Worklist } from "./ui";

function stepLabel(id: string) {
  const known: Record<string, string> = {
    account: "Account",
    applied: "Applied",
    contacted: "Contacted",
    verified: "Verified",
    live: "Live",
    kyc: "KYC",
    approved: "Approved",
    requested: "Requested",
    first_sale: "First sale",
  };
  if (known[id]) return known[id];
  return id.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function tierHit(tile: CommandTile) {
  if (tile.unavailable || tile.value == null) return "Unavailable";
  if (tile.target == null) return "No weekly target";
  if (tile.targetT2 != null && tile.value >= tile.targetT2) return "Stretch met";
  if (tile.value >= tile.target) return "Target met";
  return "Below target";
}

export function OverviewView({
  snap,
  onOpen,
  onPerson,
}: {
  snap: CommandSnapshot;
  onOpen: (metric: string, extra?: Record<string, string>) => void;
  onPerson: (personId: string) => void;
}) {
  const command = snap.command;
  const { companyHref } = useCompanyNav();
  const maxSource = Math.max(1, ...command.sources.map((row) => row.live));
  const work = command.worklist.rows.map((row) => ({ ...row, openHref: companyHref(row.openHref) }));
  return (
    <div className="rec-stack">
      <p className="rec-headline">
        {(command.headline.segments || [{ text: command.headline.text, emphasis: false }]).map((part, index) =>
          part.emphasis ? <strong key={index}>{part.text}</strong> : <span key={index}>{part.text}</span>
        )}
      </p>
      <div className="rec-tiles">
        {command.tiles.map((tile) => (
          <HeroTile
            key={tile.id}
            tile={tile}
            onOpen={() =>
              onOpen(
                tile.id === "sellers" ? "sellersActivated" : tile.id === "buyers" ? "buyersActivated" : tile.id === "scouts" ? "scoutsProducing" : "passedProbation"
              )
            }
          />
        ))}
      </div>
      <div className="rec-split">
        <section className="rec-card">
          <div className="rec-section-head">
            <h2>Do today</h2>
            {command.worklist.total ? <span className="rec-chip">{command.worklist.total} waiting</span> : null}
          </div>
          <Worklist
            rows={work}
            total={command.worklist.total}
            onOpen={() => onOpen("stuck")}
            onPerson={onPerson}
          />
        </section>
        <section className="rec-card">
          <h2>Pipeline now</h2>
          {command.pipeline.length ? (
            <DotPipeline rows={command.pipeline} onOpen={(stage) => onOpen("stage", { stage, personRole: "seller" })} />
          ) : (
            <p className="rec-empty">No sellers in the pipeline.</p>
          )}
        </section>
      </div>
      <div className={command.supply.available ? "rec-split" : "rec-stack"}>
        <section className="rec-card">
          <h2>Sources</h2>
          {command.sources.length ? (
            command.sources.map((row) => (
              <BarRow
                key={row.channel}
                label={row.label}
                value={row.live}
                max={maxSource}
                suffix={`${row.live} live`}
                onOpen={() => onOpen("channel", { channel: row.channel })}
              />
            ))
          ) : (
            <p className="rec-empty">No accounts in this range.</p>
          )}
        </section>
        {command.supply.available ? (
          <section className="rec-card">
            <h2>Supply vs demand</h2>
            <p className="rec-count">
              {command.supply.liveBirds} listed · {command.supply.demandBirds} wanted
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}

export function PipelineView({
  snap,
  onOpen,
}: {
  snap: CommandSnapshot;
  onOpen: (metric: string, extra?: Record<string, string>) => void;
}) {
  const [table, setTable] = useState(false);
  const funnels = snap.funnels || {};
  return (
    <div className="rec-stack">
      <p className="rec-headline">{snap.command.leak}</p>
      <div className="rec-section-head">
        <h2>Stages</h2>
        <SegmentedControl
          label="Pipeline view"
          size="sm"
          value={table ? "table" : "bars"}
          onChange={(value) => setTable(value === "table")}
          options={[
            { value: "bars", label: "Bars" },
            { value: "table", label: "Table" },
          ]}
        />
      </div>
      {Object.entries(funnels).map(([role, funnel]) => {
        const max = Math.max(1, funnel.entryN);
        return (
          <section key={role} className="rec-card">
            <h2>{stepLabel(role)}</h2>
            {table ? (
              <table className="rec-table">
                <caption className="sr-only">{role} funnel</caption>
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Reached</th>
                    <th>Of previous</th>
                    <th>Days</th>
                  </tr>
                </thead>
                <tbody>
                  {funnel.steps.map((step) => (
                    <tr key={step.id}>
                      <td>{stepLabel(step.id)}</td>
                      <td className="rec-count">{step.reach}</td>
                      <td>{step.ofPrev == null ? "n/a" : formatRate(step.reach, step.ofPrevDen || 0)}</td>
                      <td>{step.medianDaysFromPrev == null ? "—" : `${step.medianDaysFromPrev.toFixed(1)}d`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              funnel.steps.map((step) => (
                <BarRow
                  key={step.id}
                  label={stepLabel(step.id)}
                  value={step.reach}
                  max={max}
                  suffix={step.ofPrev == null ? String(step.reach) : formatRate(step.reach, step.ofPrevDen || step.reach)}
                  onOpen={() => onOpen("funnel", { step: step.id, personRole: role })}
                />
              ))
            )}
            {stepNote(funnel.steps)}
          </section>
        );
      })}
      <section className="rec-card">
        <h2>Days in the current stage</h2>
        <table className="rec-table">
          <caption className="sr-only">Days waiting by stage</caption>
          <thead>
            <tr>
              <th>Stage</th>
              <th>0–2d</th>
              <th>3–5d</th>
              <th>6d+</th>
            </tr>
          </thead>
          <tbody>
            {snap.command.waiting.map((row) => (
              <tr key={row.stage}>
                <td>{row.label}</td>
                <td className="rec-count">{row.d0}</td>
                <td className="rec-count">{row.d3}</td>
                <td className="rec-count">{row.d6}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function stepNote(steps: { lowSample?: boolean }[]) {
  if (!steps.some((step) => step.lowSample)) return null;
  return <p className="rec-note"><span aria-hidden>○</span> Small sample</p>;
}

export function SourcesView({
  snap,
  onOpen,
  onSpend,
  onLink,
}: {
  snap: CommandSnapshot;
  onOpen: (metric: string, extra?: Record<string, string>) => void;
  onSpend: (body: { date: string; channel: string; amountRwf: number }) => Promise<void>;
  onLink: (body: { channel: string; destination: string }) => Promise<string>;
}) {
  const [table, setTable] = useState(true);
  const [date, setDate] = useState(snap.meta.week?.from || "");
  const catalog = snap.meta.channelCatalog || snap.command.channelCatalog || [];
  const channelOptions = [...catalog];
  for (const row of snap.channels || []) {
    if (!channelOptions.some((item) => item.id === row.channel)) {
      channelOptions.push({ id: row.channel, label: row.label });
    }
  }
  const [channel, setChannel] = useState(channelOptions[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [made, setMade] = useState("");
  const [saved, setSaved] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const rows = snap.channels || [];
  const max = Math.max(1, ...rows.map((row) => row.activatedSellers.x));
  function chooseSpend(id: string) {
    setChannel(id);
    setSaved("");
    requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLInputElement>("input[inputmode='numeric']")?.focus();
    });
  }
  return (
    <div className="rec-stack">
      <div className="rec-section-head">
        <h2>Source performance</h2>
        <SegmentedControl
          label="Source view"
          size="sm"
          value={table ? "table" : "bars"}
          onChange={(value) => setTable(value === "table")}
          options={[
            { value: "table", label: "Table" },
            { value: "bars", label: "Bars" },
          ]}
        />
      </div>
      {snap.meta.modules?.opens === "unavailable" ? <p className="rec-note">Opens unavailable</p> : null}
      {table ? (
        <div className="rec-scroll">
          <table className="rec-table">
            <caption className="sr-only">Channels</caption>
            <thead>
              <tr>
                <th>Channel</th>
                <th>Opens</th>
                <th>Accounts</th>
                <th>Live sellers</th>
                <th>In progress</th>
                <th>Inactive</th>
                <th>Spend</th>
                <th>Cost / account</th>
                <th>Cost / live</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ChannelLine
                  key={row.channel}
                  row={row}
                  onOpen={() => onOpen("channel", { channel: row.channel })}
                  onAddSpend={() => chooseSpend(row.channel)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        rows.filter((row) => row.accounts > 0 || row.activatedSellers.x > 0).map((row) => (
          <BarRow
            key={row.channel}
            label={row.label}
            value={row.activatedSellers.x}
            max={max}
            suffix={formatRate(row.activatedSellers.x, row.activatedSellers.of)}
            onOpen={() => onOpen("channel", { channel: row.channel })}
          />
        ))
      )}
      <form
        ref={formRef}
        className="rec-form"
        onSubmit={(event) => {
          event.preventDefault();
          const amountRwf = Number(amount);
          if (!channel || !Number.isFinite(amountRwf) || amountRwf < 0) {
            setSaved("Enter a channel and an amount in RWF.");
            return;
          }
          void onSpend({ date, channel, amountRwf })
            .then(() => {
              setSaved("Spend saved.");
              setAmount("");
            })
            .catch((err: Error) => setSaved(err.message || "Could not save spend."));
        }}
      >
        <Field label="Spend date">
          <Input value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
        <Field label="Channel">
          <Select value={channel} onChange={(event) => setChannel(event.target.value)} aria-label="Spend channel">
            <option value="">Choose a channel</option>
            {channelOptions.map((row) => (
              <option key={row.id} value={row.id}>{row.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="RWF">
          <Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="numeric" />
        </Field>
        <Button className="rec-inline" type="submit" size="sm">Save spend</Button>
        {saved ? <p className="rec-note" role="status">{saved}</p> : null}
      </form>
      <div>
        <Button
          className="rec-inline"
          variant="secondary"
          size="sm"
          onClick={() => {
            void onLink({ channel, destination: "/signup" }).then(setMade);
          }}
        >
          Create tracked link
        </Button>
        {made ? <p className="rec-note">Link path: {made}</p> : null}
      </div>
      <SourceFollowUp />
    </div>
  );
}

function money(value: number | null | undefined) {
  if (value == null) return "—";
  return formatRwf(value);
}

function inProgress(row: ChannelRow) {
  if (row.dead.tooEarly) return "Too early";
  const left = row.sellers - row.activatedSellers.x - row.dead.x;
  if (left < 0) return "check data";
  return String(left);
}

function ChannelLine({ row, onOpen, onAddSpend }: { row: ChannelRow; onOpen: () => void; onAddSpend: () => void }) {
  const perLive = row.costPerActivation;
  return (
    <tr className={row.pinned ? "rec-pin" : ""}>
      <td>{row.label}{row.lowSample ? " · Small sample" : ""}</td>
      <td>{row.opens == null ? "Not tracked" : row.opens}</td>
      <td>
        <TextLink onClick={onOpen}>{row.accounts}</TextLink>
      </td>
      <td>{formatRate(row.activatedSellers.x, row.activatedSellers.of)}</td>
      <td>{inProgress(row)}</td>
      <td>{row.dead.tooEarly ? "Too early" : formatRate(row.dead.x, row.dead.of)}</td>
      <td>
        {row.spendRwf == null ? (
          <TextLink onClick={onAddSpend}>Spend not entered</TextLink>
        ) : (
          formatRwf(row.spendRwf)
        )}
      </td>
      <td>{money(row.costPerAccount)}</td>
      <td>{typeof perLive === "object" && perLive ? perLive.text : money(typeof perLive === "number" ? perLive : null)}</td>
    </tr>
  );
}

export function ScoutsView({
  snap,
  onScout,
  onDistrict,
}: {
  snap: CommandSnapshot;
  onScout: (personId: string) => void;
  onDistrict?: (district: string) => void;
}) {
  const rows = snap.scouts?.rows || [];
  const districts = snap.scouts?.byDistrict || [];
  const max = Math.max(1, ...districts.map((row) => row.lots));
  const supply = snap.supplyDemand;
  const gaps = supply?.available
    ? whiteSpaceDistricts(supply.byDistrict || [], districts)
    : [];
  return (
    <div className="rec-stack">
      <h2>Scouts</h2>
      {rows.length === 0 ? <p className="rec-empty">No scouts in this filter.</p> : null}
      <div className="rec-scroll">
        <table className="rec-table">
          <caption className="sr-only">Scouts</caption>
          <thead>
            <tr>
              <th>Scout</th>
              <th>Status</th>
              <th>Lots</th>
              <th>Sellers</th>
              <th>Buyers</th>
              <th>Birds</th>
              <th>Unpaid</th>
              <th>Last activity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.personId}>
                <td>
                  <TextLink onClick={() => onScout(row.personId)}>{row.label}</TextLink>
                </td>
                <td><span className={`rec-pill rec-pill-${row.status}`}>{row.statusLabel}</span></td>
                <td className="rec-count">{row.lots}{row.lotTarget ? ` / ${row.lotTarget}` : ""}</td>
                <td className="rec-count">{row.sellers}</td>
                <td className="rec-count">{row.buyers ?? 0}</td>
                <td className="rec-count">{row.birds}</td>
                <td>{formatRwf(row.unpaidRwf)}</td>
                <td>{formatWhen(row.lastActivityAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="rec-card">
        <h2>By district</h2>
        <DistrictMap
          layers={[
            {
              id: "scouts",
              label: "Scouts",
              rows: districts.map((row) => ({
                district: row.district,
                value: row.scouts,
                label: `${row.scouts} ${row.scouts === 1 ? "scout" : "scouts"}, ${row.lots} ${row.lots === 1 ? "lot" : "lots"}`,
              })),
            },
            {
              id: "lots",
              label: "Lots",
              rows: districts.map((row) => ({
                district: row.district,
                value: row.lots,
                label: `${row.lots} ${row.lots === 1 ? "lot" : "lots"}, ${row.scouts} ${row.scouts === 1 ? "scout" : "scouts"}`,
              })),
            },
          ]}
          onSelect={onDistrict}
        />
        {supply && supply.available === false ? (
          <p className="mt-3 type-caption text-[var(--text-secondary)]">
            {supply.reason || "Supply and demand are not available."}
          </p>
        ) : null}
        {supply?.available ? (
          <div className="mt-3">
            <p className="type-label">White space</p>
            {gaps.length === 0 ? (
              <p className="type-caption text-[var(--text-secondary)]">Every district with supply or demand has a scout.</p>
            ) : (
              <ul className="mt-1 space-y-1 type-caption text-[var(--text-secondary)]">
                {gaps.map((row) => (
                  <li key={row.district}>
                    {row.district}: {row.supply} birds listed, {row.demand} wanted, no scout.
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        <div className="mt-3">
          {districts.map((row) => (
            <BarRow key={row.district} label={row.district} value={row.lots} max={max} suffix={`${row.lots} lots`} />
          ))}
        </div>
      </section>
    </div>
  );
}

function tierTone(label: string) {
  if (label === "Stretch met" || label === "Target met") return "hit";
  if (label === "Below target") return "below";
  if (label === "Unavailable") return "unavailable";
  return "neutral";
}

function scoreLine(tile: CommandTile) {
  const hit = tierHit(tile);
  if (tile.unavailable || tile.value == null) return "Unavailable";
  if (tile.target == null) return hit;
  return `${tile.value} of ${tile.target} · ${hit.toLowerCase()}`;
}

export function WeeklyView({
  snap,
  weeks,
  frozen,
  onPickWeek,
  onFreeze,
  onCopy,
}: {
  snap: CommandSnapshot;
  weeks: { week: string }[];
  frozen: CommandSnapshot | null;
  onPickWeek: (week: string) => void;
  onFreeze: (notes: WeeklyNotes) => Promise<void>;
  onCopy: (text: string) => void;
}) {
  const shown = frozen || snap;
  const tiles = shown.command?.tiles || snap.command.tiles;
  const text = shown.briefing?.whatsappText || shown.command?.headline?.text || snap.headline.text;
  const [picked, setPicked] = useState("");
  const [goingWell, setGoingWell] = useState("");
  const [notGoingWell, setNotGoingWell] = useState("");
  const [supportNeeded, setSupportNeeded] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="briefing-print rec-stack">
      <TableToolbar
        className="rec-no-print"
        filters={
          <FacetFilter
            label="Saved report"
            value={picked}
            allValue=""
            allLabel="This week (live)"
            onChange={(value) => { setPicked(value); onPickWeek(value); }}
            options={weeks.map((row) => ({ value: row.week, label: row.week }))}
          />
        }
        actions={
          <>
            <Button className="rec-inline" variant="secondary" size="sm" onClick={() => onCopy(text)}>Copy for WhatsApp</Button>
            <Button className="rec-inline" variant="secondary" size="sm" onClick={() => window.print()}>Print</Button>
          </>
        }
      />
      {frozen ? <p className="rec-note">Frozen week. These numbers stay as they were saved.</p> : null}
      <section className="rec-score rec-print-only">
        {tiles.map((tile) => {
          const hit = tierHit(tile);
          const unavailable = tile.unavailable || tile.value == null;
          return (
            <article key={tile.id} className={`rec-tile rec-score-card ${unavailable ? "rec-hatch" : ""}`}>
              <h2 className="rec-tile-label">{tile.label}</h2>
              {unavailable ? (
                <p className="rec-unavailable">Unavailable</p>
              ) : (
                <p className="rec-hero-row">
                  <span className="rec-hero">{tile.value}</span>
                  {tile.target != null ? <span className="rec-of">/ {tile.target}</span> : null}
                </p>
              )}
              <p className={`rec-status rec-status-${tierTone(hit)}`}>{scoreLine(tile)}</p>
            </article>
          );
        })}
      </section>
      <section>
        <h2>This week</h2>
        <div className="rec-form rec-notes">
          <Field label="Going well">
            <Textarea value={goingWell} onChange={(event) => setGoingWell(event.target.value)} />
          </Field>
          <Field label="Not going well">
            <Textarea value={notGoingWell} onChange={(event) => setNotGoingWell(event.target.value)} />
          </Field>
          <Field label="Support needed">
            <Textarea value={supportNeeded} onChange={(event) => setSupportNeeded(event.target.value)} />
          </Field>
        </div>
        <Button
          className="rec-inline rec-no-print"
          size="sm"
          onClick={() => {
            if (!window.confirm("Freeze this week? The saved numbers will not change when live data changes.")) return;
            const notes = {
              goingWell: lines(goingWell),
              notGoingWell: lines(notGoingWell),
              supportNeeded: lines(supportNeeded),
            };
            void onFreeze(notes).then(() => setNote("This week is frozen.")).catch((err: Error) => setNote(err.message));
          }}
        >
          Freeze this week
        </Button>
        {note ? <p className="rec-note">{note}</p> : null}
      </section>
    </div>
  );
}

function lines(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 3);
}

export function PeopleList({
  people,
  onReveal,
}: {
  people: PersonRow[];
  onReveal?: (personId: string) => void;
}) {
  if (!people.length) return <p className="rec-empty">No people in this list.</p>;
  return (
    <ul className="rec-people">
      {people.map((person) => (
        <li key={person.personId}>
          <p className="font-semibold">{person.label}</p>
          <p className="rec-note">
            {[person.label.toLowerCase() === person.role.toLowerCase() ? null : person.role, person.stage, person.district, person.channel]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="rec-phone">{person.phone}</p>
          {onReveal ? (
            <TextLink onClick={() => onReveal(person.personId)}>{person.phoneMasked ? "Reveal phone" : "Revealed"}</TextLink>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
