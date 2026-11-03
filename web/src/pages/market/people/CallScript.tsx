import { Field, Input, SegmentedControl, Select, Textarea } from "../../../components/ui";
import type { RecruitmentContact } from "../../../api/marketInsights.api";
import { placeLabel } from "../flockDesk";
import { roleBrief, wantLabel } from "./peopleWork";

export type CallDraft = {
  locationConfirmed: string;
  locationCorrected: string;
  ownsBroilers: string;
  birdType: string;
  quantityMin: string;
  quantityMax: string;
  flockSize: string;
  readyInWeeks: string;
  canSlaughter: string;
  canDeliver: string;
  deliveryRequired: string;
  farmsKnown: string;
  note: string;
  understoodNext: string;
  buyerFor: string;
  birdReady: string;
  willVisit: string;
  speakingWithThem: string;
  whoAnswered: string;
};

const BUYER_FOR = ["butcher", "restaurant", "hotel", "vendor", "institution", "household"];
const BIRD_READY = [
  ["slaughtered", "Slaughtered"],
  ["alive", "Alive"],
  ["either", "Either"],
] as const;

export function CallScript<T extends CallDraft>({
  contact,
  call,
  setCall,
}: {
  contact: RecruitmentContact;
  call: T;
  setCall: (next: T) => void;
}) {
  const name = contact.name || "this person";
  const place = placeLabel(contact) || contact.district || "the place they gave";
  const patch = (part: Partial<CallDraft>) => setCall({ ...call, ...part });

  return (
    <div>
      <p className="pb-1 text-sm text-[var(--text-secondary)]">
        You are calling a {wantLabel(contact.want).toLowerCase()}. {roleBrief(contact.want)} Ask these in order, then write anything they added.
      </p>
      <div className="divide-y divide-[var(--border-color)]">
      <Question
        prompt={`Are you speaking with ${name}?`}
        value={call.speakingWithThem}
        onChange={(speakingWithThem) => patch({ speakingWithThem })}
        yesLabel="Yes, that's them"
        noLabel="Someone else"
      />
      {call.speakingWithThem === "no" ? (
        <Field className="py-3" label="Who is on the phone?">
          <Input value={call.whoAnswered} onChange={(e) => patch({ whoAnswered: e.target.value })} />
        </Field>
      ) : null}
      <Question
        prompt={`Is ${place} the right place?`}
        hint={contact.want === "sell" ? "Where the birds are." : contact.want === "scout" ? "Where they can visit farms." : "Where they want birds."}
        value={call.locationConfirmed}
        onChange={(locationConfirmed) => patch({ locationConfirmed })}
      />
      {call.locationConfirmed === "no" ? (
        <Field className="py-3" label="Where should we put them?">
          <Input value={call.locationCorrected} onChange={(e) => patch({ locationCorrected: e.target.value })} />
        </Field>
      ) : null}
      {contact.want === "sell" ? <SellerQuestions call={call} patch={patch} /> : null}
      {contact.want === "buy" ? <BuyerQuestions call={call} patch={patch} /> : null}
      {contact.want === "scout" ? <ScoutQuestions call={call} patch={patch} place={place} /> : null}
      <Question
        prompt="Did you explain what happens next?"
        hint={nextStepHint(contact.want)}
        value={call.understoodNext}
        onChange={(understoodNext) => patch({ understoodNext })}
        yesLabel="Yes, they understood"
        noLabel="Not yet"
      />
      <Field className="py-3" label="Anything else they said">
        <Textarea rows={3} value={call.note} onChange={(e) => patch({ note: e.target.value })} />
      </Field>
      </div>
    </div>
  );
}

function nextStepHint(want: string) {
  if (want === "buy") return "We review this call. Then they sign, confirm the place, add mobile money, and add their ID before they can request birds.";
  if (want === "scout") return "We review this call. Then they sign, confirm the place, add mobile money, and add their ID. Buyers see a flock only after we approve it. A scout is paid when that flock sells.";
  return "We review this call. Then they sign, confirm the place, add mobile money, and add their ID. Buyers see a flock only after that.";
}

