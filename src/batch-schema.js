export const BATCH_SCHEMA_VERSION = "forge-ops-import/v1";

const ALLOWED_OPERATIONS = new Set([
  "content.stage",
  "images.stage",
  "properties.normalize",
  "fitment.stage"
]);

const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function validateBatchImport(payload, knownSkus = []) {
  const errors = [];
  const warnings = [];
  const items = [];

  if (!isObject(payload)) {
    return {ok: false, errors: [{path: "$", message: "Payload must be an object"}], warnings, items};
  }
  if (payload.schemaVersion !== BATCH_SCHEMA_VERSION) {
    errors.push({path: "$.schemaVersion", message: `Expected ${BATCH_SCHEMA_VERSION}`});
  }
  if (!isObject(payload.run)) {
    errors.push({path: "$.run", message: "run must be an object"});
  } else {
    if (typeof payload.run.name !== "string" || payload.run.name.trim().length < 3) {
      errors.push({path: "$.run.name", message: "A descriptive run name is required"});
    }
    if (payload.run.mode !== "dry-run") {
      errors.push({path: "$.run.mode", message: "Only dry-run imports are accepted before approval"});
    }
  }
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    errors.push({path: "$.items", message: "items must contain at least one record"});
    return {ok: false, errors, warnings, items};
  }
  if (payload.items.length > 50) {
    errors.push({path: "$.items", message: "Maximum import size is 50 records"});
  }

  payload.items.forEach((item, index) => {
    const path = `$.items[${index}]`;
    const itemErrors = [];
    if (!isObject(item)) itemErrors.push("Record must be an object");
    const sku = item?.sku;
    if (typeof sku !== "string" || !/^DEMO-\d{4}$/.test(sku)) itemErrors.push("sku must match DEMO-0000");
    if (!Array.isArray(item?.operations) || item.operations.length === 0) itemErrors.push("operations must contain at least one operation");
    if (Array.isArray(item?.operations)) {
      item.operations.forEach((operation, operationIndex) => {
        if (!isObject(operation) || !ALLOWED_OPERATIONS.has(operation.type)) {
          itemErrors.push(`operations[${operationIndex}].type is not allowlisted`);
        }
        if (operation?.type === "content.stage" && (typeof operation.locale !== "string" || !isObject(operation.fields))) {
          itemErrors.push(`operations[${operationIndex}] content.stage requires locale and fields`);
        }
        if (operation?.type === "images.stage" && typeof operation.selected !== "string") {
          itemErrors.push(`operations[${operationIndex}] images.stage requires selected asset`);
        }
      });
    }
    if (itemErrors.length) {
      itemErrors.forEach(message => errors.push({path, message}));
      items.push({sku: sku || `ROW-${index + 1}`, status: "Blocked", operations: item?.operations?.length || 0, message: itemErrors[0]});
      return;
    }
    if (!knownSkus.includes(sku)) {
      warnings.push({path: `${path}.sku`, message: `${sku} is not in the current demo queue`});
      items.push({sku, status: "Review", operations: item.operations.length, message: "Unknown SKU — retained for review, not loaded"});
      return;
    }
    items.push({sku, status: "Valid", operations: item.operations.length, message: "Schema and queue checks passed", record: item});
  });

  return {ok: errors.length === 0, errors, warnings, items};
}

export const sampleImports = {
  ready: {
    schemaVersion: BATCH_SCHEMA_VERSION,
    run: {name: "Filter content and asset preparation", mode: "dry-run"},
    items: [
      {sku: "DEMO-1846", operations: [
        {type: "content.stage", locale: "EN", fields: {title: "Apex Performance Oil Filter", description: "Synthetic replacement filter draft for review."}},
        {type: "content.stage", locale: "DE", fields: {title: "Apex Performance Ölfilter", description: "Synthetischer Produktentwurf zur Prüfung."}},
        {type: "content.stage", locale: "FR", fields: {title: "Filtre à huile Apex Performance", description: "Brouillon synthétique à vérifier."}},
        {type: "content.stage", locale: "IT", fields: {title: "Filtro olio Apex Performance", description: "Bozza sintetica da verificare."}},
        {type: "content.stage", locale: "ES", fields: {title: "Filtro de aceite Apex Performance", description: "Borrador sintético para revisar."}},
        {type: "content.stage", locale: "GR", fields: {title: "Φίλτρο λαδιού Apex Performance", description: "Συνθετικό προσχέδιο προς έλεγχο."}},
        {type: "images.stage", selected: "MAIN"}
      ]},
      {sku: "DEMO-2207", operations: [{type: "properties.normalize"}, {type: "fitment.stage"}]}
    ]
  },
  mixed: {
    schemaVersion: BATCH_SCHEMA_VERSION,
    run: {name: "Review import edge cases", mode: "dry-run"},
    items: [
      {sku: "DEMO-1846", operations: [{type: "images.stage", selected: "MAIN"}]},
      {sku: "DEMO-9999", operations: [{type: "content.stage", locale: "EN", fields: {title: "Unknown product"}}]},
      {sku: "INVALID", operations: [{type: "write.everything"}]}
    ]
  }
};
