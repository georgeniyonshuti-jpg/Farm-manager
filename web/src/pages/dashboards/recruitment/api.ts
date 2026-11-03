import { API_BASE_URL } from "../../../api/config";
import { jsonAuthHeaders, readAuthHeaders } from "../../../lib/authHeaders";

export type HeadlineSegment = { text: string; emphasis: boolean };

export type MetricCard = {
  definitionId: string;
  mode?: string;
  value: number;
  n: number;
  target?: number | null;
  targetVersion?: string | null;
  pace?: string | null;
  delta?: { abs: number; pct: number | null; direction: string };
  personIds?: string[];
};

export type FunnelStep = {
  id: string;
  reach: number;
  n: number;
  ofPrev: number | null;
  ofPrevDen?: number | null;
  medianDaysFromPrev: number | null;
  lowSample?: boolean;
  definitionId: string;
};

export type ChannelRow = {
  channel: string;
  label: string;
  pinned?: boolean;
  opens: number | null;
  accounts: number;
  sellers: number;
  activatedSellers: { x: number; of: number; rate: number | null };
  dead: { tooEarly?: boolean; x: number; of: number };
  medianDaysToActivate: { value: number | null; n: number };
  spendRwf: number | null;
  costPerAccount: number | null;
  costPerActivation: number | { text: string; amount: number } | null;
  quality: number | null;
  qualityLabel: string | null;
  lowSample?: boolean;
  wilson?: { low: number; high: number; n: number } | null;
  n: number;
  definitionId: string;
};

export type ScoutRow = {
  personId: string;
  label: string;
  status: string;
  statusLabel: string;
  tenureDays: number | null;
  lots: number;
  sellers: number;
  birds: number;
  unpaidRwf: number;
  n: number;
  definitionId: string;
  district?: string;
  buyers?: number;
  lotTarget?: number;
  sellerTarget?: number;
  birdTarget?: number;
  lastActivityAt?: string | null;
};

export type PersonRow = {
  personId: string;
  role: string;
  label: string;
  district: string;
  stage: string;
  phone: string;
  phoneMasked: boolean;
  channel: string;
  createdAt: string;
};

export type StatedBlock = {
  available: boolean;
  reason?: string;
  mode?: string;
  label?: string;
  sellers?: {
    definitionId: string;
    n: number;
    flockBirds: number;
    buckets: { id: string; label: string; n: number; birds: number }[];
    ready: { n: number; birds: number; definitionId: string };
    canSlaughter: { x: number; of: number; definitionId: string };
    canDeliver: { x: number; of: number; definitionId: string };
  };
  buyers?: {
    definitionId: string;
    n: number;
    weeklyFloor: number;
    byType: { id: string; n: number; birds: number }[];
    missingType: { n: number; birds: number };
    byForm: { id: string; n: number; birds: number }[];
    missingForm: { n: number; birds: number };
  };
  scouts?: {
    definitionId: string;
    n: number;
    willVisit: number;
    farms: { n: number; sum: number; definitionId: string };
  };
  sentences?: {
    slaughter: { district: string; buyers: number; sellersCannot: number } | null;
    balance: { district: string; gap: number; rule: string } | null;
  };
};

export type RecruitmentSnapshot = {
  meta: {
    generatedAt: string;
    timezone: string;
    range: { from: string; to: string };
    prevRange: { from: string; to: string };
    week: { from: string; to: string; elapsedFraction: number };
    definitionsVersion: string;
    note?: string | null;
    windowDays?: number;
  };
  headline: { segments: HeadlineSegment[]; text: string };
  kpis: {
    sellersActivated: MetricCard;
    sellersLiveUnverified: MetricCard;
    buyersActivated: MetricCard;
    scoutsActivated: MetricCard;
  };
  funnels: Record<
    string,
    {
      mode: string;
      windowDays: number;
      entryN: number;
      steps: FunnelStep[];
      biggestLeak: { from: string; to: string; drop: number; eligible: boolean } | null;
    }
  >;
  channels: ChannelRow[];
  channelTotals: { accounts: number; sellers: number; activatedSellers: number };
  pipeline: Record<string, { stage: string; count: number; n: number }[]>;
  alerts: { id: string; severity: string; count: number; rule: string; n: number; href?: string }[];
  scouts: {
    rows: ScoutRow[];
    totals: { lots: number; sellers: number; birds: number; unpaidRwf: number };
  };
  supplyDemand: {
    available: boolean;
    reason?: string;
    liveBirds?: number;
    demandBirds?: number;
    demandLabel?: string;
    coverage?: number | null;
    byDistrict?: { district: string; supply: number; demand: number; coverage: number | null }[];
    forecast?: { birds: number; label: string } | null;
    forecastHiddenReason?: string | null;
    sentences?: { recruitSellers?: { district: string; gap: number; rule: string } | null };
  };
  stated: StatedBlock;
  trends: {
    inputs: { week: string; sellersActivated: number; n: number; definitionId: string }[];
    xmr: { label: string; points: number[] } | null;
    xmrReason: string | null;
    cohorts: {
      available: boolean;
      hiddenReason: string | null;
      rows: { cohort: string; n: number; cells: { age: number; value: number | null; state: string; reached?: number }[] }[];
    };
    histogram: { n: number; buckets: { id: string; n: number }[]; definitionId: string };
    heatmap: { available: boolean; reason?: string; n: number };
    twelveMonthsReason?: string | null;
  };
  quality: {
    confidence: string;
    checks: { id: string; label: string; count: number; severity: string }[];
    freshnessMinutes: number;
    reconciliation: { ok: boolean; failures: { id: string }[] };
  };
  briefing: { whatsappText: string; slides: { id: string; title: string }[] };
  recommendations: { id: string; rule: string; text: string; owner: string }[];
};

