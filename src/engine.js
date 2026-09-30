export const REQUIRED = [
  "title",
  "category",
  "description",
  "image",
  "material",
  "reusable",
  "marketplaceReady"
];

const ALLOWED_WRITE_FIELDS = new Set([
  "title",
  "category",
  "description",
  "marketplaceReady"
]);

export function inspectProduct(product) {
  const checks = {
    title: Boolean(product.title && product.title.length >= 8),
    category: Boolean(product.category),
    description: Boolean(product.description && product.description.length >= 30),
    image: Boolean(product.image),
    material: Boolean(product.attributes?.material),
    reusable: typeof product.attributes?.reusable === "boolean",
    marketplaceReady: Boolean(product.marketplaceReady)
  };

  return {
    checks,
    complete: Object.values(checks).filter(Boolean).length,
    total: REQUIRED.length,
    missing: Object.entries(checks)
      .filter(([, ok]) => !ok)
      .map(([key]) => key)
  };
}

export function proposeChanges(product) {
  if (product.conflict) {
    return {
      status: "blocked",
      reason: product.conflict,
      operations: []
    };
  }

  const operations = [];
  const type = /oil/i.test(product.title)
    ? "Oil Filter"
    : /cabin/i.test(product.title)
      ? "Cabin Filter"
      : /fuel/i.test(product.title)
        ? "Fuel Filter"
        : /hydraulic/i.test(product.title)
          ? "Hydraulic Filter"
          : "Air Filter";
  const material = product.attributes?.material || "filter media";

  if (!product.category) {
    operations.push({
      field: "category",
      value: `Vehicle Parts > Filters > ${type}s`,
      reason: `Synthetic taxonomy rule: ${type.toLowerCase()} evidence`
    });
  }

  if (!product.description) {
    operations.push({
      field: "description",
      value: `${product.brand} ${type.toLowerCase()} with ${material} media, prepared for a structured replacement and maintenance workflow.`,
      reason: "Structured content template"
    });
  }

  if (!product.title || product.title.length < 16) {
    operations.push({
      field: "title",
      value: `${product.brand} ${type} ${product.sku}`,
      reason: "Normalized title rule"
    });
  }

  operations.push({
    field: "marketplaceReady",
    value: true,
    reason: "All required publish checks pass after the proposed changes"
  });

  return {status: "proposal", operations};
}

export function validateProposal(product, proposal) {
  if (proposal.status !== "proposal") {
    return {ok: false, errors: [proposal.reason || "No executable proposal"]};
  }

  const errors = [];
  const seenFields = new Set();

  for (const op of proposal.operations) {
    if (!ALLOWED_WRITE_FIELDS.has(op.field)) {
      errors.push(`Write to ${op.field} is not allowed`);
    }

    if (seenFields.has(op.field)) {
      errors.push(`Duplicate write operation for ${op.field}`);
    }
    seenFields.add(op.field);

    if (op.value === null || op.value === undefined || op.value === "") {
      errors.push(`${op.field} cannot be empty`);
    }
  }

  if (proposal.operations.some(op => op.field === "marketplaceReady" && op.value === true)) {
    const projected = applyOperations(
      product,
      proposal.operations.filter(op => op.field !== "marketplaceReady")
    );
    const projectedStatus = inspectProduct({...projected, marketplaceReady: true});

    if (projectedStatus.complete !== projectedStatus.total) {
      errors.push("Product cannot be marked ready while required checks are missing");
    }
  }

  return {ok: errors.length === 0, errors};
}

export function applyOperations(product, operations) {
  const next = structuredClone(product);

  for (const op of operations) {
    if (op.field === "title") next.title = op.value;
    else if (op.field === "category") next.category = op.value;
    else if (op.field === "description") next.description = op.value;
    else if (op.field === "marketplaceReady") next.marketplaceReady = op.value;
  }

  return next;
}

export function executeApproved(
  product,
  proposal,
  approved,
  writeFn = applyOperations
) {
  if (!approved) {
    return {ok: false, reason: "HUMAN_APPROVAL_REQUIRED", product};
  }

  const validation = validateProposal(product, proposal);
  if (!validation.ok) {
    return {
      ok: false,
      reason: "VALIDATION_FAILED",
      errors: validation.errors,
      product
    };
  }

  const expected = applyOperations(product, proposal.operations);
  const written = writeFn(product, proposal.operations);
  const verified = JSON.stringify(written) === JSON.stringify(expected);

  return {
    ok: verified,
    reason: verified ? "VERIFIED" : "POST_WRITE_VERIFICATION_FAILED",
    product: written,
    audit: {
      approved: true,
      operationCount: proposal.operations.length,
      fields: proposal.operations.map(op => op.field),
      verification: verified ? "PASS" : "FAIL"
    }
  };
}
