import { useMemo, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type ScheduleRow = {
  month: number;
  opening: number;
  payment: number;
  interest: number;
  principal: number;
  expectedLoss: number;
  netCash: number;
  closing: number;
};

function fmtRwf(v: number): string {
  return `RWF ${Math.round(v).toLocaleString()}`;
}

function monthlyRate(annualPct: number): number {
  return Math.max(0, annualPct) / 100 / 12;
}

function amortizedPayment(principal: number, r: number, n: number): number {
  if (n <= 0) return 0;
  if (r <= 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

function toCsv(rows: ScheduleRow[]): string {
  const header = ["month", "opening_rwf", "payment_rwf", "interest_rwf", "principal_rwf", "expected_loss_rwf", "net_cash_rwf", "closing_rwf"];
  const body = rows.map((r) =>
    [r.month, r.opening, r.payment, r.interest, r.principal, r.expectedLoss, r.netCash, r.closing].join(",")
  );
  return [header.join(","), ...body].join("\n");
}

export function GeneralLendingPage() {
  const [principal, setPrincipal] = useState(50_000_000);
  const [annualRatePct, setAnnualRatePct] = useState(24);
  const [termMonths, setTermMonths] = useState(24);
  const [processingFeePct, setProcessingFeePct] = useState(2);
  const [monthlyDefaultPct, setMonthlyDefaultPct] = useState(1.2);
  const [recoveryPct, setRecoveryPct] = useState(35);
  const [opexPctOfPortfolio, setOpexPctOfPortfolio] = useState(0.6);

  const result = useMemo(() => {
    const r = monthlyRate(annualRatePct);
    const n = Math.max(1, Math.floor(termMonths));
    const payment = amortizedPayment(principal, r, n);
    const defaultRate = Math.max(0, monthlyDefaultPct) / 100;
    const recovery = Math.max(0, Math.min(1, recoveryPct / 100));
    const opex = Math.max(0, opexPctOfPortfolio) / 100;

    let bal = Math.max(0, principal);
    const rows: ScheduleRow[] = [];
    let totalInterest = 0;
    let totalExpectedLoss = 0;
    let totalNetCash = 0;

    for (let m = 1; m <= n; m++) {
      const opening = bal;
      const interest = opening * r;
      const principalPay = Math.min(opening, Math.max(0, payment - interest));
      const closing = Math.max(0, opening - principalPay);
      const expectedLoss = opening * defaultRate * (1 - recovery);
      const operatingCost = opening * opex;
      const netCash = payment - expectedLoss - operatingCost;

      rows.push({
        month: m,
        opening,
        payment,
        interest,
        principal: principalPay,
        expectedLoss,
        netCash,
        closing,
      });

      bal = closing;
      totalInterest += interest;
      totalExpectedLoss += expectedLoss;
      totalNetCash += netCash;
    }

    const upfrontFee = principal * (Math.max(0, processingFeePct) / 100);
    const totalCashIn = upfrontFee + rows.reduce((s, r0) => s + r0.payment, 0);
    const totalCashOut = principal + rows.reduce((s, r0) => s + r0.expectedLoss, 0) + rows.reduce((s, r0) => s + r0.opening * (opexPctOfPortfolio / 100), 0);
    const netProfit = totalCashIn - totalCashOut;
    const roi = principal > 0 ? netProfit / principal : 0;

    return {
      rows,
      payment,
      upfrontFee,
      totalInterest,
      totalExpectedLoss,
      totalNetCash,
      netProfit,
      roi,
    };
  }, [principal, annualRatePct, termMonths, processingFeePct, monthlyDefaultPct, recoveryPct, opexPctOfPortfolio]);

  const chartData = useMemo(
    () =>
      result.rows.map((r) => ({
        month: `M${r.month}`,
        opening: r.opening,
        expectedLoss: r.expectedLoss,
        netCash: r.netCash,
      })),
    [result.rows]
  );

  const exportCsv = () => {
    const csv = toCsv(result.rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "general-lending-schedule.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm md:p-6">
        <PageHeader
          title="General lending (non-deposit taking)"
          subtitle="Model a standard lending book for asset purchases: pricing, losses, operating cost, cash generation, and portfolio runoff."
        />
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm md:p-6">
        <h3 className="mb-3 text-sm font-semibold text-neutral-900">Portfolio assumptions</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Principal deployed (RWF)", principal, setPrincipal, "number"],
            ["Interest rate (annual %)", annualRatePct, setAnnualRatePct, "number"],
            ["Tenor (months)", termMonths, setTermMonths, "number"],
            ["Processing fee (%)", processingFeePct, setProcessingFeePct, "number"],
            ["Default rate (% per month)", monthlyDefaultPct, setMonthlyDefaultPct, "number"],
            ["Recovery on default (%)", recoveryPct, setRecoveryPct, "number"],
            ["Operating cost (% of portfolio / month)", opexPctOfPortfolio, setOpexPctOfPortfolio, "number"],
          ].map(([label, value, setter, typ]) => (
            <label key={label as string} className="block text-xs font-medium text-neutral-600">
              {label as string}
              <input
                type={typ as string}
                step="any"
                className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                value={value as number}
                onChange={(e) => (setter as (v: number) => void)(Number(e.target.value))}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <p className="text-xs text-neutral-500">Monthly payment</p>
          <p className="text-lg font-semibold text-neutral-900">{fmtRwf(result.payment)}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <p className="text-xs text-neutral-500">Total interest income</p>
          <p className="text-lg font-semibold text-neutral-900">{fmtRwf(result.totalInterest)}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <p className="text-xs text-neutral-500">Expected credit loss</p>
          <p className="text-lg font-semibold text-amber-700">{fmtRwf(result.totalExpectedLoss)}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <p className="text-xs text-neutral-500">Estimated net profit</p>
          <p className={`text-lg font-semibold ${result.netProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>
            {fmtRwf(result.netProfit)}
          </p>
          <p className="text-[11px] text-neutral-500">ROI: {(result.roi * 100).toFixed(1)}%</p>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-neutral-900">Portfolio runoff and cash profile</h3>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Export schedule CSV
          </button>
        </div>
        <p className="mb-3 text-xs text-neutral-500">
          Opening balance shows portfolio at risk each month. Net cash reflects installment inflow minus expected losses and operating cost assumptions.
        </p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(Number(v) / 1e6).toFixed(0)}M`} />
              <Tooltip formatter={(v) => fmtRwf(Number(v))} />
              <Legend />
              <Area type="monotone" dataKey="opening" name="Opening portfolio" stroke="#0f172a" fill="#cbd5e1" />
              <Area type="monotone" dataKey="expectedLoss" name="Expected loss" stroke="#d97706" fill="#fde68a" />
              <Area type="monotone" dataKey="netCash" name="Net cash" stroke="#0d9488" fill="#99f6e4" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900">
        <p className="font-semibold">Interpretation notes</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
          <li>This page models a lending institution that does not take deposits and funds loans from equity or credit facilities.</li>
          <li>Default rate and recovery assumptions are the main drivers of expected credit loss and final profitability.</li>
          <li>Use this alongside the PAYGO and budget tabs to compare risk-adjusted return across lending products.</li>
        </ul>
      </div>
    </div>
  );
}
