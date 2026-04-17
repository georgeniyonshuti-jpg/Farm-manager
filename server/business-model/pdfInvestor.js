/**
 * Investor / lender memorandum PDF — report-grade format.
 * Sections: cover, executive summary, capital stack, KPI dashboard,
 * monthly projection table, chart snapshots, scenario analysis,
 * KPI interpretation + risks, assumptions & methodology, appendix.
 */

import PDFDocument from "pdfkit";
import { capitalStackForReport, capitalSplitFromCtl } from "./paygoMemorandum.js";

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

function money(x, compact = true) {
  if (x == null || !Number.isFinite(Number(x))) return "—";
  const v = Number(x);
  if (compact && Math.abs(v) >= 1e9) return `RWF ${(v / 1e9).toFixed(2)}B`;
  if (compact && Math.abs(v) >= 1e6) return `RWF ${(v / 1e6).toFixed(2)}M`;
  if (compact && Math.abs(v) >= 1e3) return `RWF ${(v / 1e3).toFixed(0)}K`;
  return `RWF ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function pct(x, decimals = 2) {
  if (x == null || !Number.isFinite(Number(x))) return "—";
  return `${(Number(x) * 100).toFixed(decimals)}%`;
}

function fmt(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function drawPageFooter(doc, pageNum, companyName, reportDate) {
  const w = doc.page.width;
  const y = doc.page.height - 36;
  doc.save();
  doc.rect(0, y - 4, w, 40).fill(COLORS.bg);
  doc.rect(0, y - 4, w, 1).fill(COLORS.border);
  doc
    .fillColor(COLORS.mid)
    .fontSize(7)
    .text(`${companyName} — Confidential`, 48, y + 4, { width: w * 0.4 })
    .text(`${reportDate} | Page ${pageNum}`, w / 2, y + 4, { width: w * 0.4, align: "right" });
  doc.restore();
}

function addPage(doc, pageCounter, companyName, reportDate) {
  doc.addPage();
  pageCounter.n += 1;
  drawPageFooter(doc, pageCounter.n, companyName, reportDate);
}

function ensureSpace(doc, pageCounter, companyName, reportDate, needed = 120) {
  const bottomLimit = doc.page.height - 64;
  if (doc.y + needed > bottomLimit) {
    addPage(doc, pageCounter, companyName, reportDate);
  }
}

function sectionHeader(doc, text, color = COLORS.navy) {
  doc.moveDown(0.5);
  doc.rect(48, doc.y, doc.page.width - 96, 24).fill(color);
  doc
    .fillColor("#ffffff")
    .fontSize(11)
    .font("Helvetica-Bold")
    .text(text, 56, doc.y - 20, { width: doc.page.width - 112 });
  doc.font("Helvetica");
  doc.moveDown(0.8);
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

  for (const [label, value, sub] of kpis) {
    const x = startX + cx * cellW;
    doc.rect(x, startY, cellW, cellH).stroke(COLORS.border);
    doc.fillColor(COLORS.bg).rect(x, startY, cellW, cellH).fill();
    doc.rect(x, startY, cellW, cellH).stroke(COLORS.border);
    doc
      .fillColor(COLORS.mid)
      .fontSize(7)
      .font("Helvetica-Bold")
      .text(label.toUpperCase(), x + 6, startY + 5, { width: cellW - 12 });
    doc
      .fillColor(COLORS.navy)
      .fontSize(12)
      .font("Helvetica-Bold")
      .text(String(value), x + 6, startY + 15, { width: cellW - 12 });
    if (sub) {
      doc
        .fillColor(COLORS.mid)
        .fontSize(7)
        .font("Helvetica")
        .text(sub, x + 6, startY + 30, { width: cellW - 12 });
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

function drawLineChart(doc, x, y, w, h, series, keys, labels, colors) {
  if (!series?.length) return;
  doc.save();
  doc.rect(x, y, w, h).fill(COLORS.bg);
  doc.rect(x, y, w, h).stroke(COLORS.border);

  const allVals = series.flatMap((r) => keys.map((k) => Number(r[k]) || 0));
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const span = maxV - minV || 1;
  const pY = (v) => y + h - 4 - ((v - minV) / span) * (h - 12);
  const pX = (i) => x + 4 + (i / Math.max(1, series.length - 1)) * (w - 8);

  // Grid lines
  doc.strokeColor(COLORS.border).lineWidth(0.3);
  for (let g = 0; g <= 4; g++) {
    const gy = y + (g / 4) * h;
    doc.moveTo(x + 1, gy).lineTo(x + w - 1, gy).stroke();
  }

  // Series lines
  const palette = colors ?? [COLORS.emerald, COLORS.violet, COLORS.amber, COLORS.blue];
  for (let ki = 0; ki < keys.length; ki++) {
    const k = keys[ki];
    const c = palette[ki % palette.length];
    doc.strokeColor(c).lineWidth(1.5);
    let first = true;
    for (let i = 0; i < series.length; i++) {
      const vx = pX(i);
      const vy = pY(Number(series[i][k]) || 0);
      if (first) {
        doc.moveTo(vx, vy);
        first = false;
      } else {
        doc.lineTo(vx, vy);
      }
    }
    doc.stroke();

    // Legend dot + label
    if (labels?.[ki]) {
      const lx = x + 4 + ki * 90;
      const ly = y - 12;
      doc.circle(lx + 4, ly + 4, 3).fill(c);
      doc.fillColor(COLORS.slate).fontSize(7).text(labels[ki], lx + 10, ly, { width: 80 });
    }
  }

  // X-axis month labels (every ~6)
  doc.fillColor(COLORS.mid).fontSize(6);
  const step = Math.max(1, Math.floor(series.length / 6));
  for (let i = 0; i < series.length; i += step) {
    const vx = pX(i);
    doc.text(`M${series[i].month ?? i + 1}`, vx - 6, y + h + 2, { width: 20, align: "center" });
  }

  doc.restore();
}

function projectionTable(doc, series, maxRows = 24) {
  const cols = [
    { key: "month", label: "Mo", w: 28, align: "center" },
    { key: "units_sold", label: "Units sold", w: 56, fmt: (v) => Math.round(v).toLocaleString() },
    { key: "collections", label: "Collections", w: 72, fmt: money },
    { key: "ebitda", label: "EBITDA", w: 72, fmt: money },
    { key: "net_income", label: "Net income", w: 72, fmt: money },
    { key: "closing_debt", label: "Closing debt", w: 72, fmt: money },
    { key: "cash_end", label: "Cash end", w: 72, fmt: money },
    { key: "dscr", label: "DSCR", w: 40, fmt: (v) => (v != null && Number.isFinite(v) ? v.toFixed(2) : "—") },
  ];

  const totalW = cols.reduce((s, c) => s + c.w, 0);
  const startX = 48;
  const rowH = 14;
  let ty = doc.y;

  doc.save();
  doc.rect(startX, ty, totalW, rowH).fill(COLORS.navy);
  let cx = startX;
  for (const col of cols) {
    doc
      .fillColor("#ffffff")
      .fontSize(7)
      .font("Helvetica-Bold")
      .text(col.label, cx + 2, ty + 3, { width: col.w - 4, align: col.align ?? "right" });
    cx += col.w;
  }
  ty += rowH;
  doc.font("Helvetica");

  const shown = series.slice(0, maxRows);
  for (let ri = 0; ri < shown.length; ri++) {
    const r = shown[ri];
    const bg = ri % 2 === 0 ? "#ffffff" : COLORS.bg;
    doc.rect(startX, ty, totalW, rowH).fill(bg).stroke(COLORS.border);

    cx = startX;
    for (const col of cols) {
      const raw = r[col.key];
      const text = col.fmt ? col.fmt(raw) : raw == null ? "—" : String(raw);
      const color = col.key === "ebitda" || col.key === "net_income"
        ? (Number(raw) >= 0 ? COLORS.green : COLORS.red)
        : COLORS.slate;
      doc
        .fillColor(color)
        .fontSize(6.5)
        .text(text, cx + 2, ty + 3, { width: col.w - 4, align: col.align ?? "right" });
      cx += col.w;
    }
    ty += rowH;
  }

  if (series.length > maxRows) {
    doc
      .fillColor(COLORS.mid)
      .fontSize(7)
      .text(`… and ${series.length - maxRows} more months (see CSV export for full dataset)`, startX, ty + 4);
    ty += 14;
  }

  doc.y = ty + 8;
  doc.restore();
}

/**
 * @param {object} opts
 * @param {Record<string, number | null>[]} opts.series
 * @param {Record<string, number | null>} opts.summary
 * @param {Record<string, number | null> | null} opts.milestones
 * @param {Record<string, unknown>[] | null} opts.scenarios
 * @param {Record<string, unknown>} opts.ctl
 * @param {'investor'|'lender'} opts.stakeholderType
 * @param {string} [opts.companyName]
 * @param {string} [opts.productName]
 */
export function buildInvestorPdfBuffer(opts) {
  const {
    series = [],
    summary = {},
    milestones = {},
    scenarios = null,
    ctl = {},
    stakeholderType = "investor",
    companyName = "ClevaCredit",
    productName = "PAYGO Credit",
  } = opts;

  const isLender = String(stakeholderType).toLowerCase() === "lender";
  const docTitle = isLender
    ? `${companyName} — Credit Facility & Lending Memorandum`
    : `${companyName} — Equity & Growth Investment Memorandum`;
  const reportDate = new Date().toLocaleDateString("en-GB", { dateStyle: "long" });

  return new Promise((resolve, reject) => {
    const pc = { n: 1 };
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      info: { Title: docTitle, Author: companyName, Subject: "Business Model Projection" },
    });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const { investor_pct, creditor_pct } = capitalSplitFromCtl(ctl);
    const cs = capitalStackForReport(summary.peak_debt ?? 0, investor_pct, creditor_pct);

    // ── PAGE 1: COVER ────────────────────────────────────────────────────────
    const coverH = 200;
    doc.rect(0, 0, doc.page.width, coverH).fill(COLORS.navy);
    doc
      .fillColor(COLORS.accent)
      .fontSize(22)
      .font("Helvetica-Bold")
      .text(companyName, 48, 40, { width: doc.page.width - 96, align: "center" });
    doc
      .fillColor("#ffffff")
      .fontSize(15)
      .text(productName, 48, 76, { width: doc.page.width - 96, align: "center" });
    doc
      .fillColor("#cbd5e1")
      .fontSize(11)
      .font("Helvetica")
      .text(isLender ? "Credit Facility Memorandum" : "Investment Memorandum", 48, 104, {
        width: doc.page.width - 96,
        align: "center",
      });
    doc
      .fillColor(COLORS.light)
      .fontSize(9)
      .text(`Prepared: ${reportDate}`, 48, 130, { width: doc.page.width - 96, align: "center" });
    doc
      .fillColor("#64748b")
      .fontSize(8)
      .text("CONFIDENTIAL — For discussion purposes only", 48, 148, {
        width: doc.page.width - 96,
        align: "center",
      });

    doc.y = coverH + 24;
    drawPageFooter(doc, pc.n, companyName, reportDate);

    // TOC
    sectionHeader(doc, "TABLE OF CONTENTS", COLORS.navy);
    const tocItems = [
      ["1.", "Executive Summary & Key Metrics", 3],
      ["2.", "Capital Stack & Facility Structure", 3],
      ["3.", "Revenue & Growth Trajectory", 4],
      ["4.", "Cash Flow & Debt Service", 4],
      ["5.", "Unit Economics", 5],
      ["6.", "Monthly Projection Table", 5],
      ["7.", "Scenario Analysis", 6],
      ["8.", "KPI Interpretation & Risk Factors", 6],
      ["9.", "Assumptions & Methodology", 7],
      ["10.", "Appendix — Formula Reference", 7],
    ];
    for (const [num, title, pg] of tocItems) {
      doc
        .fillColor(COLORS.slate)
        .fontSize(9)
        .text(`${num}  ${title}`, 56, doc.y, { width: doc.page.width - 140, continued: false })
        .text(`p.${pg}`, { align: "right", width: doc.page.width - 140 });
      doc.y -= 12;
      doc.moveDown(0.4);
    }

    // ── SECTION 1: EXECUTIVE SUMMARY ─────────────────────────────────────────
    ensureSpace(doc, pc, companyName, reportDate, 260);
    sectionHeader(doc, "1. EXECUTIVE SUMMARY & KEY METRICS", COLORS.navy);

    bodyText(
      doc,
      isLender
        ? `This memorandum presents the financial projections for ${companyName}'s ${productName} facility. ` +
          `The analysis covers a ${ctl.proj_months ?? 36}-month horizon under the selected volume and credit assumptions, ` +
          `demonstrating debt service capacity, peak facility requirements, and repayment trajectory.`
        : `This memorandum presents the forward financial model for ${companyName}'s ${productName} business. ` +
          `The analysis covers a ${ctl.proj_months ?? 36}-month projection horizon under the selected scenario assumptions, ` +
          `demonstrating the growth profile, capital requirements, return potential, and path to profitability.`
    );
    bodyText(
      doc,
      "This report is structured to support decision meetings with investment committees, risk teams, and treasury. " +
        "Each section explains the financial signal, the operating driver behind that signal, and the downside sensitivity. " +
        "Where relevant, the model highlights covenant pressure points and assumptions that should be validated with live portfolio data."
    );
    doc.moveDown(0.4);

    subHeader(doc, "Key Performance Indicators");
    kpiGrid(
      doc,
      [
        ["Peak Facility / Debt", money(summary.peak_debt), "Max drawdown on credit line"],
        ["Ending Cash", money(summary.ending_cash), `Month ${series.length} balance`],
        ["Cumulative EBITDA", money(summary.cum_ebitda), `Over ${series.length} months`],
        ["Cumulative Net Income", money(summary.cum_ni), "After tax & interest"],
        ["NPV of FCF", money(summary.npv_fcf), `At ${Number(ctl.hurdle_annual ?? 0.15) * 100}% hurdle`],
        [
          "IRR (annualized)",
          summary.irr_annualized != null ? pct(summary.irr_annualized, 1) : "—",
          "From free cash flow stream",
        ],
        ["Min DSCR", summary.min_dscr != null ? summary.min_dscr.toFixed(2) + "×" : "—", "Worst month coverage ratio"],
        [
          "Breakeven Devices/Mo",
          summary.breakeven_devices_mo != null && isFinite(summary.breakeven_devices_mo)
            ? Math.ceil(summary.breakeven_devices_mo).toLocaleString()
            : "—",
          "Min monthly sales to cover fixed costs",
        ],
        ["Gross Contract / Device", money(summary.gross_contract), "Revenue before defaults"],
      ],
      3
    );

    subHeader(doc, "Profitability Milestones");
    bulletList(doc, [
      `First positive EBITDA: Month ${milestones?.first_operating_profit_month ?? "—"}`,
      `First net profit: Month ${milestones?.first_net_profit_month ?? "—"}`,
      `Cumulative NI turns positive: Month ${milestones?.first_cumulative_net_positive_month ?? "—"}`,
      `Strongest EBITDA month: Month ${milestones?.strongest_ebitda_month ?? "—"} (${money(milestones?.strongest_ebitda_rwf)})`,
    ]);

    // ── SECTION 2: CAPITAL STACK ─────────────────────────────────────────────
    ensureSpace(doc, pc, companyName, reportDate, 240);
    sectionHeader(doc, "2. CAPITAL STACK & FACILITY STRUCTURE", COLORS.violet);

    bodyText(
      doc,
      `The model assumes a blended financing structure with ${cs.investor_pct.toFixed(0)}% equity ` +
        `and ${cs.creditor_pct.toFixed(0)}% debt. The implied total capital envelope is ` +
        `${money(cs.implied_total_capital, false)} based on peak modeled debt of ${money(summary.peak_debt, false)}.`
    );
    doc.moveDown(0.4);

    kpiGrid(
      doc,
      [
        ["Equity Target", `${cs.investor_pct.toFixed(0)}%`, "Investor / equity share"],
        ["Debt Target", `${cs.creditor_pct.toFixed(0)}%`, "Creditor / lender share"],
        ["Total Capital Envelope", money(cs.implied_total_capital), "Implied from peak debt"],
        ["Equity Ticket", money(cs.implied_equity_raise), "Implied equity raise"],
        ["Creditor Tranche (peak)", money(cs.creditor_tranche_peak), "At peak drawdown"],
        ["Cost of Debt", `${Number(ctl.debt_rate_pct ?? 18)}%`, "Annual, per scenario"],
        ["Grace Period", `${ctl.grace_mos ?? "—"} months`, "Interest-only period"],
        ["Amortization", `${ctl.amort_mos ?? "—"} months`, "Principal paydown schedule"],
        ["DSCR Covenant Floor", `${Number(ctl.dscr_floor ?? 1.15).toFixed(2)}×`, "Reference covenant"],
      ],
      3
    );

    subHeader(doc, isLender ? "Lender-Specific Notes" : "Investor-Specific Notes");
    if (isLender) {
      bulletList(doc, [
        `Debt is drawn down as monthly units require financing (device cost per unit × monthly sales).`,
        `Minimum cash reserve of RWF ${money(Number(ctl.min_cash_rwf ?? 50e6))} is maintained at all times.`,
        `DSCR is computed as EBITDA / debt service; covenant floor is ${Number(ctl.dscr_floor ?? 1.15).toFixed(2)}×.`,
        `Default rate assumption: ${ctl.def_rate_pct ?? 10}% of monthly originations, with ${ctl.recovery_pct ?? 35}% recovery rate on defaults.`,
        `Grace period: ${ctl.grace_mos ?? 3} months interest-only before amortization begins over ${ctl.amort_mos ?? 33} months.`,
      ]);
    } else {
      bulletList(doc, [
        `Equity injection required upfront to fund ramp-phase cash needs before EBITDA turns positive.`,
        `NPV of ${money(summary.npv_fcf)} calculated at ${Number(ctl.hurdle_annual ?? 0.15) * 100}% annual hurdle rate.`,
        `IRR of ${pct(summary.irr_annualized, 1)} represents the return on the full free cash flow stream.`,
        `No dividends or returns modeled explicitly — assumes reinvestment for growth within horizon.`,
      ]);
    }

    // ── SECTION 3: CHARTS ────────────────────────────────────────────────────
    ensureSpace(doc, pc, companyName, reportDate, 340);
    sectionHeader(doc, "3. REVENUE & GROWTH TRAJECTORY", COLORS.emerald);

    if (series.length > 0) {
      bodyText(doc, "Monthly collections (total cash received from customers) and units sold by sales cohort.");
      doc.moveDown(0.6);
      ensureSpace(doc, pc, companyName, reportDate, 170);
      drawLineChart(
        doc,
        48,
        doc.y + 20,
        doc.page.width - 96,
        110,
        series,
        ["collections", "units_sold"],
        ["Collections (RWF)", "Units sold"],
        [COLORS.emerald, COLORS.violet]
      );
      doc.y += 148;

      doc.moveDown(0.6);
      bodyText(
        doc,
        "EBITDA and net income monthly progression. Negative early months reflect device deployment costs " +
          "and fixed overheads before the portfolio generates sufficient recurring cash."
      );
      doc.moveDown(0.4);
      ensureSpace(doc, pc, companyName, reportDate, 150);
      drawLineChart(
        doc,
        48,
        doc.y + 16,
        doc.page.width - 96,
        100,
        series,
        ["ebitda", "net_income"],
        ["EBITDA", "Net income"],
        [COLORS.blue, COLORS.amber]
      );
      doc.y += 130;
    } else {
      bodyText(doc, "(No projection series available — run the model from the PAYGO workspace first.)");
    }

    // ── SECTION 4: CASH & DEBT ───────────────────────────────────────────────
    ensureSpace(doc, pc, companyName, reportDate, 330);
    sectionHeader(doc, "4. CASH FLOW & DEBT SERVICE", COLORS.blue);

    if (series.length > 0) {
      bodyText(
        doc,
        "Cash end-of-month balance and closing debt. The cash floor (minimum reserve) triggers automatic " +
          "facility drawdowns. Debt repayment begins after the grace period and is amortized over the agreed schedule."
      );
      doc.moveDown(0.6);
      ensureSpace(doc, pc, companyName, reportDate, 170);
      drawLineChart(
        doc,
        48,
        doc.y + 16,
        doc.page.width - 96,
        110,
        series,
        ["cash_end", "closing_debt"],
        ["Cash (end of month)", "Closing debt"],
        [COLORS.emerald, COLORS.red]
      );
      doc.y += 146;

      bodyText(doc, "DSCR (Debt Service Coverage Ratio) — EBITDA ÷ debt service. Values above covenant floor indicate headroom.");
      doc.moveDown(0.4);
      const dscrSeries = series.filter((r) => r.dscr != null && Number.isFinite(r.dscr));
      if (dscrSeries.length) {
        ensureSpace(doc, pc, companyName, reportDate, 150);
        drawLineChart(
          doc,
          48,
          doc.y + 16,
          doc.page.width - 96,
          90,
          dscrSeries,
          ["dscr"],
          ["DSCR"],
          [COLORS.violet]
        );
        doc.y += 118;
      }
    }

    // ── SECTION 5: UNIT ECONOMICS ────────────────────────────────────────────
    ensureSpace(doc, pc, companyName, reportDate, 300);
    sectionHeader(doc, "5. UNIT ECONOMICS", COLORS.amber);

    kpiGrid(
      doc,
      [
        ["Gross Contract / Device", money(summary.gross_contract), "Full repayment before default adj."],
        ["Blended Deposit", money(summary.blended_deposit), "Avg down payment collected upfront"],
        ["Deposit vs Device Cost", pct(summary.deposit_vs_device), "Down payment as % of device cost"],
        ["Expected Cash / Device", money(summary.expected_cash_per_device), "After default & recovery adj."],
        ["Contribution / Device", money(summary.contribution_per_device), "After all variable costs"],
        ["Breakeven Volume/Mo", summary.breakeven_devices_mo != null && isFinite(summary.breakeven_devices_mo) ? Math.ceil(summary.breakeven_devices_mo).toLocaleString() + " units" : "—", "Min monthly sales to cover fixed"],
      ],
      3
    );

    doc.moveDown(0.4);
    subHeader(doc, "Pricing Mix Assumptions");
    kpiGrid(
      doc,
      [
        ["3-Month Plan Mix", `${Number(ctl.mix_p3 ?? 30).toFixed(0)}%`, `Discount: ${Number(ctl.disc3_pct ?? 30)}%`],
        ["6-Month Plan Mix", `${Number(ctl.mix_p6 ?? 20).toFixed(0)}%`, `Discount: ${Number(ctl.disc6_pct ?? 20)}%`],
        ["12-Month Plan Mix", `${Number(ctl.mix_p12 ?? 50).toFixed(0)}%`, `Discount: ${Number(ctl.disc12_pct ?? 0)}%`],
        ["Customer Payback Multiple", `${Number(ctl.customer_payback_multiple ?? 1.7).toFixed(2)}×`, "Full contract vs device cost"],
        ["Default Rate", `${Number(ctl.def_rate_pct ?? 10).toFixed(1)}%`, "Of monthly originations"],
        ["Recovery Rate", `${Number(ctl.recovery_pct ?? 35).toFixed(0)}%`, "On defaulted contracts"],
      ],
      3
    );

    // ── SECTION 6: PROJECTION TABLE ──────────────────────────────────────────
    ensureSpace(doc, pc, companyName, reportDate, 360);
    sectionHeader(doc, "6. MONTHLY PROJECTION TABLE", COLORS.navy);
    bodyText(
      doc,
      "All values in RWF. Red/orange net income reflects pre-breakeven losses; green indicates profitability. " +
        "Full dataset available in the CSV export package."
    );
    doc.moveDown(0.3);

    if (series.length > 0) {
      projectionTable(doc, series, 30);
    } else {
      bodyText(doc, "(Run the PAYGO model to generate the projection series.)");
    }

    // ── SECTION 7: SCENARIO ANALYSIS ─────────────────────────────────────────
    ensureSpace(doc, pc, companyName, reportDate, 260);
    sectionHeader(doc, "7. SCENARIO ANALYSIS", COLORS.navy);

    bodyText(
      doc,
      "The table below shows the impact of individual lever changes on the path to profitability. " +
        "Each row modifies one assumption against the base scenario."
    );
    doc.moveDown(0.4);

    if (scenarios?.length) {
      const hdrs = Object.keys(scenarios[0]);
      const colW = Math.min(90, (doc.page.width - 96) / hdrs.length);
      const startX = 48;
      const rowH = 16;
      let ty = doc.y;

      doc.rect(startX, ty, colW * hdrs.length, rowH).fill(COLORS.navy);
      let cx2 = startX;
      for (const h of hdrs) {
        doc.fillColor("#ffffff").fontSize(6.5).font("Helvetica-Bold").text(h, cx2 + 2, ty + 4, { width: colW - 4 });
        cx2 += colW;
      }
      ty += rowH;
      doc.font("Helvetica");

      for (let ri = 0; ri < scenarios.length; ri++) {
        if (ty + rowH > doc.page.height - 64) {
          addPage(doc, pc, companyName, reportDate);
          sectionHeader(doc, "7. SCENARIO ANALYSIS (continued)", COLORS.navy);
          ty = doc.y;
          doc.rect(startX, ty, colW * hdrs.length, rowH).fill(COLORS.navy);
          cx2 = startX;
          for (const h of hdrs) {
            doc.fillColor("#ffffff").fontSize(6.5).font("Helvetica-Bold").text(h, cx2 + 2, ty + 4, { width: colW - 4 });
            cx2 += colW;
          }
          ty += rowH;
          doc.font("Helvetica");
        }
        const bg = ri % 2 === 0 ? "#ffffff" : COLORS.bg;
        doc.rect(startX, ty, colW * hdrs.length, rowH).fill(bg).stroke(COLORS.border);
        cx2 = startX;
        for (const h of hdrs) {
          const v = scenarios[ri][h];
          doc.fillColor(COLORS.slate).fontSize(6.5).text(v == null ? "—" : String(v), cx2 + 2, ty + 4, { width: colW - 4 });
          cx2 += colW;
        }
        ty += rowH;
      }
      doc.y = ty + 12;
    } else {
      bodyText(doc, "(Run the model from the Scenario tab to populate this table.)");
    }

    // ── SECTION 8: KPI INTERPRETATION ────────────────────────────────────────
    ensureSpace(doc, pc, companyName, reportDate, 300);
    sectionHeader(doc, "8. KPI INTERPRETATION & RISK FACTORS", COLORS.red);

    const kpiMeta = [
      {
        name: "EBITDA",
        full: "Earnings Before Interest, Tax, Depreciation & Amortisation",
        formula: "Collections − device cost − logistics/CAC − variable opex − fixed opex",
        interpretation:
          "Positive EBITDA indicates the core operations generate cash before financing costs. " +
          "Sustained negative EBITDA requires equity injection or facility draw.",
        risk: "Sensitive to default rate, volume ramp speed, and fixed cost base.",
      },
      {
        name: "DSCR",
        full: "Debt Service Coverage Ratio",
        formula: "EBITDA ÷ (Interest paid + Principal repaid in the month)",
        interpretation:
          `A DSCR above ${Number(ctl.dscr_floor ?? 1.15).toFixed(2)}× indicates comfortable debt service. ` +
          "Values below 1.0 mean EBITDA cannot cover debt obligations that month.",
        risk: "Sharp volume drops or higher defaults can push DSCR below covenant floor, triggering lender review.",
      },
      {
        name: "IRR",
        full: "Internal Rate of Return (annualized)",
        formula: "Annualized discount rate that sets NPV of free cash flow stream to zero",
        interpretation:
          "Higher IRR indicates better return per unit of capital deployed. " +
          "Compared against the hurdle rate to assess investment viability.",
        risk: "IRR is highly sensitive to the timing of cash flows — early losses compress it significantly.",
      },
      {
        name: "NPV",
        full: "Net Present Value of Free Cash Flow",
        formula: `PV of FCF discounted at ${(Number(ctl.hurdle_annual ?? 0.15) * 100).toFixed(0)}% annual hurdle rate`,
        interpretation:
          "Positive NPV means the business creates value above the hurdle rate. " +
          "This is the primary investor return metric.",
        risk: "Sensitive to hurdle rate assumption and long-term volume sustainability.",
      },
      {
        name: "Breakeven Volume",
        full: "Minimum Monthly Units to Cover Fixed Costs",
        formula: "Fixed monthly opex ÷ contribution per device",
        interpretation:
          "The number of devices that must be sold every month to keep EBITDA non-negative, " +
          "assuming steady-state operations.",
        risk: "Fixed opex is largely independent of volume; slower ramp extends the loss-making period.",
      },
    ];

    for (const m of kpiMeta) {
      ensureSpace(doc, pc, companyName, reportDate, 110);
      subHeader(doc, `${m.name} — ${m.full}`);
      doc.fillColor(COLORS.mid).fontSize(7.5).font("Helvetica-Oblique").text(`Formula: ${m.formula}`, { indent: 8 });
      doc.font("Helvetica").moveDown(0.15);
      bodyText(doc, m.interpretation, 8);
      doc.fillColor(COLORS.amber).fontSize(7.5).text(`Risk note: ${m.risk}`, 56, doc.y, { width: doc.page.width - 112 });
      doc.moveDown(0.6);
    }

    // ── SECTION 9: ASSUMPTIONS ───────────────────────────────────────────────
    ensureSpace(doc, pc, companyName, reportDate, 300);
    sectionHeader(doc, "9. ASSUMPTIONS & METHODOLOGY", COLORS.slate);

    subHeader(doc, "Volume Assumptions");
    bodyText(
      doc,
      `Volume mode: ${ctl.volume_mode ?? "Base"} | Multiplier: ${ctl.vol_mult ?? 1.0}× | ` +
        `Ramp: linear from month 1 to steady state, then constant.`
    );

    subHeader(doc, "Pricing & Contract Assumptions");
    bulletList(doc, [
      `Device tier: ${ctl.device_tier_label ?? "Standard"} (cost: ${money(ctl.custom_dev_cost_rwf ?? summary.gross_contract)})`,
      `Customer payback multiple: ${Number(ctl.customer_payback_multiple ?? 1.7).toFixed(2)}× device cost`,
      `Down payment: ${ctl.dep_pct ?? 30}% of contract value at signing`,
      `Plan mix: ${ctl.mix_p3 ?? 30}% 3-month / ${ctl.mix_p6 ?? 20}% 6-month / ${ctl.mix_p12 ?? 50}% 12-month`,
      `Discounts: ${ctl.disc3_pct ?? 30}% / ${ctl.disc6_pct ?? 20}% / ${ctl.disc12_pct ?? 0}%`,
    ]);

    subHeader(doc, "Credit & Default Assumptions");
    bulletList(doc, [
      `Default rate: ${ctl.def_rate_pct ?? 10}% of monthly originations`,
      `Recovery rate: ${ctl.recovery_pct ?? 35}% on defaulted contracts`,
      `Default timing: weighted across months 1–12 of contract life`,
    ]);

    subHeader(doc, "Financing Assumptions");
    bulletList(doc, [
      `Cost of debt: ${ctl.debt_rate_pct ?? 18}% per annum`,
      `Grace period: ${ctl.grace_mos ?? 3} months interest-only`,
      `Amortization: ${ctl.amort_mos ?? 33} months`,
      `DSCR covenant floor: ${Number(ctl.dscr_floor ?? 1.15).toFixed(2)}×`,
      `Minimum cash reserve: RWF ${money(50e6)} (triggers drawdown)`,
    ]);

    subHeader(doc, "Fixed Opex Composition");
    bulletList(doc, [
      "Cloud & CRM platform costs",
      "Field support & collections team salaries",
      "Technology & admin overhead",
      "Warehouse & logistics fixed costs",
    ]);

    // ── SECTION 10: APPENDIX ─────────────────────────────────────────────────
    ensureSpace(doc, pc, companyName, reportDate, 260);
    sectionHeader(doc, "10. APPENDIX — FORMULA REFERENCE", COLORS.navy);

    const formulas = [
      ["Gross contract", "base_repay × (1 - discount) weighted by plan mix"],
      ["Blended deposit", "Gross contract × down_payment_pct, weighted by mix"],
      ["Net installment (age a)", "plan_installment × (1 - def_rate) + def_rate × recovery_rwf × weight(a)"],
      ["Collections (month m)", "∑_vintage(v) units(v) × [deposit if m=v, else net_installment(age m-v)]"],
      ["EBITDA", "Collections − device − lock − CAC − commission − MM − platform − SMS − cloud − staff − wh − default_ops"],
      ["Interest expense", "opening_debt × debt_rate / 12"],
      ["EBT", "EBITDA − interest"],
      ["Pre-debt cash", "EBITDA − tax"],
      ["Facility draw", "max(0, min_cash − (prior_cash + pre_debt))"],
      ["Principal payment", "min(opening_debt+draw, (opening_debt+draw)/amort_mos) if past grace"],
      ["Closing debt", "opening + draw − principal"],
      ["Cash end", "prior_cash + pre_debt + draw − interest − principal"],
      ["DSCR", "EBITDA / (interest + principal), null if no debt service"],
      ["FCF", "pre_debt − interest − principal + draw"],
      ["NPV", "∑ FCF_t / (1 + hurdle/12)^t"],
      ["IRR (annualized)", "(1 + monthly_irr)^12 − 1  [bisection method on FCF stream]"],
    ];

    for (const [label, formula] of formulas) {
      ensureSpace(doc, pc, companyName, reportDate, 28);
      doc.fillColor(COLORS.navy).fontSize(8).font("Helvetica-Bold").text(label, 48, doc.y, { width: 160, continued: false });
      doc.y -= 12;
      doc.fillColor(COLORS.slate).fontSize(7.5).font("Helvetica").text(formula, 220, doc.y, { width: doc.page.width - 268 });
      doc.rect(48, doc.y - 2, doc.page.width - 96, 0.5).fill(COLORS.border);
      doc.moveDown(0.5);
    }

    doc.moveDown(1);
    doc
      .fillColor(COLORS.mid)
      .fontSize(8)
      .font("Helvetica-Oblique")
      .text(
        "Disclaimer: This document is generated from internal forward models for discussion purposes only. " +
          "It is not an offer, solicitation, or investment commitment. All figures are projections based on " +
          "stated assumptions and may differ materially from actual outcomes. Facility terms, covenants, " +
          "and allocations must be confirmed with legal and financial advisors against live portfolio data.",
        { width: doc.page.width - 96, align: "justify" }
      );

    doc.end();
  });
}
