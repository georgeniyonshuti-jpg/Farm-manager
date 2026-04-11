/**
 * Broiler batch PDF (PDFKit) — mirrors broiler_pdf.py structure without matplotlib.
 */

import PDFDocument from "pdfkit";

function money(x) {
  if (x == null || !Number.isFinite(Number(x))) return "—";
  const v = Number(x);
  if (Math.abs(v) >= 1e6) return `RWF ${(v / 1e6).toFixed(2)}M`;
  return `RWF ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function drawDualLine(doc, x, y, w, h, trajectory) {
  if (!trajectory?.length) return;
  const days = trajectory.map((r) => r.day);
  const c = trajectory.map((r) => (Number(r.cost_cum_rwf) || 0) / 1e6);
  const r = trajectory.map((t) => (Number(t.revenue_cum_rwf) || 0) / 1e6);
  const maxY = Math.max(...c, ...r, 1e-6);
  doc.save();
  doc.rect(x, y, w, h).stroke("#cbd5e1");
  doc.fontSize(8).fillColor("#334155").text("Cumulative cost / revenue (M RWF)", x, y - 12);
  doc.strokeColor("#0ea5e9").lineWidth(1);
  let first = true;
  for (let i = 0; i < trajectory.length; i += 1) {
    const px = x + (i / Math.max(1, trajectory.length - 1)) * w;
    const py = y + h - (c[i] / maxY) * (h - 4) - 2;
    if (first) {
      doc.moveTo(px, py);
      first = false;
    } else doc.lineTo(px, py);
  }
  doc.stroke();
  doc.strokeColor("#22c55e");
  first = true;
  for (let i = 0; i < trajectory.length; i += 1) {
    const px = x + (i / Math.max(1, trajectory.length - 1)) * w;
    const py = y + h - (r[i] / maxY) * (h - 4) - 2;
    if (first) {
      doc.moveTo(px, py);
      first = false;
    } else doc.lineTo(px, py);
  }
  doc.stroke();
  doc.restore();
}

export function buildBroilerPdfBuffer(opts) {
  const {
    summary = {},
    trajectory = [],
    insights = [],
    farmName = "Broiler operation",
    complianceScore = null,
    healthStatus = "Good",
  } = opts;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `${farmName} — Broiler report` } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fillColor("#0f172a").fontSize(18).text(farmName);
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor("#334155").text("ClevaCredit — Broiler batch performance report");
    doc.moveDown(0.6);
    doc.fontSize(10);
    const rows = [
      ["Metric", "Value"],
      ["Net profit (RWF)", money(summary.net_profit_rwf)],
      ["Gross profit (RWF)", money(summary.gross_profit_rwf)],
      ["Revenue (RWF)", money(summary.revenue_rwf)],
      ["Total cost (RWF)", money(summary.total_cost_rwf)],
      ["Birds harvested", summary.birds_end != null ? String(Math.round(summary.birds_end)) : "—"],
      ["Effective FCR", summary.effective_fcr != null ? summary.effective_fcr.toFixed(3) : "—"],
      ["Compliance (7d)", complianceScore != null ? `${Math.round(complianceScore)}/100` : "—"],
      ["Latest vet status", String(healthStatus)],
    ];
    const col1 = 220;
    const col2 = doc.page.width - 96 - col1;
    let ty = doc.y;
    for (let i = 0; i < rows.length; i += 1) {
      const [a, b] = rows[i];
      doc.rect(48, ty, col1, 22).stroke("#e2e8f0");
      doc.rect(48 + col1, ty, col2, 22).stroke("#e2e8f0");
      doc.fillColor(i === 0 ? "#ffffff" : "#334155");
      if (i === 0) doc.rect(48, ty, col1 + col2, 22).fill("#0f172a");
      doc.fillColor(i === 0 ? "#ffffff" : "#0f172a");
      doc.fontSize(i === 0 ? 9 : 9).text(a, 54, ty + 6, { width: col1 - 12 });
      doc.text(b, 54 + col1, ty + 6, { width: col2 - 12 });
      ty += 22;
    }
    doc.y = ty + 16;

    drawDualLine(doc, 48, doc.y, doc.page.width - 96, 120, trajectory);
    doc.y += 140;

    doc.fillColor("#0f172a").fontSize(11).text("Key risks & recommendations");
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#475569");
    for (const ins of insights.slice(0, 10)) {
      doc.text(`• ${ins}`, { width: doc.page.width - 96 });
      doc.moveDown(0.2);
    }

    doc.end();
  });
}
