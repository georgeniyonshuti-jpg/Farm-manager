import { useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  fmtNum,
  fmtRWF,
  type BroilerModelInputs,
  type BroilerModelResults,
  type CostBreakdownItem,
  type ScenarioItem,
  type SensitivityRow,
} from "../../lib/broilerModel";

type Props = {
  results: BroilerModelResults;
};

const FLAG_COLOR: Record<string, string> = {
  good: "#4ADE80",
  ok: "#FBBF24",
  risk: "#F87171",
  neutral: "#60A5FA",
};

function SectionHeading({
  number,
  title,
  subtitle,
}: {
  number: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div style={{ marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #E5E7EB" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#4ADE80",
            fontFamily: "monospace",
            letterSpacing: "0.1em",
          }}
        >
          {number}
        </span>
        <h3
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 800,
            color: "#111827",
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h3>
      </div>
      {subtitle ? (
        <p style={{ margin: "4px 0 0 28px", fontSize: 13, color: "#6B7280" }}>{subtitle}</p>
      ) : null}
    </div>
  );
}

function ExecutiveSummary({ results }: { results: BroilerModelResults }) {
  const {
    grossProfit,
    grossMarginPct,
    birdsSold,
    profitPerBird,
    breakEvenPricePerKg,
    inputs,
    healthFlags,
    costPerKgProduced,
    totalLiveKg,
    grossRevenue,
    totalCost,
    actualFCR,
    costBreakdown,
  } = results;

  const isProfit = grossProfit >= 0;
  const feedPct = costBreakdown.find((c) => c.name === "Feed")?.pct ?? 0;

  const narrative = `
    This batch of ${fmtNum(inputs.chicksPlaced)} broilers over a ${inputs.cycleDays}-day cycle
    ${isProfit ? "generates" : "incurs"} a net ${isProfit ? "profit" : "loss"} of
    ${fmtRWF(Math.abs(grossProfit))}, representing a ${Math.abs(grossMarginPct).toFixed(1)}%
    gross margin on revenue of ${fmtRWF(grossRevenue)}.
    At a finish weight of ${inputs.finishWeight} kg and FCR of ${actualFCR.toFixed(2)},
    the batch produces ${fmtNum(totalLiveKg, 0)} kg of live weight,
    with feed representing ${feedPct}% of total cost.
    The break-even price is ${fmtRWF(breakEvenPricePerKg)}/kg —
    ${
      inputs.pricePerKg > breakEvenPricePerKg
        ? `${fmtRWF(inputs.pricePerKg - breakEvenPricePerKg)}/kg below current market price, providing a ${((inputs.pricePerKg / breakEvenPricePerKg - 1) * 100).toFixed(1)}% price cushion.`
        : `the current market price of ${fmtRWF(inputs.pricePerKg)}/kg is BELOW break-even, meaning this batch loses money at current pricing.`
    }
  `
    .replace(/\s+/g, " ")
    .trim();

  const kpis = [
    {
      label: "Net profit",
      value: fmtRWF(grossProfit),
      sub: `${grossMarginPct.toFixed(1)}% margin`,
      flag: grossProfit >= 0 ? "good" : "risk",
    },
    {
      label: "Revenue",
      value: fmtRWF(grossRevenue),
      sub: `${fmtNum(totalLiveKg, 0)} kg sold`,
      flag: "neutral",
    },
    {
      label: "Total cost",
      value: fmtRWF(totalCost),
      sub: `${fmtRWF(costPerKgProduced)}/kg produced`,
      flag: "neutral",
    },
    {
      label: "Profit / bird",
      value: fmtRWF(profitPerBird),
      sub: `across ${fmtNum(birdsSold)} birds sold`,
      flag: profitPerBird >= 0 ? "good" : "risk",
    },
    {
      label: "Break-even price",
      value: `${fmtRWF(breakEvenPricePerKg)}/kg`,
      sub:
        inputs.pricePerKg > breakEvenPricePerKg
          ? `${fmtRWF(inputs.pricePerKg - breakEvenPricePerKg)} cushion`
          : `${fmtRWF(breakEvenPricePerKg - inputs.pricePerKg)} underwater`,
      flag: inputs.pricePerKg > breakEvenPricePerKg ? "good" : "risk",
    },
    {
      label: "FCR",
      value: actualFCR.toFixed(2),
      sub:
        healthFlags.fcr === "good"
          ? "Excellent"
          : healthFlags.fcr === "ok"
            ? "Acceptable"
            : "Above target",
      flag: healthFlags.fcr,
    },
  ];

  return (
    <section style={{ marginBottom: 40 }}>
      <SectionHeading number="01" title="Executive summary" subtitle="Batch-level profitability at a glance" />
      <div
        style={{
          background: isProfit ? "#F0FDF4" : "#FEF2F2",
          border: isProfit ? "1px solid #BBF7D0" : "1px solid #FECACA",
          borderLeft: `4px solid ${isProfit ? "#4ADE80" : "#F87171"}`,
          borderRadius: 10,
          padding: "16px 20px",
          marginBottom: 24,
          fontSize: 14,
          lineHeight: 1.7,
          color: isProfit ? "#166534" : "#991B1B",
        }}
      >
        {narrative}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
        }}
      >
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            style={{
              background: "#fff",
              border: "1px solid #E5E7EB",
              borderTop: `3px solid ${FLAG_COLOR[kpi.flag] ?? FLAG_COLOR.neutral}`,
              borderRadius: 10,
              padding: "16px 18px",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "#6B7280",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 6,
              }}
            >
              {kpi.label}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: "#111827",
                fontFamily: "monospace",
                marginBottom: 4,
              }}
            >
              {kpi.value}
            </div>
            <div style={{ fontSize: 12, color: FLAG_COLOR[kpi.flag] ?? "#6B7280", fontWeight: 500 }}>
              {kpi.sub}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PLTable({ results }: { results: BroilerModelResults }) {
  const rows = [
    { label: "Gross revenue", value: results.grossRevenue, bold: false, indent: 0, highlight: false },
    { label: "Chick cost", value: -results.chickCost, bold: false, indent: 1, highlight: false },
    { label: "Feed cost", value: -results.feedCost, bold: false, indent: 1, highlight: false },
    {
      label: "Med / vaccine",
      value: -results.inputs.medVaccine,
      bold: false,
      indent: 1,
      highlight: false,
    },
    {
      label: "Transport",
      value: -results.inputs.transport,
      bold: false,
      indent: 1,
      highlight: false,
    },
    { label: "Labor", value: -results.inputs.labor, bold: false, indent: 1, highlight: false },
    {
      label: "Utilities",
      value: -results.inputs.utilities,
      bold: false,
      indent: 1,
      highlight: false,
    },
    {
      label: "Overhead",
      value: -results.inputs.overheadFixed,
      bold: false,
      indent: 1,
      highlight: false,
    },
    { label: "Total cost", value: -results.totalCost, bold: true, indent: 0, highlight: false },
    {
      label: "NET PROFIT",
      value: results.grossProfit,
      bold: true,
      indent: 0,
      highlight: true,
    },
  ];

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
          <th style={{ textAlign: "left", padding: "8px 0", color: "#6B7280" }}>Line item</th>
          <th style={{ textAlign: "right", padding: "8px 0", color: "#6B7280" }}>Amount (RWF)</th>
          <th style={{ textAlign: "right", padding: "8px 0", color: "#6B7280" }}>% of revenue</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.label}
            style={{
              borderBottom: "1px solid #F3F4F6",
              background: row.highlight
                ? results.grossProfit >= 0
                  ? "#F0FDF4"
                  : "#FEF2F2"
                : "transparent",
            }}
          >
            <td
              style={{
                padding: `9px 0 9px ${row.indent * 16}px`,
                fontWeight: row.bold ? 700 : 400,
                color: row.highlight
                  ? results.grossProfit >= 0
                    ? "#166534"
                    : "#991B1B"
                  : "#374151",
              }}
            >
              {row.label}
            </td>
            <td
              style={{
                textAlign: "right",
                padding: "9px 0",
                fontWeight: row.bold ? 700 : 400,
                fontFamily: "monospace",
                color: row.value >= 0 ? "#166534" : "#991B1B",
              }}
            >
              {fmtRWF(row.value)}
            </td>
            <td style={{ textAlign: "right", padding: "9px 0", color: "#6B7280", fontSize: 12 }}>
              {results.grossRevenue > 0
                ? `${((Math.abs(row.value) / results.grossRevenue) * 100).toFixed(1)}%`
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CostDonut({ costBreakdown }: { costBreakdown: CostBreakdownItem[] }) {
  if (costBreakdown.length === 0) {
    return <p className="text-sm text-neutral-500">No cost data to display.</p>;
  }
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 12 }}>
        Cost structure
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={costBreakdown}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
          >
            {costBreakdown.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number, name: string) => [fmtRWF(value), name]} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 8 }}>
        {costBreakdown.map((item) => (
          <div
            key={item.name}
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}
          >
            <div style={{ width: 10, height: 10, borderRadius: 2, background: item.color }} />
            <span style={{ color: "#374151" }}>{item.name}</span>
            <span style={{ color: "#6B7280" }}>{item.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WaterfallChart({ results }: { results: BroilerModelResults }) {
  const data = results.waterfall.map((w) => ({
    name: w.name,
    value: w.value,
    fill: w.color,
  }));

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 12 }}>
        Profit waterfall
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(Number(v) / 1e6).toFixed(1)}M`} />
          <Tooltip formatter={(v: number) => fmtRWF(v)} />
          <Bar dataKey="value">
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function FinancialBreakdown({ results }: { results: BroilerModelResults }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <SectionHeading
        number="02"
        title="Financial breakdown"
        subtitle="P&L, waterfall, and cost composition"
      />
      <div
        style={{
          display: "grid",
          gap: 24,
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        }}
      >
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <PLTable results={results} />
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <CostDonut costBreakdown={results.costBreakdown} />
        </div>
      </div>
      <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-4">
        <WaterfallChart results={results} />
      </div>
    </section>
  );
}

function profitColor(profit: number): string {
  if (profit > 5_000_000) return "#166534";
  if (profit > 2_000_000) return "#4ADE80";
  if (profit > 0) return "#BBF7D0";
  if (profit > -2_000_000) return "#FEE2E2";
  return "#991B1B";
}

function SensitivityHeatmap({ sensitivityGrid }: { sensitivityGrid: SensitivityRow[] }) {
  if (!sensitivityGrid.length) return null;
  const priceDeltas = sensitivityGrid[0].points.map((p) => p.priceDelta);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
        <thead>
          <tr>
            <th style={{ padding: "8px 12px", textAlign: "right", color: "#6B7280" }}>
              FCR ↓ / Price →
            </th>
            {priceDeltas.map((d) => (
              <th key={d} style={{ padding: "8px 10px", color: "#6B7280", fontWeight: 600 }}>
                {d > 0 ? "+" : ""}
                {d}%
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sensitivityGrid.map((row) => (
            <tr key={row.fcrDelta}>
              <td
                style={{
                  padding: "6px 12px",
                  textAlign: "right",
                  fontWeight: 600,
                  color: "#374151",
                }}
              >
                {row.fcrDelta > 0 ? "+" : ""}
                {row.fcrDelta}%
              </td>
              {row.points.map((cell) => (
                <td
                  key={cell.priceDelta}
                  style={{
                    padding: "6px 10px",
                    textAlign: "center",
                    background: profitColor(cell.profit),
                    color: Math.abs(cell.profit) > 3_000_000 ? "#fff" : "#111",
                    fontFamily: "monospace",
                    fontSize: 11,
                    borderRadius: 4,
                  }}
                >
                  {fmtRWF(cell.profit)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScenarioCards({ scenarios }: { scenarios: ScenarioItem[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 14,
        marginTop: 24,
      }}
    >
      {scenarios.map((s) => (
        <div
          key={s.name}
          style={{
            border: `2px solid ${s.color}`,
            borderRadius: 12,
            padding: "16px 18px",
            background: `${s.color}10`,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: s.color, marginBottom: 4 }}>
            {s.name}
          </div>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 12 }}>{s.description}</div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              fontFamily: "monospace",
              color: s.profit >= 0 ? "#166534" : "#991B1B",
            }}
          >
            {fmtRWF(s.profit)}
          </div>
          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{s.margin.toFixed(1)}% margin</div>
        </div>
      ))}
    </div>
  );
}

function SensitivitySection({ results }: { results: BroilerModelResults }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <SectionHeading
        number="03"
        title="Sensitivity & risk analysis"
        subtitle="How profit changes as key drivers move"
      />
      <div style={{ marginBottom: 16, fontSize: 13, color: "#6B7280" }}>
        Each cell shows net profit (RWF) as price/kg and FCR shift simultaneously. Green = profitable.
        Red = loss-making.
      </div>
      <div
        className="mb-4 rounded-lg border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-950"
      >
        <strong>Break-even:</strong> {fmtRWF(results.breakEvenPricePerKg)}/kg ·{" "}
        {fmtNum(results.breakEvenBirds, 0)} birds · {fmtNum(results.breakEvenKg, 0)} kg live weight · Margin to
        break-even: {fmtRWF(results.marginToBreakEven)}/kg
      </div>
      <SensitivityHeatmap sensitivityGrid={results.sensitivityGrid} />
      <ScenarioCards scenarios={results.scenarios} />
    </section>
  );
}

async function exportBatchPdf(element: HTMLElement, inputs: BroilerModelInputs) {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW - 20;
  const imgH = (canvas.height * imgW) / canvas.width;
  let yPosition = 10;

  pdf.setFillColor(22, 101, 52);
  pdf.rect(0, 0, pageW, 22, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "bold");
  pdf.text("Clevafarm — Broiler Batch Economics Report", 10, 14);
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.text(
    `Generated ${new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })}  ·  ${inputs.chicksPlaced.toLocaleString()} birds  ·  ${inputs.cycleDays}-day cycle`,
    10,
    20
  );

  yPosition = 28;
  const pagesNeeded = Math.ceil(imgH / (pageH - yPosition - 10));
  for (let page = 0; page < pagesNeeded; page++) {
    if (page > 0) {
      pdf.addPage();
      yPosition = 10;
    }
    pdf.addImage(imgData, "PNG", 10, yPosition - page * (pageH - 30), imgW, imgH);
  }

  pdf.setFontSize(8);
  pdf.setTextColor(150, 150, 150);
  pdf.text("Confidential — Clevafarm internal use", 10, pageH - 6);

  pdf.save(`clevafarm-batch-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export default function BatchResults({ results }: Props) {
  const resultsRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  return (
    <div>
      <div ref={resultsRef} className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 md:p-6">
        <ExecutiveSummary results={results} />
        <FinancialBreakdown results={results} />
        <SensitivitySection results={results} />
      </div>

      <section style={{ marginTop: 24 }}>
        <SectionHeading number="04" title="Export" subtitle="Download a shareable PDF report" />
        <button
          type="button"
          disabled={exporting}
          onClick={() => {
            if (!resultsRef.current) return;
            setExporting(true);
            void exportBatchPdf(resultsRef.current, results.inputs).finally(() => setExporting(false));
          }}
          className="rounded-lg bg-violet-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-900 disabled:opacity-50"
        >
          {exporting ? "Generating PDF…" : "Download PDF report"}
        </button>
      </section>
    </div>
  );
}
