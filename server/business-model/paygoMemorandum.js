/**
 * Capital stack helpers — mirrors Business Model / investor_pdf.py `capital_stack_for_report`
 * and app.py `_capital_split_from_li`.
 */

export function capitalStackForReport(peakDebtModeled, investorPct, creditorPct) {
  let inv = Number(investorPct);
  let cred = Number(creditorPct);
  if (!Number.isFinite(inv)) inv = 30;
  if (!Number.isFinite(cred)) cred = 70;
  if (Math.abs(inv + cred - 100.0) > 0.5) {
    cred = Math.max(0.0, 100.0 - inv);
  }
  const credShare = cred > 1e-9 ? cred / 100.0 : 1.0;
  const peak = Math.max(0.0, Number(peakDebtModeled) || 0);
  const implied_total = credShare > 1e-9 ? peak / credShare : peak;
  const implied_equity = implied_total - peak;
  return {
    investor_pct: inv,
    creditor_pct: cred,
    creditor_tranche_peak: peak,
    implied_total_capital: implied_total,
    implied_equity_raise: Math.max(0.0, implied_equity),
  };
}

export function capitalSplitFromCtl(ctl) {
  if (!ctl || typeof ctl !== "object") return { investor_pct: 30, creditor_pct: 70 };
  let inv = Number(ctl.investor_capital_pct);
  let cred = Number(ctl.creditor_capital_pct);
  if (!Number.isFinite(inv)) inv = 30;
  if (!Number.isFinite(cred)) cred = 100 - inv;
  if (Math.abs(inv + cred - 100.0) > 0.5) {
    cred = 100 - inv;
  }
  return { investor_pct: inv, creditor_pct: Math.max(0, Math.min(100, cred)) };
}
