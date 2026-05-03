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
  blue: "#0284c7",
};

export function buildFarmOperationsPdfBuffer(payload) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: "Farm operations report" } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const t = payload?.totals ?? {};
    const risk = payload?.riskMix ?? {};
    const rows = Array.isArray(payload?.byFlock) ? payload.byFlock : [];

    doc.rect(0, 0, doc.page.width, 120).fill(C.blue);
    doc.fillColor("#fff").fontSize(21).font("Helvetica-Bold").text("Farm Operations Intelligence", 48, 36);
    doc.fontSize(9).font("Helvetica").text(`Generated ${new Date(payload?.meta?.generatedAt ?? Date.now()).toLocaleString()}`, 48, 74);
    doc.y = 140;

    doc.fillColor(C.navy).fontSize(12).font("Helvetica-Bold").text("Farm KPI Board");
    const cards = [
      ["Active flocks", `${Math.floor(Number(t.activeFlocks ?? 0))}`],
      ["Overdue flocks", `${Math.floor(Number(t.overdueFlocks ?? 0))}`],
      ["Total mortality", `${Math.floor(Number(t.totalMortality ?? 0)).toLocaleString()}`],
      ["Avg mortality %", `${Number(t.avgMortalityRatePct ?? 0).toFixed(2)}%`],
      ["Procured feed", `${Math.floor(Number(t.procuredKg ?? 0)).toLocaleString()} kg`],
      ["Consumed feed", `${Math.floor(Number(t.consumedKg ?? 0)).toLocaleString()} kg`],
    ];
    let x = 48;
    let y = doc.y + 8;
    const w = (doc.page.width - 96) / 3;
    const h = 50;
    cards.forEach((card, i) => {
      doc.rect(x, y, w - 6, h).fill(C.bg).stroke(C.border);
      doc.fillColor(C.mid).fontSize(7).font("Helvetica-Bold").text(card[0], x + 8, y + 8, { width: w - 20 });
      doc.fillColor(C.navy).fontSize(12).font("Helvetica-Bold").text(card[1], x + 8, y + 22, { width: w - 20 });
      x += w;
      if ((i + 1) % 3 === 0) {
        x = 48;
        y += h + 6;
      }
    });
    doc.y = y + h + 8;

    doc.fillColor(C.navy).fontSize(12).font("Helvetica-Bold").text("Risk Mix");
    const rx = 48;
    const ry = doc.y + 6;
    const rw = doc.page.width - 96;
    const rh = 24;
    const total = Math.max(1, Number(t.activeFlocks ?? 1));
    const segments = [
      { key: "healthy", value: Number(risk.healthy ?? 0), color: C.emerald },
      { key: "watch", value: Number(risk.watch ?? 0), color: C.amber },
      { key: "atRisk", value: Number(risk.atRisk ?? 0), color: "#f97316" },
      { key: "critical", value: Number(risk.critical ?? 0), color: C.red },
    ];
    let sx = rx;
    segments.forEach((s) => {
      const sw = (s.value / total) * rw;
      doc.rect(sx, ry, sw, rh).fill(s.color);
      sx += sw;
    });
    doc.rect(rx, ry, rw, rh).stroke(C.border);
    doc.y = ry + rh + 10;
    doc.fillColor(C.mid).fontSize(8).text(`Healthy ${risk.healthy ?? 0}  |  Watch ${risk.watch ?? 0}  |  At-risk ${risk.atRisk ?? 0}  |  Critical ${risk.critical ?? 0}`);
    doc.moveDown(0.6);

    doc.fillColor(C.navy).fontSize(12).font("Helvetica-Bold").text("Flock Table");
    doc.moveDown(0.2);
    doc.fillColor(C.mid).fontSize(8).font("Helvetica-Bold")
      .text("Flock", 48).text("Risk", 190).text("Mortality %", 245).text("Check-ins", 330).text("Feed logs", 400).text("Vet logs", 470);
    rows.slice(0, 45).forEach((r) => {
      const clr = r.riskClass === "critical" ? C.red : r.riskClass === "at_risk" ? "#f97316" : r.riskClass === "watch" ? C.amber : C.emerald;
      doc.fillColor(C.slate).fontSize(8).font("Helvetica")
        .text(String(r.label), 48, undefined, { width: 130 })
        .fillColor(clr).text(String(r.riskClass), 190)
        .fillColor(C.slate).text(Number(r.mortalityRatePct ?? 0).toFixed(2), 245)
        .text(String(Math.floor(Number(r.checkinCount ?? 0))), 330)
        .text(String(Math.floor(Number(r.feedEntryCount ?? 0))), 400)
        .text(String(Math.floor(Number(r.vetLogCount ?? 0))), 470);
    });

    doc.addPage();
    doc.fillColor(C.navy).fontSize(12).font("Helvetica-Bold").text("Farm Insights and Recommendations");
    doc.moveDown(0.3);
    const insights = Array.isArray(payload?.insights) ? payload.insights : [];
    insights.forEach((line) => {
      doc.fillColor(C.slate).fontSize(9).text(`• ${line}`, { width: doc.page.width - 96 });
      doc.moveDown(0.1);
    });

    doc.end();
  });
}
