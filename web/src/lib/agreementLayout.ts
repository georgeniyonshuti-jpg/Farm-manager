/**
 * Turns agreement Markdown into headings and paragraphs for the screen.
 * The stored words stay Markdown. Signature image lines are left out.
 */

export type AgreementRun = { text: string; bold: boolean };
export type AgreementBlock =
  | { type: "title"; text: string }
  | { type: "heading"; text: string }
  | { type: "paragraph"; runs: AgreementRun[]; indent: number };

export type AgreementParty = {
  label: string;
  name: string;
  title: string;
  signedOn: string;
  approvedOn: string;
};

const PLACEHOLDERS = new Set([
  "drawn signature, shown on the signature page",
  "selfie, shown on the signature page",
  "added when the company approves",
  "the time recorded on the signature page",
]);

function cleanValue(value: string) {
  const text = String(value || "").trim();
  if (PLACEHOLDERS.has(text.toLowerCase())) return "";
  return text;
}

function stripMarks(text: string) {
  return String(text || "").replace(/\*\*/g, "").trim();
}

export function inlineRuns(text: string): AgreementRun[] {
  const runs: AgreementRun[] = [];
  const source = String(text || "");
  const pattern = /\*\*([^*]+)\*\*/g;
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) runs.push({ text: source.slice(last, index), bold: false });
    runs.push({ text: match[1], bold: true });
    last = index + match[0].length;
  }
  if (last < source.length) runs.push({ text: source.slice(last), bold: false });
  return runs.filter((run) => run.text);
}

function startsBlock(line: string) {
  return /^\([a-z]\)\s/.test(line) || /^\d+\.\d+\s/.test(line);
}

function partyKind(line: string) {
  const clean = stripMarks(line).replace(/:$/, "").trim();
  if (/^for the seller\b/i.test(clean)) return { kind: "seller" as const, label: clean };
  if (/^for the company\b/i.test(clean)) return { kind: "company" as const, label: clean };
  return null;
}

export function layoutAgreement(source: string) {
  const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: AgreementBlock[] = [];
  let paragraph: string[] = [];
  let indent = 0;
  let inSignatures = false;
  let party: AgreementParty | null = null;
  const signatures: { seller: AgreementParty | null; company: AgreementParty | null } = {
    seller: null,
    company: null,
  };

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
        party = { label: nextParty.label, name: "", title: "", signedOn: "", approvedOn: "" };
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
