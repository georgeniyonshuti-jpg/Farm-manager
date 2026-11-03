/**
 * Agreement PDF. Uses pdfkit, which the server already uses for farm reports.
 * The stored agreement stays Markdown. This file only decides how it is drawn.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const BANNER_PATH = fileURLToPath(new URL("../../../assets/cleva-letterhead.png", import.meta.url));
const NAVY = "#0E2A47";
const INK = "#1e293b";
const MUTED = "#64748b";
const LINE = "#d6dde8";
const PLACEHOLDERS = new Set([
  "drawn signature, shown on the signature page",
  "selfie, shown on the signature page",
  "added when the company approves",
  "the time recorded on the signature page",
]);

function cleanValue(value) {
  const text = String(value || "").trim();
  if (PLACEHOLDERS.has(text.toLowerCase())) return "";
  return text;
}

function stripMarks(text) {
  return String(text || "").replace(/\*\*/g, "").trim();
}

/** Bold phrases inside one paragraph. Unpaired marks stay as typed. */
export function inlineRuns(text) {
  const runs = [];
  const source = String(text || "");
  const pattern = /\*\*([^*]+)\*\*/g;
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > last) runs.push({ text: source.slice(last, match.index), bold: false });
    runs.push({ text: match[1], bold: true });
    last = match.index + match[0].length;
  }
  if (last < source.length) runs.push({ text: source.slice(last), bold: false });
  return runs.filter((run) => run.text);
}

function startsBlock(line) {
  return /^\([a-z]\)\s/.test(line) || /^\d+\.\d+\s/.test(line);
}

function partyKind(line) {
  const clean = stripMarks(line).replace(/:$/, "").trim();
  if (/^for the seller\b/i.test(clean)) return { kind: "seller", label: clean };
  if (/^for the company\b/i.test(clean)) return { kind: "company", label: clean };
  return null;
}

function emptyParty(label) {
  return { label, name: "", title: "", signedOn: "", approvedOn: "" };
}

/**
 * Turn the agreement Markdown into headings, paragraphs, and signature cards.
 * Signature image lines are left out. The PDF draws those as pictures.
 */
export function layoutAgreement(source) {
  const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let indent = 0;
  let inSignatures = false;
  let party = null;
  const signatures = { seller: null, company: null };

  function flush() {
    if (!paragraph.length) return;
    const text = paragraph.join(" ").replace(/[ \t]+/g, " ").trim();
    const blockIndent = indent;
    paragraph = [];
    indent = 0;
    if (!text) return;
    blocks.push({ type: "paragraph", runs: inlineRuns(text), indent: blockIndent });
  }

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (inSignatures) {
      if (!trimmed) continue;
      const nextParty = partyKind(trimmed);
      if (nextParty) {
        party = emptyParty(nextParty.label);
        signatures[nextParty.kind] = party;
        continue;
      }
      if (!party) continue;
      const field = /^(name|title|signed on|approved on|signature|selfie verification)\s*:\s*(.*)$/i.exec(stripMarks(trimmed));
      if (!field) continue;
      const key = field[1].toLowerCase();
      const value = cleanValue(field[2]);
      if (key === "name") party.name = value;
      else if (key === "title") party.title = value;
      else if (key === "signed on") party.signedOn = value;
      else if (key === "approved on") party.approvedOn = value;
      continue;
    }

    if (!trimmed) {
      flush();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      const text = stripMarks(heading[2]);
      if (/^signatures$/i.test(text)) {
        inSignatures = true;
        continue;
      }
      blocks.push({ type: heading[1].length === 1 ? "title" : "heading", text });
      continue;
    }

    if (startsBlock(trimmed) && paragraph.length) flush();
    if (!paragraph.length) indent = /^\([a-z]\)\s/.test(trimmed) ? 14 : 0;
    paragraph.push(trimmed);
  }
  flush();

  return {
    blocks,
    signatures: signatures.seller || signatures.company ? signatures : null,
  };
}

function contentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function ensureSpace(doc, needed) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed <= bottom) return;
  doc.addPage();
}

