import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { layoutAgreement } from "./agreementLayout.ts";

const SAMPLE = `# SELLER AGREEMENT

## 1. PARTIES

We act only as an **intermediary**.

2.2 We **do not**:
  (a) slaughter any animals;
  (b) transport the Goods;

## SIGNATURES

**For the Seller:**
Name: Aline Uwase
Signature: drawn signature, shown on the signature page
Selfie verification: selfie, shown on the signature page
Signed on: the time recorded on the signature page

**For the Company (Cleva Technologies):**
Name: George Niyonshuti
Title: Chairperson
Signature: added when the company approves
Approved on: added when the company approves
`;

describe("agreement layout", () => {
  it("turns headings and bold into blocks and keeps signature lines out of the text", () => {
    const layout = layoutAgreement(SAMPLE);
    assert.equal(layout.blocks[0].type, "title");
    assert.equal(layout.blocks[0].type === "title" ? layout.blocks[0].text : "", "SELLER AGREEMENT");
    assert.equal(layout.blocks.some((block) => block.type === "heading" && block.text === "1. PARTIES"), true);
    assert.equal(
      layout.blocks.some((block) => block.type === "paragraph" && block.runs.some((run) => run.bold && run.text === "intermediary")),
      true
    );
    assert.equal(layout.blocks.filter((block) => block.type === "paragraph" && block.indent > 0).length, 2);
    const dumped = JSON.stringify(layout.blocks);
    assert.equal(dumped.includes("**"), false);
    assert.equal(dumped.includes("#"), false);
    assert.equal(dumped.includes("drawn signature"), false);
    assert.equal(layout.signatures?.seller?.name, "Aline Uwase");
    assert.equal(layout.signatures?.seller?.signedOn, "");
    assert.equal(layout.signatures?.company?.title, "Chairperson");
    assert.equal(layout.signatures?.company?.approvedOn, "");
  });
});
