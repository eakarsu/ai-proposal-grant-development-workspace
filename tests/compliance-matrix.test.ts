import test from "node:test";
import assert from "node:assert/strict";
import { validateDraft } from "../src/lib/grants/ai";

const sources = [{
  id: "solicitation-1", title: "Funder notice", contentHash: "hash",
  actorId: "uploader", approvedBy: "reviewer", approvedAt: new Date(),
  chunks: [{ id: "paragraph-1", label: "Paragraph 1", text: "Applicants must submit an audited financial statement by November 1." }],
}] as never;
const citation = { sourceId: "solicitation-1", chunkId: "paragraph-1", quote: "submit an audited financial statement" };
const output = {
  title: "Compliance candidates", content: "One obligation appears in the approved source.",
  citations: [citation], issues: [], limitations: ["Reviewer must confirm applicability."],
  requirements: [{ text: "Submit an audited financial statement by November 1.", citations: [citation] }],
};

test("matrix candidates require exact cited passages from approved sources", () => {
  assert.equal(validateDraft(output, sources, 0, "COMPLIANCE_MATRIX").requirements?.length, 1);
  assert.throws(() => validateDraft({ ...output, requirements: [{ ...output.requirements[0], citations: [{ ...citation, quote: "invented deadline for applicant" }] }] }, sources, 0, "COMPLIANCE_MATRIX"), /citation/);
  assert.throws(() => validateDraft({ ...output, requirements: [] }, sources, 0, "COMPLIANCE_MATRIX"), /requirement/i);
});

test("a section draft cannot smuggle requirements into the proposal", () => {
  assert.throws(() => validateDraft(output, sources, 0, "DRAFT_SECTION"), /Only compliance matrix/);
});