function writeRuns(doc, runs, indent) {
  const left = doc.page.margins.left + indent;
  const right = doc.page.width - doc.page.margins.right;
  const lineHeight = 15;
  ensureSpace(doc, lineHeight);
  let x = left;
  let y = doc.y;

  function newLine() {
    x = left;
    y += lineHeight;
    const bottom = doc.page.height - doc.page.margins.bottom;
    if (y + lineHeight > bottom) {
      doc.addPage();
      y = doc.y;
      x = left;
    }
  }

  for (const run of runs) {
    doc.font(run.bold ? "Helvetica-Bold" : "Helvetica").fontSize(11).fillColor(INK);
    for (const part of run.text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        const space = doc.widthOfString(" ");
        if (x > left && x + space <= right) x += space;
        continue;
      }
      const width = doc.widthOfString(part);
      if (x > left && x + width > right) newLine();
      doc.text(part, x, y, { lineBreak: false });
      x += width;
    }
  }
  doc.x = doc.page.margins.left;
  doc.y = y + lineHeight + 7;
}

function writeHeading(doc, text, size, gapBefore) {
  ensureSpace(doc, size + 22);
  doc.y += gapBefore;
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(size).text(text, doc.page.margins.left, doc.y, {
    width: contentWidth(doc),
  });
  doc.moveDown(0.35);
}

function displayWhen(value) {
  const text = cleanValue(value);
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime()) || !/^\d{4}-\d{2}-\d{2}/.test(text)) return text;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kigali",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function cardsFrom(layout, record) {
  const seller = layout.signatures?.seller;
  const company = layout.signatures?.company;
  return [
    {
      label: seller?.label || "For the Seller",
      name: seller?.name || record?.typedName || "",
      role: "",
      image: "signature",
      whenLabel: "Signed on",
      when: displayWhen(seller?.signedOn || record?.signedAt || ""),
    },
    {
      label: company?.label || "For the Company",
      name: company?.name || record?.signerName || "",
      role: company?.title || record?.signerTitle || "",
      image: "company",
      whenLabel: "Approved on",
      when: displayWhen(company?.approvedOn || record?.approvedAt || ""),
    },
  ];
}

function paintImage(doc, bytes, mime, x, y, fit) {
  if (!bytes || !Buffer.isBuffer(bytes) || !bytes.length) return false;
  if (mime && mime !== "image/png" && mime !== "image/jpeg") return false;
  try {
    doc.image(bytes, x, y, { fit });
    return true;
  } catch {
    return false;
  }
}

function drawSignatureCards(doc, layout, images, record) {
  const cards = cardsFrom(layout, record);
  const gap = 14;
  const width = (contentWidth(doc) - gap) / 2;
  const height = 168;
  ensureSpace(doc, height + 8);
  doc.y += 8;
  const top = doc.y;
  const left = doc.page.margins.left;

  cards.forEach((card, index) => {
    const x = left + index * (width + gap);
    doc.roundedRect(x, top, width, height, 6).lineWidth(0.8).strokeColor(LINE).stroke();
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(9).text(card.label, x + 10, top + 10, {
      width: width - 20,
      height: 22,
      ellipsis: true,
    });
    doc.fillColor(MUTED).font("Helvetica").fontSize(8).text("Name", x + 10, top + 36, { lineBreak: false });
    if (card.name) {
      doc.fillColor(INK).font("Helvetica").fontSize(11).text(card.name, x + 10, top + 48, {
        width: width - 20,
        height: 16,
        ellipsis: true,
      });
    } else {
      doc.moveTo(x + 10, top + 60).lineTo(x + width - 10, top + 60).lineWidth(0.6).strokeColor(LINE).stroke();
    }
    if (card.role) {
      doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(card.role, x + 10, top + 66, {
        width: width - 20,
        height: 12,
        ellipsis: true,
      });
    }
    doc.fillColor(MUTED).font("Helvetica").fontSize(8).text("Signature", x + 10, top + 82, { lineBreak: false });
    const bytes = card.image === "signature" ? images.signature : images.companySignature;
    const mime = card.image === "signature" ? images.signatureMime : images.companySignatureMime;
    const imageWidth = card.image === "signature" && images.selfie ? width - 74 : width - 20;
    const drawn = paintImage(doc, bytes, mime, x + 10, top + 94, [imageWidth, 36]);
    if (!drawn) {
      doc.moveTo(x + 10, top + 124).lineTo(x + 10 + imageWidth, top + 124).lineWidth(0.7).strokeColor("#94a3b8").stroke();
    }
    if (card.image === "signature" && images.selfie) {
      const shown = paintImage(doc, images.selfie, images.selfieMime, x + width - 56, top + 90, [42, 42]);
      if (!shown) {
        doc.roundedRect(x + width - 56, top + 90, 42, 42, 4).strokeColor(LINE).stroke();
      }
    }
    const when = card.when ? `${card.whenLabel}: ${card.when}` : card.whenLabel;
    doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(when, x + 10, top + 142, {
      width: width - 20,
      height: 16,
      ellipsis: true,
    });
  });

  doc.x = left;
  doc.y = top + height + 12;
}