function SellerQuestions<T extends CallDraft>({ call, patch }: { call: T; patch: (part: Partial<CallDraft>) => void }) {
  return (
    <>
      <Question
        prompt="Do they have broiler chickens they want to sell?"
        value={call.ownsBroilers}
        onChange={(ownsBroilers) => patch({ ownsBroilers })}
      />
      {call.ownsBroilers === "yes" ? (
        <>
          <Field className="py-3" label="What kind of birds?">
            <Select value={call.birdType} onChange={(e) => patch({ birdType: e.target.value })}>
              <option value="broiler">Broiler</option>
              <option value="hybrid">Hybrid</option>
              <option value="layer">Layer</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field className="py-3" label="Birds in the flock now" help="How many birds are on the farm today.">
            <Input inputMode="numeric" value={call.flockSize} onChange={(e) => patch({ flockSize: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field className="py-3" label="Fewest they will sell">
              <Input inputMode="numeric" value={call.quantityMin} onChange={(e) => patch({ quantityMin: e.target.value })} />
            </Field>
            <Field className="py-3" label="Most they will sell">
              <Input inputMode="numeric" value={call.quantityMax} onChange={(e) => patch({ quantityMax: e.target.value })} />
            </Field>
          </div>
          <Field className="py-3" label="Weeks until they can sell" help="0 means the birds are ready now. 8 is the longest we record.">
            <Input inputMode="numeric" value={call.readyInWeeks} onChange={(e) => patch({ readyInWeeks: e.target.value })} />
          </Field>
        </>
      ) : null}
      <Question
        prompt="Can they slaughter the birds on the farm?"
        value={call.canSlaughter}
        onChange={(canSlaughter) => patch({ canSlaughter })}
      />
      <Question
        prompt="Can they deliver the birds?"
        hint="No means the buyer collects them."
        value={call.canDeliver}
        onChange={(canDeliver) => patch({ canDeliver })}
      />
    </>
  );
}

function BuyerQuestions<T extends CallDraft>({ call, patch }: { call: T; patch: (part: Partial<CallDraft>) => void }) {
  return (
    <>
      <Field className="py-3" label="Who are they buying for?">
        <Select value={call.buyerFor} onChange={(e) => patch({ buyerFor: e.target.value })}>
          <option value="">Choose</option>
          {BUYER_FOR.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field className="py-3" label="Fewest birds a week">
          <Input inputMode="numeric" value={call.quantityMin} onChange={(e) => patch({ quantityMin: e.target.value })} />
        </Field>
        <Field className="py-3" label="Most birds a week">
          <Input inputMode="numeric" value={call.quantityMax} onChange={(e) => patch({ quantityMax: e.target.value })} />
        </Field>
      </div>
      <Field className="py-3" label="How do they want the birds?">
        <Select value={call.birdReady} onChange={(e) => patch({ birdReady: e.target.value })}>
          <option value="">Choose</option>
          {BIRD_READY.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </Field>
      <Question
        prompt="Do the birds have to be delivered to them?"
        value={call.deliveryRequired}
        onChange={(deliveryRequired) => patch({ deliveryRequired })}
      />
    </>
  );
}

function ScoutQuestions<T extends CallDraft>({
  call,
  patch,
  place,
}: {
  call: T;
  patch: (part: Partial<CallDraft>) => void;
  place: string;
}) {
  return (
    <>
      <Question
        prompt={`Will they visit farms around ${place}?`}
        value={call.willVisit}
        onChange={(willVisit) => patch({ willVisit })}
      />
      <Field className="py-3" label="Farms they already know there" help="Optional. Leave blank if they are not sure.">
        <Input inputMode="numeric" value={call.farmsKnown} onChange={(e) => patch({ farmsKnown: e.target.value })} />
      </Field>
    </>
  );
}

function Question({
  prompt,
  hint,
  value,
  onChange,
  yesLabel = "Yes",
  noLabel = "No",
}: {
  prompt: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{prompt}</p>
        {hint ? <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{hint}</p> : null}
      </div>
      <SegmentedControl
        size="sm"
        value={value === "yes" || value === "no" ? value : ""}
        onChange={onChange}
        options={[
          { value: "yes", label: yesLabel },
          { value: "no", label: noLabel },
        ]}
      />
    </div>
  );
}