export type CommandTile = {
  id: string;
  label: string;
  value: number | null;
  n: number;
  unavailable?: boolean;
  delta: string | null;
  context: string;
  target: number | null;
  targetT2: number | null;
  spark: number[];
  definitionId: string;
  mode?: string;
  sellers?: number;
  scouts?: number;
};

export type WorkRow = {
  personId: string;
  role: string;
  roleLabel: string;
  label: string;
  district: string;
  stage: string;
  stageLabel: string;
  waitedDays: number;
  text: string;
  whatsappHref: string | null;
  openHref: string;
};

export type WeeklyNotes = {
  goingWell: string[];
  notGoingWell: string[];
  supportNeeded: string[];
};

export type CommandBlock = {
  headline: { text: string; segments?: { text: string; emphasis: boolean }[] };
  tiles: CommandTile[];
  worklist: { total: number; shown: number; rows: WorkRow[]; n: number };
  pipeline: { stage: string; label: string; count: number }[];
  waiting: { stage: string; label: string; count: number; d0: number; d3: number; d6: number }[];
  sources: { channel: string; label: string; live: number; of: number; accounts: number; opens: number | null; pinned?: boolean }[];
  supply: { available: boolean; reason: string | null; liveBirds: number | null; demandBirds: number | null };
  leak: string;
  channelCatalog?: { id: string; label: string }[];
};

export type CommandSnapshot = {
  view?: string;
  stale?: boolean;
  staleReason?: string | null;
  meta: {
    generatedAt: string;
    timezone?: string;
    week?: { from: string; to: string };
    durationMs?: number;
    definitionsVersion?: string;
    note?: string | null;
    modules?: Record<string, string>;
    districts?: string[];
    channels?: string[];
    channelCatalog?: { id: string; label: string }[];
  };
  headline: { text: string; segments?: { text: string; emphasis: boolean }[] };
  command: CommandBlock;
  funnels?: RecruitmentSnapshot["funnels"];
  channels?: ChannelRow[];
  channelTotals?: { accounts: number; sellers: number; activatedSellers: number };
  scouts?: {
    rows: ScoutRow[];
    totals: { lots: number; sellers: number; birds: number; unpaidRwf: number };
    byDistrict?: { district: string; scouts: number; lots: number }[];
  };
  briefing?: { whatsappText: string; slides?: { id: string; title: string }[] };
  supplyDemand?: RecruitmentSnapshot["supplyDemand"];
  quality?: RecruitmentSnapshot["quality"];
};

async function send<T>(token: string | null, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api/analytics/recruitment${path}`, {
    ...init,
    headers: init?.body ? jsonAuthHeaders(token) : readAuthHeaders(token),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Recruitment analytics failed (${res.status})`);
  }
  return data as T;
}

export function fetchRecruitmentSnapshot(
  token: string | null,
  query: { from: string; to: string; role?: string; channels?: string; districts?: string; view?: string }
): Promise<CommandSnapshot> {
  const params = new URLSearchParams({ from: query.from, to: query.to, view: query.view || "all" });
  if (query.role) params.set("role", query.role);
  if (query.channels) params.set("channels", query.channels);
  if (query.districts) params.set("districts", query.districts);
  return send(token, `/snapshot?${params.toString()}`);
}

export function fetchDefinitions(token: string | null) {
  return send<{
    version: string;
    source: string;
    sql: string | null;
    definitions: { id: string; label: string; definition: string; formula?: string }[];
  }>(token, "/definitions");
}

export function fetchBriefingWeeks(token: string | null) {
  return send<{ weeks: { week: string; createdAt: string }[] }>(token, "/briefings");
}

export function fetchBriefing(token: string | null, week: string) {
  return send<{ week: string; snapshot: CommandSnapshot; notes: WeeklyNotes; restated?: boolean }>(
    token,
    `/briefings/${week}`
  );
}

export function fetchRecruitmentPeople(
  token: string | null,
  query: Record<string, string>
): Promise<{ people: PersonRow[]; n: number; definitionId: string }> {
  const params = new URLSearchParams(query);
  return send(token, `/people?${params.toString()}`);
}

export function postRecruitment(token: string | null, path: string, body: unknown) {
  return send(token, path, { method: "POST", body: JSON.stringify(body) });
}