function writeRecord(doc, record) {
  if (!record) return;
  const facts = [
    ["Contract number", record.contractNumber],
    ["Phone", record.phone],
    ["IP address", record.ip],
    ["Device", record.userAgent],
    ["Document fingerprint", record.fingerprint],
  ];
  if (record.otpVerified) facts.push(["Phone code checked", "Yes"]);
  const visible = facts.filter(([, value]) => value);
  if (!visible.length) return;
  doc.fillColor(MUTED).font("Helvetica").fontSize(8);
  for (const [label, value] of visible) {
    ensureSpace(doc, 12);
    doc.text(`${label}: ${value}`, doc.page.margins.left, doc.y, { width: contentWidth(doc) });
  }
}

function drawBanner(doc) {
  try {
    const banner = readFileSync(BANNER_PATH);
    const image = doc.openImage(banner);
    const width = doc.page.width;
    const height = width * (image.height / image.width);
    // A fixed y is not "in the flow", so the cursor stays put. Return the real height.
    doc.image(image, 0, 0, { width });
    return height;
  } catch {
    return 0;
  }
}

function drawLaterPageBar(doc) {
  const width = doc.page.width;
  doc.save();
  doc.rect(0, 0, width, 22).fill(NAVY);
  doc.fillColor("#ffffff").font("Helvetica").fontSize(8).text("Cleva Technologies", 48, 7, {
    width: width - 96,
    lineBreak: false,
  });
  doc.restore();
  doc.x = 48;
  doc.y = 48;
}

export function buildContractPdf({
  title = "Agreement",
  header = "",
  footer = "",
  logo = null,
  logoMime = null,
  body = "",
  signature = null,
  signatureMime = null,
  selfie = null,
  selfieMime = null,
  companySignature = null,
  companySignatureMime = null,
  record = null,
}) {
  void logo;
  void logoMime;
  const layout = layoutAgreement(body);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 48, bottom: 52, left: 48, right: 48 },
      info: { Title: title },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.on("pageAdded", () => drawLaterPageBar(doc));

    const bannerBottom = drawBanner(doc);
    doc.x = doc.page.margins.left;
    doc.y = Math.max(bannerBottom + 10, doc.page.margins.top);
    if (header) {
      doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(String(header), {
        width: contentWidth(doc),
      });
      doc.moveDown(0.6);
    }

    for (const block of layout.blocks) {
      if (block.type === "title") writeHeading(doc, block.text, 16, 2);
      else if (block.type === "heading") writeHeading(doc, block.text, 12, 8);
      else writeRuns(doc, block.runs, block.indent || 0);
    }

    drawSignatureCards(doc, layout, {
      signature,
      signatureMime,
      selfie,
      selfieMime,
      companySignature,
      companySignatureMime,
    }, record);
    writeRecord(doc, record);

    if (footer) {
      const footerY = doc.page.height - 36;
      if (doc.y > footerY - 8) doc.addPage();
      doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(String(footer), doc.page.margins.left, Math.max(doc.y + 8, doc.page.height - 36), {
        width: contentWidth(doc),
        height: 20,
        ellipsis: true,
      });
    }

    doc.end();
  });
}
