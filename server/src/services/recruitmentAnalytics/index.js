/** Re-export the metrics module. This is the only place counts are defined. */

export { DEFINITIONS, DEFINITIONS_VERSION, definition } from "./definitions.js";
export { wilson, quantile, median, safeRate, periodChange, pace, xmr, timeSummary } from "./stats.js";
export { kigaliDate, kigaliWeek, previousRange, inRange, addDays, inclusiveDays } from "./time.js";
export { cohortFunnel, deriveStage, imputeStepTimes, ROLE_STEPS } from "./funnel.js";
export { stuckPeople, deadStatus, deadRate, DEFAULT_STUCK_RULES } from "./stuck.js";
export { normaliseChannel, channelLabel, channelTable, CHANNELS } from "./channels.js";
export { scoutStatus, STATUS_LABEL, RAMP_DAYS } from "./scouts.js";
export { supplyDemandBlock, coverageRatio } from "./liquidity.js";
export { statedBlock } from "./stated.js";
export { headline, whatsAppSummary } from "./headline.js";
export { resolveTarget, resolveTargets, DEFAULT_TARGETS } from "./targets.js";
export { maskPhone, phoneLooksPersonal } from "./phone.js";
export { buildSnapshot, reconcile, peopleForMetric, publicPerson, visibleToSalesOfficer } from "./snapshot.js";
export {
  buildCommand,
  commandHeadline,
  deltaText,
  doToday,
  leakSentence,
  passedProbation,
  publishSnapshot,
  queryFailure,
  rememberSnapshot,
  scoutsProducing,
  sliceForOfficer,
  sliceForView,
  tileContext,
  weeklyNotes,
  wordCount,
  STATEMENT_TIMEOUT_MS,
} from "./command.js";
export { cohortTriangle, trendBlock, hourHeatmap } from "./trends.js";
