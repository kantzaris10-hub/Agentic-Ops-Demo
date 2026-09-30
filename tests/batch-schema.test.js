import test from "node:test";
import assert from "node:assert/strict";
import {BATCH_SCHEMA_VERSION, sampleImports, validateBatchImport} from "../src/batch-schema.js";

const skus = ["DEMO-1846", "DEMO-2207"];

test("accepts a versioned dry-run import with allowlisted operations", () => {
  const result = validateBatchImport(sampleImports.ready, skus);
  assert.equal(result.ok, true);
  assert.deepEqual(result.items.map(item => item.status), ["Valid", "Valid"]);
});

test("reports blocked and review rows without loading them as valid queue items", () => {
  const result = validateBatchImport(sampleImports.mixed, skus);
  assert.equal(result.ok, false);
  assert.deepEqual(result.items.map(item => item.status), ["Valid", "Review", "Blocked"]);
  assert.match(result.errors[0].path, /items\[2\]/);
});

test("rejects a non-dry-run mode and schema mismatch", () => {
  const result = validateBatchImport({schemaVersion: "wrong", run: {name: "x", mode: "execute"}, items: []}, skus);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.path === "$.schemaVersion"));
  assert.ok(result.errors.some(error => error.path === "$.run.mode"));
});
