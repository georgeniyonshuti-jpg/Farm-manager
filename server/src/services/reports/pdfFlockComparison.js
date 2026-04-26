import PDFDocument from "pdfkit";

const C = {
  navy: "#0f172a",
  slate: "#334155",
  mid: "#64748b",
  border: "#e2e8f0",
  bg: "#f8fafc",
  emerald: "#059669",
  amber: "#d97706",
  red: "#dc2626",
  violet: "#7c3aed",
};

function riskColor(v) {
  if (v > 6) return C.red;
  if (v > 3) return C.amber;
  return C.emerald;
}

export function buildFlockComparisonPdfBuffer(payload) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: "Flock comparison report" } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.rect(0, 0, doc.page.width, 120).fill(C.violet);
    doc.fillColor("#fff").fontSize(20).font("Helvetica-Bold").text("Flock Comparison Report", 48, 36);
    doc.fontSize(9).font("Helvetica").text(`${payload?.meta?.flockCount ?? 0} flocks`, 48, 72);
    doc.y = 140;

    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    doc.fillColor(C.navy).fontSize(12).font("Helvetica-Bold").text("Performance Ranking");
    doc.moveDown(0.3);
    doc.fillColor(C.mid).fontSize(8).font("Helvetica-Bold")
      .text("Flock", 48).text("Age", 190).text("Mortality %", 250).text("FCR", 340).text("Feed kg", 410).text("Live birds", 490);
    doc.moveDown(0.2);
    rows.slice(0, 60).forEach((r) => {
      const mc = riskColor(Number(r.mortalityRatePct ?? 0));
      doc.fillColor(C.slate).fontSize(8).font("Helvetica")
        .text(String(r.label), 48, undefined, { width: 130 })
        .text(String(Math.floor(Number(r.ageDays ?? 0))), 190)
        .fillColor(mc).text(Number(r.mortalityRatePct ?? 0).toFixed(2), 250)
        .fillColor(C.slate).text(Number.isFinite(Number(r.fcr)) ? Number(r.fcr).toFixed(2) : "—", 340)
        .text(Math.floor(Number(r.feedToDateKg ?? 0)).toLocaleString(), 410)
        .text(Math.floor(Number(r.liveBirds ?? 0)).toLocaleString(), 490);
    });

    doc.addPage();
    doc.fillColor(C.navy).fontSize(12).font("Helvetica-Bold").text("Mortality Comparison Chart");
    const chartX = 48;
    const chartY = doc.y + 8;
    const chartW = doc.page.width - 96;
    const chartH = 220;
    doc.rect(chartX, chartY, chartW, chartH).fill(C.bg).stroke(C.border);
    const max = Math.max(1, ...rows.map((r) => Number(r.mortalityRatePct ?? 0)));
    const barW = Math.max(12, (chartW - 20) / Math.max(1, rows.length) - 6);
    rows.slice(0, 14).forEach((r, i) => {
      const v = Number(r.mortalityRatePct ?? 0);
      const bh = (v / max) * (chartH - 24);
      const bx = chartX + 10 + i * (barW + 6);
      const by = chartY + chartH - 8 - bh;
      doc.rect(bx, by, barW, bh).fill(riskColor(v));
      doc.fillColor(C.mid).fontSize(6).text(String(r.label).slice(0, 8), bx, chartY + chartH + 1, { width: barW, align: "center" });
    });
    doc.y = chartY + chartH + 20;

    doc.fillColor(C.navy).fontSize(12).font("Helvetica-Bold").text("Narrative Insights");
    doc.moveDown(0.2);
    const insights = Array.isArray(payload?.insights) ? payload.insights : [];
    insights.forEach((line) => {
      doc.fillColor(C.slate).fontSize(9).font("Helvetica").text(`• ${line}`, { width: doc.page.width - 96 });
      doc.moveDown(0.1);
    });

    doc.end();
  });
}
