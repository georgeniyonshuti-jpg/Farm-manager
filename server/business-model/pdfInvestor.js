/**
 * Investor / lender memorandum PDF (PDFKit — no ReportLab/matplotlib).
 */

import PDFDocument from "pdfkit";
import { capitalStackForReport, capitalSplitFromCtl } from "./paygoMemorandum.js";

function money(x) {
  if (x == null || !Number.isFinite(Number(x))) return "—";
  const v = Number(x);
  if (Math.abs(v) >= 1e9) return `RWF ${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `RWF ${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `RWF ${(v / 1e3).toFixed(0)}K`;
  return `RWF ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function drawLineChart(doc, x, y, w, h, series, dataKey, label) {
  if (!series?.length) return;
  const vals = series.map((r) => Number(r[dataKey]) || 0);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  doc.save();
  doc.rect(x, y, w, h).stroke("#94a3b8");
  doc.fontSize(8).fillColor("#334155").text(label, x, y - 12, { width: w });
  doc.strokeColor("#0ea5e9").lineWidth(1);
  let first = true;
  for (let i = 0; i < series.length; i += 1) {
    const px = x + (i / Math.max(1, series.length - 1)) * w;
    const py = y + h - ((vals[i] - min) / span) * (h - 4) - 2;
    if (first) {
      doc.moveTo(px, py);
      first = false;
    } else {
      doc.lineTo(px, py);
    }
  }
  doc.stroke();
  doc.restore();
}

/**
 * @param {object} opts
 * @param {Record<string, number | null>[]} opts.series
 * @param {Record<string, number | null>} opts.summary
 * @param {Record<string, number | null> | null} opts.milestones
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
    ctl = {},
    stakeholderType = "investor",
    companyName = "ClevaCredit",
    productName = "PAYGO Credit",
  } = opts;

  const isLender = String(stakeholderType).toLowerCase() === "lender";
  const docTitle = isLender
    ? "Credit facility & lending memorandum (summary)"
    : "Equity & growth investment memorandum (summary)";

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: docTitle, Author: companyName } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const { investor_pct, creditor_pct } = capitalSplitFromCtl(ctl);
    const cs = capitalStackForReport(summary.peak_debt ?? 0, investor_pct, creditor_pct);

    doc.rect(0, 0, doc.page.width, 120).fill("#0f172a");
    doc.fillColor("#e2e8f0").fontSize(10).text(companyName, 48, 36, { width: doc.page.width - 96, align: "center" });
    doc.fillColor("#38bdf8").fontSize(18).text(productName, 48, 56, { width: doc.page.width - 96, align: "center" });
    doc.fillColor("#cbd5e1").fontSize(11).text(docTitle, 48, 86, { width: doc.page.width - 96, align: "center" });
    doc.fillColor("#64748b").fontSize(8).text(new Date().toISOString().slice(0, 10), 48, 104, {
      width: doc.page.width - 96,
      align: "center",
    });

    doc.y = 140;
    doc.fillColor("#0f172a").fontSize(12).text("Executive highlights", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor("#334155");
    const lines = [
      `Peak modeled debt (facility): ${money(summary.peak_debt)}`,
      `Ending cash (horizon): ${money(summary.ending_cash)}`,
      `Cumulative EBITDA: ${money(summary.cum_ebitda)}`,
      `Cumulative net income: ${money(summary.cum_ni)}`,
      `NPV of FCF (@ hurdle): ${money(summary.npv_fcf)}`,
      summary.irr_annualized != null ? `IRR (annualized): ${(summary.irr_annualized * 100).toFixed(2)}%` : "IRR: —",
      `Min DSCR: ${summary.min_dscr != null ? summary.min_dscr.toFixed(2) : "—"}`,
      `First operating profit (month): ${milestones?.first_operating_profit_month ?? "—"}`,
      `First net profit (month): ${milestones?.first_net_profit_month ?? "—"}`,
    ];
    for (const t of lines) {
      doc.text(`• ${t}`, { width: doc.page.width - 96 });
      doc.moveDown(0.15);
    }

    doc.moveDown(0.6);
    doc.fillColor("#0f172a").fontSize(12).text("Capital stack (illustrative)", { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#334155");
    doc.text(`Investor target: ${cs.investor_pct.toFixed(0)}% · Creditor target: ${cs.creditor_pct.toFixed(0)}%`);
    doc.text(`Implied total capital envelope: ${money(cs.implied_total_capital)}`);
    doc.text(`Implied equity ticket: ${money(cs.implied_equity_raise)}`);
    doc.text(`Creditor tranche at peak: ${money(cs.creditor_tranche_peak)}`);

    doc.moveDown(0.8);
    drawLineChart(doc, 48, doc.y + 16, doc.page.width - 96, 100, series, "collections", "Monthly collections (RWF)");
    doc.moveDown(7.5);
    drawLineChart(doc, 48, doc.y, doc.page.width - 96, 100, series, "closing_debt", "Closing debt (RWF)");

    doc.addPage();
    doc.fillColor("#0f172a").fontSize(11).text(isLender ? "Lender notes" : "Investor notes", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(9).fillColor("#475569");
    const disclaimer =
      "This document is generated from internal forward models for discussion only. It is not an offer, solicitation, " +
      "or commitment. Facility terms, covenants, and allocations must be confirmed with legal and finance advisors " +
      "and against live portfolio data.";
    doc.text(disclaimer, { width: doc.page.width - 96, align: "justify" });

    doc.end();
  });
}
