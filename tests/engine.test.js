import test from "node:test";
import assert from "node:assert/strict";
import {
  applyOperations,
  inspectProduct,
  proposeChanges,
  validateProposal,
  executeApproved
} from "../src/engine.js";

const product = {
  sku: "DEMO-1042",
  brand: "Northwind",
  title: "NW filter 1042",
  category: null,
  attributes: {material: "cotton", reusable: true},
  description: null,
  image: true,
  marketplaceReady: false
};

test("detects incomplete product", () => {
  const status = inspectProduct(product);
  assert.ok(status.missing.includes("category"));
  assert.ok(status.missing.includes("description"));
});

test("builds a structured proposal", () => {
  const proposal = proposeChanges(product);
  assert.equal(proposal.status, "proposal");
  assert.ok(proposal.operations.some(op => op.field === "category"));
  assert.ok(proposal.operations.every(op => "reason" in op));
});

test("uses product evidence instead of a hard-coded filter type", () => {
  const oilFilter = {
    ...product,
    title: "Performance Oil Filter",
    attributes: {material: "synthetic", reusable: true}
  };
  const proposal = proposeChanges(oilFilter);
  const category = proposal.operations.find(op => op.field === "category");
  const description = proposal.operations.find(op => op.field === "description");
  assert.match(category.value, /Oil Filters/);
  assert.match(description.value, /oil filter with synthetic media/);
  assert.doesNotMatch(description.value, /cotton air filter/);
});

test("blocks execution without human approval", () => {
  const result = executeApproved(product, proposeChanges(product), false);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "HUMAN_APPROVAL_REQUIRED");
});

test("blocks unsafe proposal fields", () => {
  const unsafe = {
    status: "proposal",
    operations: [{field: "price", value: 1, reason: "Not allowed"}]
  };
  const result = validateProposal(product, unsafe);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /not allowed/);
});

test("blocks duplicate writes to the same field", () => {
  const duplicate = {
    status: "proposal",
    operations: [
      {field: "title", value: "One valid title", reason: "A"},
      {field: "title", value: "Another valid title", reason: "B"}
    ]
  };
  const result = validateProposal(product, duplicate);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /Duplicate/);
});

test("does not allow ready=true while required checks are missing", () => {
  const incomplete = {...product, image: false};
  const proposal = proposeChanges(incomplete);
  const result = validateProposal(incomplete, proposal);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /cannot be marked ready/);
});

test("approved valid proposal is executed and verified", () => {
  const result = executeApproved(product, proposeChanges(product), true);
  assert.equal(result.ok, true);
  assert.equal(result.audit.verification, "PASS");
  assert.equal(inspectProduct(result.product).complete, inspectProduct(result.product).total);
});

test("post-write verification catches a mismatched write", () => {
  const faultyWrite = (input, operations) => {
    const written = applyOperations(input, operations);
    return {...written, title: "Unexpected external mutation"};
  };
  const result = executeApproved(product, proposeChanges(product), true, faultyWrite);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "POST_WRITE_VERIFICATION_FAILED");
  assert.equal(result.audit.verification, "FAIL");
});

test("ambiguous input is stopped instead of guessed", () => {
  const ambiguous = {...product, conflict: "Not enough evidence"};
  const proposal = proposeChanges(ambiguous);
  assert.equal(proposal.status, "blocked");
  assert.equal(proposal.operations.length, 0);
});
