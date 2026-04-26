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
};

function text(doc, t, yPad = 0.2) {
  doc.fillColor(C.slate).fontSize(9).text(t, { width: doc.page.width - 96 });
  doc.moveDown(yPad);
}

function money(v) {
  if (!Number.isFinite(Number(v))) return "—";
  return `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function buildFlockDeepDivePdfBuffer(payload) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: "Flock deep-dive report" } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const k = payload?.kpis ?? {};
    const title = payload?.meta?.flockLabel ?? "Flock";

    doc.rect(0, 0, doc.page.width, 140).fill(C.navy);
    doc.fillColor("#fff").fontSize(22).font("Helvetica-Bold").text("Flock Deep Dive", 48, 34);
    doc.fontSize(12).font("Helvetica").text(title, 48, 68);
    doc.fontSize(8).fillColor("#cbd5e1").text(`Generated ${new Date(payload?.meta?.generatedAt ?? Date.now()).toLocaleString()}`, 48, 92);

    doc.y = 160;
    doc.fillColor(C.navy).fontSize(12).font("Helvetica-Bold").text("Executive Snapshot");
    doc.moveDown(0.4);
    const cards = [
      ["Age (days)", `${Math.floor(Number(k.ageDays ?? 0))}`],
      ["Live birds", `${Math.floor(Number(k.liveBirds ?? 0)).toLocaleString()}`],
      ["Mortality", `${Math.floor(Number(k.mortalityTotal ?? 0)).toLocaleString()} (${Number(k.mortalityRatePct ?? 0).toFixed(2)}%)`],
      ["Feed-to-date", `${money(k.feedToDateKg)} kg`],
      ["FCR", Number.isFinite(Number(k.fcr)) ? Number(k.fcr).toFixed(2) : "—"],
      ["Vet logs", `${Math.floor(Number(k.vetLogCount ?? 0)).toLocaleString()}`],
    ];
    let x = 48;
    let y = doc.y;
    const w = (doc.page.width - 96) / 3;
    const h = 52;
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
    doc.y = y + h + 6;

    doc.fillColor(C.navy).fontSize(12).font("Helvetica-Bold").text("Trend and Operations");
    doc.moveDown(0.4);
    const timeline = Array.isArray(payload?.timeline) ? payload.timeline.slice(-20) : [];
    if (timeline.length > 0) {
      const chartX = 48;
      const chartY = doc.y;
      const chartW = doc.page.width - 96;
      const chartH = 140;
      doc.rect(chartX, chartY, chartW, chartH).fill(C.bg).stroke(C.border);
      const vals = timeline.map((r) => Number(r.cumulativeMortalityPct ?? 0));
      const maxV = Math.max(1, ...vals);
      doc.strokeColor(C.amber).lineWidth(1.5);
      vals.forEach((v, i) => {
        const px = chartX + 6 + (i / Math.max(1, vals.length - 1)) * (chartW - 12);
        const py = chartY + chartH - 8 - (v / maxV) * (chartH - 20);
        if (i === 0) doc.moveTo(px, py);
        else doc.lineTo(px, py);
      });
      doc.stroke();
      doc.fillColor(C.mid).fontSize(8).text("Cumulative mortality trend (%)", chartX + 8, chartY + 6);
      doc.y = chartY + chartH + 8;
    } else {
      text(doc, "No timeline points were available for the selected date range.");
    }

    doc.fillColor(C.navy).fontSize(12).font("Helvetica-Bold").text("Narrative Insights");
    doc.moveDown(0.2);
    const insights = Array.isArray(payload?.insights) ? payload.insights : [];
    insights.forEach((line) => {
      const color = /immediate|elevated|risk/i.test(line) ? C.red : /recommended|controlled|stable/i.test(line) ? C.emerald : C.slate;
      doc.fillColor(color).fontSize(9).text(`• ${line}`, { width: doc.page.width - 96 });
      doc.moveDown(0.1);
    });

    doc.addPage();
    doc.fillColor(C.navy).fontSize(12).font("Helvetica-Bold").text("Detailed Tables");
    doc.moveDown(0.3);
    const tableRows = payload?.tables?.mortalityEvents ?? [];
    if (tableRows.length === 0) {
      text(doc, "No mortality rows in selected period.");
    } else {
      doc.fillColor(C.mid).fontSize(8).font("Helvetica-Bold").text("Date", 48).text("Count", 210).text("Emergency", 280).text("Notes", 360, undefined, { width: 180 });
      doc.moveDown(0.2);
      tableRows.slice(0, 40).forEach((r) => {
        doc.fillColor(C.slate).fontSize(8).font("Helvetica")
          .text(String(r.at ?? "").slice(0, 10), 48)
          .text(String(Math.floor(Number(r.count ?? 0))), 210)
          .text(r.isEmergency ? "Yes" : "No", 280)
          .text(String(r.notes ?? "—").slice(0, 60), 360, undefined, { width: 180 });
      });
    }

    doc.end();
  });
}
