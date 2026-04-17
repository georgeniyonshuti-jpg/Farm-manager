/**
 * Broiler batch performance PDF — report-grade format.
 * Sections: cover, executive summary, batch economics, cost breakdown,
 * weekly mortality, daily trajectory chart, vet & compliance status,
 * insights & recommendations, benchmark comparison, methodology.
 */

import PDFDocument from "pdfkit";

const COLORS = {
  navy: "#0f172a",
  slate: "#334155",
  mid: "#64748b",
  light: "#94a3b8",
  border: "#e2e8f0",
  emerald: "#0d9488",
  blue: "#0369a1",
  violet: "#7c3aed",
  amber: "#d97706",
  red: "#dc2626",
  green: "#16a34a",
  accent: "#38bdf8",
  bg: "#f8fafc",
};

function money(x) {
  if (x == null || !Number.isFinite(Number(x))) return "—";
  const v = Number(x);
  if (Math.abs(v) >= 1e6) return `RWF ${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `RWF ${(v / 1e3).toFixed(0)}K`;
  return `RWF ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function drawPageFooter(doc, pageNum, farmName, reportDate) {
  const w = doc.page.width;
  const y = doc.page.height - 36;
  doc.save();
  doc.rect(0, y - 4, w, 40).fill(COLORS.bg);
  doc.rect(0, y - 4, w, 1).fill(COLORS.border);
  doc.fillColor(COLORS.mid).fontSize(7)
    .text(`${farmName} — Broiler Batch Report`, 48, y + 4, { width: w * 0.45 })
    .text(`${reportDate} | Page ${pageNum}`, w / 2, y + 4, { width: w * 0.4, align: "right" });
  doc.restore();
}

function addPage(doc, pc, farmName, reportDate) {
  doc.addPage();
  pc.n += 1;
  drawPageFooter(doc, pc.n, farmName, reportDate);
}

function sectionHeader(doc, text, color = COLORS.navy) {
  doc.moveDown(0.5);
  doc.rect(48, doc.y, doc.page.width - 96, 24).fill(color);
  doc.fillColor("#ffffff").fontSize(11).font("Helvetica-Bold").text(text, 56, doc.y - 20, { width: doc.page.width - 112 });
  doc.font("Helvetica").moveDown(0.8);
}

function subHeader(doc, text) {
  doc.moveDown(0.4);
  doc.fillColor(COLORS.navy).fontSize(10).font("Helvetica-Bold").text(text);
  doc.font("Helvetica").moveDown(0.2);
}

function bodyText(doc, text, indent = 0) {
  doc.fillColor(COLORS.slate).fontSize(9).text(text, { indent, width: doc.page.width - 96 - indent });
  doc.moveDown(0.15);
}

function bulletList(doc, items) {
  for (const item of items) {
    bodyText(doc, `• ${item}`, 8);
  }
}

function kpiGrid(doc, kpis, cols = 3) {
  const pageW = doc.page.width - 96;
  const cellW = pageW / cols;
  const cellH = 44;
  const startX = 48;
  let cx = 0;
  let startY = doc.y;

  for (const [label, value, sub, flagColor] of kpis) {
    const x = startX + cx * cellW;
    doc.rect(x, startY, cellW, cellH).fill(COLORS.bg).stroke(COLORS.border);
    if (flagColor) doc.rect(x, startY, 4, cellH).fill(flagColor);
    doc.fillColor(COLORS.mid).fontSize(7).font("Helvetica-Bold")
      .text(label.toUpperCase(), x + 8, startY + 5, { width: cellW - 16 });
    doc.fillColor(COLORS.navy).fontSize(12).font("Helvetica-Bold")
      .text(String(value), x + 8, startY + 15, { width: cellW - 16 });
    if (sub) {
      doc.fillColor(COLORS.mid).fontSize(7).font("Helvetica")
        .text(sub, x + 8, startY + 30, { width: cellW - 16 });
    }
    doc.font("Helvetica");
    cx += 1;
    if (cx >= cols) {
      cx = 0;
      startY += cellH + 4;
    }
  }
  doc.y = startY + (cx > 0 ? cellH + 4 : 0) + 8;
  doc.font("Helvetica");
}

function drawDualLine(doc, x, y, w, h, data, keyA, keyB, labelA, labelB, colorA, colorB) {
  if (!data?.length) return;
  const vA = data.map((r) => Number(r[keyA]) || 0);
  const vB = data.map((r) => Number(r[keyB]) || 0);
  const allV = [...vA, ...vB];
  const minV = Math.min(...allV);
  const maxV = Math.max(...allV);
  const span = maxV - minV || 1;

  doc.save();
  doc.rect(x, y, w, h).fill(COLORS.bg).stroke(COLORS.border);

  // Grid lines
  doc.strokeColor(COLORS.border).lineWidth(0.3);
  for (let g = 0; g <= 4; g++) {
    const gy = y + (g / 4) * h;
    doc.moveTo(x + 1, gy).lineTo(x + w - 1, gy).stroke();
  }

  const pX = (i) => x + 4 + (i / Math.max(1, data.length - 1)) * (w - 8);
  const pY = (v) => y + h - 4 - ((v - minV) / span) * (h - 12);

  for (const [vals, col] of [[vA, colorA ?? COLORS.blue], [vB, colorB ?? COLORS.emerald]]) {
    doc.strokeColor(col).lineWidth(1.5);
    let first = true;
    for (let i = 0; i < vals.length; i++) {
      if (first) { doc.moveTo(pX(i), pY(vals[i])); first = false; }
      else doc.lineTo(pX(i), pY(vals[i]));
    }
    doc.stroke();
  }

  // Legend
  if (labelA) {
    doc.circle(x + 4, y - 10, 3).fill(colorA ?? COLORS.blue);
    doc.fillColor(COLORS.slate).fontSize(7).text(labelA, x + 10, y - 14, { width: 100 });
  }
  if (labelB) {
    doc.circle(x + 110, y - 10, 3).fill(colorB ?? COLORS.emerald);
    doc.fillColor(COLORS.slate).fontSize(7).text(labelB, x + 116, y - 14, { width: 100 });
  }

  // X-axis labels
  const step = Math.max(1, Math.floor(data.length / 6));
  doc.fillColor(COLORS.mid).fontSize(6);
  for (let i = 0; i < data.length; i += step) {
    doc.text(`D${data[i].day ?? i}`, pX(i) - 6, y + h + 2, { width: 20, align: "center" });
  }

  doc.restore();
}

function weeklyMortalityChart(doc, weeklyMortality, x, y, w, h) {
  if (!weeklyMortality?.length) return;
  const vals = weeklyMortality.map((r) => Number(r.mortality_pct_of_week_start) || 0);
  const maxV = Math.max(...vals, 0.5);
  const barW = Math.min(30, (w - 20) / vals.length - 4);

  doc.save();
  doc.rect(x, y, w, h).fill(COLORS.bg).stroke(COLORS.border);

  // Reference line at 1%
  const refY = y + h - 4 - (0.01 / (maxV / 100)) * (h - 12);
  doc.strokeColor(COLORS.amber).lineWidth(0.8).dash(4, { space: 3 });
  doc.moveTo(x + 4, refY).lineTo(x + w - 4, refY).stroke().undash();
  doc.fillColor(COLORS.amber).fontSize(6).text("1% ref", x + w - 28, refY - 8, { width: 28 });

  for (let i = 0; i < vals.length; i++) {
    const bx = x + 10 + i * (barW + 4);
    const bh = ((vals[i] / 100) / maxV) * 100 * (h - 20);
    const color = vals[i] > 2 ? COLORS.red : vals[i] > 1 ? COLORS.amber : COLORS.emerald;
    const by = y + h - 4 - bh;
    doc.rect(bx, by, barW, bh).fill(color);
    doc.fillColor(COLORS.slate).fontSize(6).text(`W${weeklyMortality[i].week}`, bx, y + h + 2, { width: barW, align: "center" });
    doc.fillColor(COLORS.navy).fontSize(6).text(`${vals[i].toFixed(2)}%`, bx, by - 8, { width: barW, align: "center" });
  }

  doc.restore();
}

/**
 * @param {object} opts
 * @param {Record<string, number>} opts.summary
 * @param {Record<string, number>[]} opts.trajectory
 * @param {string[]} opts.insights
 * @param {Record<string, number>} opts.inputs
 * @param {{ week: number; mortality_pct_of_week_start: number }[]} opts.weeklyMortality
 * @param {string} [opts.farmName]
 * @param {number | null} [opts.complianceScore]
 * @param {string} [opts.healthStatus]
 */
export function buildBroilerPdfBuffer(opts) {
  const {
    summary = {},
    trajectory = [],
    insights = [],
    inputs = {},
    weeklyMortality = [],
    farmName = "Broiler operation",
    complianceScore = null,
    healthStatus = "Good",
  } = opts;

  const reportDate = new Date().toLocaleDateString("en-GB", { dateStyle: "long" });
  const roi = summary.roi_cycle;
  const roiStr = roi != null && Number.isFinite(roi) ? `${(roi * 100).toFixed(1)}%` : "—";
  const margin = summary.net_profit_rwf != null && summary.revenue_rwf != null && summary.revenue_rwf > 0
    ? `${((summary.net_profit_rwf / summary.revenue_rwf) * 100).toFixed(1)}%`
    : "—";
  const bepPriceStr = summary.break_even_price_per_kg != null ? money(summary.break_even_price_per_kg) : "—";

  return new Promise((resolve, reject) => {
    const pc = { n: 1 };
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      info: { Title: `${farmName} — Broiler Batch Report`, Author: "ClevaCredit Farm Manager" },
    });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── COVER ────────────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 180).fill(COLORS.navy);
    doc.fillColor(COLORS.accent).fontSize(22).font("Helvetica-Bold")
      .text("ClevaCredit Farm Manager", 48, 36, { width: doc.page.width - 96, align: "center" });
    doc.fillColor("#ffffff").fontSize(15)
      .text("Broiler Batch Performance Report", 48, 74, { width: doc.page.width - 96, align: "center" });
    doc.fillColor("#cbd5e1").fontSize(11).font("Helvetica")
      .text(farmName, 48, 104, { width: doc.page.width - 96, align: "center" });
    doc.fillColor(COLORS.light).fontSize(9)
      .text(`Prepared: ${reportDate}`, 48, 128, { width: doc.page.width - 96, align: "center" });
    doc.fillColor("#64748b").fontSize(8)
      .text(`Cycle: ${inputs.cycle_days ?? 35} days | Chicks placed: ${(inputs.chicks ?? 0).toLocaleString()} | FCR: ${inputs.fcr ?? "—"}`, 48, 148, {
        width: doc.page.width - 96, align: "center",
      });

    doc.y = 204;
    drawPageFooter(doc, pc.n, farmName, reportDate);

    // Quick summary strip on cover
    sectionHeader(doc, "BATCH SNAPSHOT", COLORS.emerald);
    kpiGrid(doc, [
      ["Net Profit", money(summary.net_profit_rwf), "This batch", summary.net_profit_rwf >= 0 ? COLORS.green : COLORS.red],
      ["Revenue", money(summary.revenue_rwf), "Gross sales revenue", null],
      ["Total Cost", money(summary.total_cost_rwf), "All-in cost of production", null],
      ["Gross Margin", margin, "Net profit / Revenue", null],
      ["ROI (cycle)", roiStr, "Net profit / Total cost", null],
      ["Break-even Price", bepPriceStr, "Min price/kg to break even", null],
    ], 3);

    // ── PAGE 2: BATCH ECONOMICS ──────────────────────────────────────────────
    addPage(doc, pc, farmName, reportDate);
    sectionHeader(doc, "1. BATCH ECONOMICS", COLORS.emerald);

    bodyText(doc,
      `This batch used ${(inputs.chicks ?? 0).toLocaleString()} chicks over a ${inputs.cycle_days ?? 35}-day cycle ` +
      `with a modeled mortality rate of ${inputs.mortality_pct ?? "—"}% and a feed conversion ratio (FCR) of ${inputs.fcr ?? "—"}. ` +
      `Birds are sold at RWF ${inputs.price_per_kg ?? "—"}/kg with an average finish weight of ${inputs.finish_weight_kg ?? "—"} kg.`
    );
    doc.moveDown(0.4);

    kpiGrid(doc, [
      ["Chicks Placed", (inputs.chicks ?? 0).toLocaleString(), "Start of batch"],
      ["Birds Harvested", summary.birds_end != null ? Math.round(summary.birds_end).toLocaleString() : "—", "After mortality"],
      ["Mortality Rate", `${inputs.mortality_pct ?? "—"}%`, `${summary.birds_end != null ? Math.round((inputs.chicks ?? 0) - summary.birds_end).toLocaleString() : "—"} birds lost`],
      ["Effective FCR", summary.effective_fcr != null ? summary.effective_fcr.toFixed(3) : "—", "Feed per kg of live weight gain"],
      ["Finish Weight", `${inputs.finish_weight_kg ?? "—"} kg`, "Average live weight at harvest"],
      ["Cycle Days", `${inputs.cycle_days ?? "—"} days`, "Duration from placement to slaughter"],
    ], 3);

    doc.moveDown(0.4);
    subHeader(doc, "Revenue & Profitability");

    kpiGrid(doc, [
      ["Revenue", money(summary.revenue_rwf), `@ RWF ${inputs.price_per_kg ?? "—"}/kg`, null],
      ["Gross Profit", money(summary.gross_profit_rwf), "Revenue − variable costs", summary.gross_profit_rwf >= 0 ? COLORS.green : COLORS.red],
      ["Net Profit", money(summary.net_profit_rwf), "After all costs", summary.net_profit_rwf >= 0 ? COLORS.green : COLORS.red],
      ["Break-even Price/kg", bepPriceStr, "Min price to cover all costs"],
      ["Gross Margin", margin, null],
      ["ROI (cycle)", roiStr, "Return on total cost invested"],
    ], 3);

    // ── PAGE 3: COST BREAKDOWN ───────────────────────────────────────────────
    addPage(doc, pc, farmName, reportDate);
    sectionHeader(doc, "2. COST BREAKDOWN", COLORS.blue);

    bodyText(doc, "Itemized cost structure for this batch. Feed cost typically represents 65-75% of total cost of production.");
    doc.moveDown(0.4);

    const feedKg = inputs.feed_kg_total > 0
      ? inputs.feed_kg_total
      : (summary.birds_end ?? inputs.chicks) * Math.max(inputs.finish_weight_kg - 0.042, 0.01) * (inputs.fcr ?? 1.65);
    const feedCost = feedKg * (inputs.feed_price_per_kg ?? 920);
    const chickCost = (inputs.chicks ?? 0) * (inputs.cost_per_chick ?? 850);
    const totalCost = Number(summary.total_cost_rwf) || 1;

    const costItems = [
      ["Chick cost", chickCost, "Cost per chick × total chicks"],
      ["Feed cost", feedCost, `${feedKg.toFixed(0)} kg × RWF ${inputs.feed_price_per_kg ?? 920}/kg`],
      ["Med & vaccines", inputs.med_vaccine_total ?? 0, "Preventive & curative medicines"],
      ["Labor", inputs.labor_total ?? 0, "Staff wages for the cycle"],
      ["Utilities", inputs.utilities_total ?? 0, "Electricity, water, fuel"],
      ["Transport", inputs.transport_total ?? 0, "Input delivery & bird transport"],
      ["Overhead fixed", inputs.overhead_fixed ?? 0, "Fixed facility costs"],
    ];

    const maxCost = Math.max(...costItems.map(([, v]) => v));
    const colW = doc.page.width - 96;
    let ty = doc.y;

    doc.rect(48, ty, colW, 16).fill(COLORS.navy);
    doc.fillColor("#fff").fontSize(7.5).font("Helvetica-Bold")
      .text("Cost Component", 50, ty + 4, { width: 180 });
    doc.text("Amount (RWF)", 234, ty + 4, { width: 100, align: "right" });
    doc.text("% of Total", 340, ty + 4, { width: 80, align: "right" });
    doc.text("Breakdown", 432, ty + 4, { width: 100 });
    ty += 16;
    doc.font("Helvetica");

    for (let i = 0; i < costItems.length; i++) {
      const [label, amt, desc] = costItems[i];
      const pctOfTotal = totalCost > 0 ? amt / totalCost : 0;
      const barLen = maxCost > 0 ? (amt / maxCost) * 100 : 0;
      const bg = i % 2 === 0 ? "#fff" : COLORS.bg;
      doc.rect(48, ty, colW, 16).fill(bg).stroke(COLORS.border);
      doc.fillColor(COLORS.slate).fontSize(7).text(label, 50, ty + 4, { width: 180 });
      doc.fillColor(COLORS.navy).text(money(amt), 234, ty + 4, { width: 100, align: "right" });
      doc.fillColor(COLORS.mid).text(`${(pctOfTotal * 100).toFixed(1)}%`, 340, ty + 4, { width: 80, align: "right" });
      if (barLen > 0) {
        doc.rect(432, ty + 4, barLen, 8).fill(COLORS.blue);
      }
      ty += 16;
    }

    doc.rect(48, ty, colW, 18).fill(COLORS.navy);
    doc.fillColor("#fff").fontSize(8).font("Helvetica-Bold").text("TOTAL", 50, ty + 4, { width: 180 });
    doc.text(money(totalCost), 234, ty + 4, { width: 100, align: "right" });
    doc.text("100%", 340, ty + 4, { width: 80, align: "right" });
    ty += 24;
    doc.y = ty;
    doc.font("Helvetica");

    doc.moveDown(0.6);
    subHeader(doc, "Cost Benchmarks");
    bulletList(doc, [
      `Feed as % of total: ${totalCost > 0 ? ((feedCost / totalCost) * 100).toFixed(1) : "—"}% (industry norm: 65-75%)`,
      `Cost per bird: ${summary.birds_end ? money(totalCost / Math.max(1, summary.birds_end)) : "—"} (excl. feed: ${summary.birds_end ? money((totalCost - feedCost) / Math.max(1, summary.birds_end)) : "—"})`,
      `Cost per kg produced: ${summary.birds_end && inputs.finish_weight_kg ? money(totalCost / Math.max(1, summary.birds_end * inputs.finish_weight_kg)) : "—"}`,
      `Effective FCR: ${summary.effective_fcr?.toFixed(3) ?? "—"} (industry target: 1.60–1.75 for 35-day cycle)`,
    ]);

    // ── PAGE 4: MORTALITY & TRAJECTORY ──────────────────────────────────────
    addPage(doc, pc, farmName, reportDate);
    sectionHeader(doc, "3. MORTALITY PROFILE & DAILY TRAJECTORY", COLORS.amber);

    if (weeklyMortality?.length) {
      bodyText(doc,
        "Weekly mortality as a percentage of flock at start of each week. " +
        "The amber reference line at 1% marks a healthy weekly loss threshold. " +
        "Weeks above 2% (red) warrant immediate investigation."
      );
      doc.moveDown(0.6);
      weeklyMortalityChart(doc, weeklyMortality, 48, doc.y + 16, doc.page.width - 96, 100);
      doc.y += 126;
      doc.moveDown(0.4);
    }

    if (trajectory?.length) {
      bodyText(doc,
        "Daily flock trajectory showing birds alive (left axis) and cumulative cost vs revenue (right axis). " +
        "Revenue crossover above cost line signals batch-level breakeven."
      );
      doc.moveDown(0.6);
      drawDualLine(
        doc,
        48, doc.y + 20,
        doc.page.width - 96, 100,
        trajectory,
        "cost_cum_rwf", "revenue_cum_rwf",
        "Cumulative cost (RWF)", "Cumulative revenue (RWF)",
        COLORS.red, COLORS.emerald
      );
      doc.y += 140;
    }

    // ── PAGE 5: VET, COMPLIANCE & INSIGHTS ──────────────────────────────────
    addPage(doc, pc, farmName, reportDate);
    sectionHeader(doc, "4. VET STATUS, COMPLIANCE & INSIGHTS", COLORS.violet);

    subHeader(doc, "Operational Status");
    kpiGrid(doc, [
      [
        "Compliance Score",
        complianceScore != null ? `${Math.round(complianceScore)}/100` : "—",
        "7-day check-in compliance",
        complianceScore != null ? (complianceScore >= 80 ? COLORS.green : complianceScore >= 60 ? COLORS.amber : COLORS.red) : null,
      ],
      [
        "Vet Health Status",
        String(healthStatus),
        "Latest vet assessment",
        healthStatus === "Good" ? COLORS.green : healthStatus === "Moderate" ? COLORS.amber : COLORS.red,
      ],
      ["Cycle Days", `${inputs.cycle_days ?? "—"} days`, "Full cycle duration", null],
    ], 3);

    doc.moveDown(0.4);
    subHeader(doc, "Key Insights & Recommendations");

    if (insights?.length) {
      for (let i = 0; i < insights.length; i++) {
        const ins = insights[i];
        const isWarning = ins.toLowerCase().includes("high") || ins.toLowerCase().includes("below") || ins.toLowerCase().includes("risk");
        const bullet = isWarning ? "⚠" : "✓";
        doc.fillColor(isWarning ? COLORS.amber : COLORS.green).fontSize(9).font("Helvetica-Bold").text(bullet, 48, doc.y, { continued: false });
        doc.y -= 12;
        doc.fillColor(COLORS.slate).font("Helvetica").text(ins, 64, doc.y, { width: doc.page.width - 112 });
        doc.moveDown(0.3);
      }
    } else {
      bodyText(doc, "Run the broiler model to generate insights.");
    }

    // ── PAGE 6: METHODOLOGY ──────────────────────────────────────────────────
    addPage(doc, pc, farmName, reportDate);
    sectionHeader(doc, "5. ASSUMPTIONS & METHODOLOGY", COLORS.navy);

    subHeader(doc, "Model Inputs");
    bulletList(doc, [
      `Chicks placed: ${(inputs.chicks ?? 0).toLocaleString()} birds at RWF ${inputs.cost_per_chick ?? 850}/chick`,
      `Cycle length: ${inputs.cycle_days ?? 35} days`,
      `Mortality assumption: ${inputs.mortality_pct ?? 4}% of placed birds (curve exponent: ${inputs.mortality_curve_exponent ?? 1.0})`,
      `Start weight: ${inputs.chick_weight_kg ?? 0.042} kg | Finish weight: ${inputs.finish_weight_kg ?? 2.15} kg`,
      `FCR (Feed Conversion Ratio): ${inputs.fcr ?? 1.65} — kg feed per kg live weight gained`,
      `Feed price: RWF ${inputs.feed_price_per_kg ?? 920}/kg`,
      `Selling price: RWF ${inputs.price_per_kg ?? 1350}/kg live weight`,
    ]);

    doc.moveDown(0.4);
    subHeader(doc, "Key Formula Reference");
    const formulas = [
      ["Birds harvested", "chicks × (1 − mortality_pct/100)"],
      ["Mass gain (kg)", "birds_harvested × (finish_weight − chick_weight)"],
      ["Feed required (kg)", "mass_gain × FCR  (if feed_kg_total = 0)"],
      ["Revenue", "birds_harvested × finish_weight × price_per_kg"],
      ["Feed cost", "feed_kg × feed_price_per_kg"],
      ["Total cost", "chick_cost + feed_cost + med_vaccine + labor + utilities + transport + overhead"],
      ["Gross profit", "Revenue − (chick_cost + feed_cost + med_vaccine)"],
      ["Net profit", "Revenue − total_cost"],
      ["Effective FCR", "feed_kg / mass_gain"],
      ["Break-even price/kg", "total_cost / (birds_harvested × finish_weight)"],
      ["ROI (cycle)", "net_profit / total_cost"],
      ["Mortality curve", "Gompertz-style: mortality concentrated in weeks 1-2 per exponent parameter"],
    ];

    for (const [label, formula] of formulas) {
      doc.fillColor(COLORS.navy).fontSize(8).font("Helvetica-Bold").text(label, 48, doc.y, { width: 160 });
      doc.y -= 12;
      doc.fillColor(COLORS.slate).fontSize(7.5).font("Helvetica").text(formula, 220, doc.y, { width: doc.page.width - 268 });
      doc.rect(48, doc.y - 2, doc.page.width - 96, 0.5).fill(COLORS.border);
      doc.moveDown(0.5);
    }

    doc.moveDown(1);
    doc.fillColor(COLORS.mid).fontSize(8).font("Helvetica-Oblique").text(
      "Disclaimer: This report is based on model projections from user-provided inputs. Actual performance " +
      "may differ due to disease events, market price fluctuations, feed availability, and other operational factors. " +
      "Use this document as a planning and monitoring tool, not as a guaranteed performance forecast.",
      { width: doc.page.width - 96, align: "justify" }
    );

    doc.end();
  });
}
