import { readFile } from 'node:fs/promises';

const sizing = JSON.parse(
  await readFile(new URL('./candidate-sizing.json', import.meta.url), 'utf8'),
);

const REQUIRED_CATEGORIES = new Set([
  'compute',
  'database-plan',
  'database-storage',
  'database-transfer',
  'primary-object-storage',
  'primary-object-class-a',
  'primary-object-class-b',
  'primary-object-egress',
  'kms-keys',
  'kms-requests',
  'backup-storage',
  'backup-requests',
  'backup-egress',
  'validator-compute',
  'validator-requests',
  'validator-transfer',
  'mail',
  'monitoring',
  'dns',
  'primary-ingress',
  'reserve',
]);

function fail(message) {
  throw new Error(`managed estate cost input: ${message}`);
}

function finiteNonNegative(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail(`${path} must be a finite non-negative number`);
  }
  return value;
}

function verifyPricingDeclaration(item, now) {
  const quote = item.pricing;
  if (
    !quote ||
    typeof quote !== 'object' ||
    Array.isArray(quote) ||
    quote.currency !== 'USD' ||
    quote.unitPriceUsd !== item.unitPriceUsd ||
    quote.quantity !== item.quantity ||
    typeof quote.reviewedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(quote.reviewedAt) ||
    /placeholder|illustrative|unverified|pending|requiring.*quote/i.test(
      item.evidence,
    )
  )
    fail(
      `category ${item.category} requires a current pricing declaration, not a placeholder`,
    );
  const reviewed = Date.parse(quote.reviewedAt + 'T00:00:00.000Z');
  if (
    !Number.isFinite(reviewed) ||
    new Date(reviewed).toISOString().slice(0, 10) !== quote.reviewedAt ||
    reviewed > now ||
    now - reviewed > 30 * 86_400_000
  )
    fail(
      `category ${item.category} pricing review must be within the preceding 30 days`,
    );
  if (item.category === 'reserve') {
    if (quote.kind !== 'operator-reserve')
      fail('reserve requires an operator allocation');
    return;
  }
  let source;
  try {
    source = new URL(quote.sourceUrl);
  } catch {
    fail(`category ${item.category} requires a provider pricing source URL`);
  }
  if (
    source.protocol !== 'https:' ||
    source.username ||
    source.password ||
    source.hash
  )
    fail(
      `category ${item.category} requires an HTTPS provider pricing source without credentials`,
    );
  if (item.unitPriceUsd === 0) {
    if (
      quote.kind !== 'included' ||
      finiteNonNegative(
        quote.coveredQuantity,
        `category ${item.category} coveredQuantity`,
      ) < item.quantity ||
      typeof quote.coverage !== 'string' ||
      !quote.coverage.trim() ||
      /placeholder|illustrative|unverified|pending/i.test(quote.coverage)
    )
      fail(
        `category ${item.category} requires explicit included-price coverage for its complete quantity`,
      );
  } else if (quote.kind !== 'rate')
    fail(`category ${item.category} requires a quoted recurring rate`);
}

export function evaluateManagedEstateCost(
  input,
  {
    requireBudget = false,
    requireQualification = false,
    now = Date.now(),
  } = {},
) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    fail('root must be an object');
  if (requireQualification)
    fail(
      'a cost estimate cannot qualify deployment; independent authenticated operational evidence is required',
    );
  if (input.monthlyCapUsd !== 100)
    fail('monthlyCapUsd must preserve the authorized $100 cap');
  if (input.freeCreditsUsd !== 0)
    fail(
      'freeCreditsUsd must be zero; credits cannot make the estate affordable',
    );
  if (input.flySingletonCount !== 4)
    fail('flySingletonCount must be exactly four');
  const resources = input.flyServiceResources;
  if (
    !resources ||
    typeof resources !== 'object' ||
    Array.isArray(resources) ||
    Object.keys(resources).length !== Object.keys(sizing.services).length ||
    !Object.entries(sizing.services).every(
      ([name, expected]) =>
        resources[name]?.cpu_kind === expected.cpu_kind &&
        resources[name]?.cpus === expected.cpus &&
        resources[name]?.memory_mb === expected.memory_mb,
    )
  )
    fail(
      'flyServiceResources must match candidate-sizing.json; changed sizes require a reviewed sizing and cost change',
    );
  if (input.flyMonthlyHours !== sizing.monthlyHours)
    fail('flyMonthlyHours must price all 744 hours of a 31-day month');
  if (input.logicalDatabaseCount !== 4)
    fail('logicalDatabaseCount must be exactly four');
  for (const field of [
    'postgresSharedBuffersBytes',
    'postgresAppRoleWorkMemBytes',
    'monitoringRetentionDays',
  ])
    finiteNonNegative(input[field], field);
  if (input.postgresSharedBuffersBytes < 1_073_741_824)
    fail('shared_buffers must remain at least 1 GB');
  if (input.postgresAppRoleWorkMemBytes < 268_435_456)
    fail('app-role work_mem must remain at least 256 MB');
  if (input.monitoringRetentionDays < 30)
    fail('logs and metrics require at least 30 days of retention');
  if (input.newRelicPaidUpgradeAllowed !== false)
    fail('New Relic paid upgrades must be disabled');
  if (input.newRelicFreeIngestLimitGb !== 100)
    fail(
      'New Relic Free includes 100 GB per month; a larger allowance requires a new reviewed cost model',
    );
  if (input.newRelicMonthlyIngestGb > input.newRelicFreeIngestLimitGb)
    fail('New Relic ingest exceeds the explicit free limit');
  if (input.newRelicMonthlyIngestGb * 2 > input.newRelicFreeIngestLimitGb)
    fail('New Relic ingest must preserve at least 2x measured headroom');
  if (input.newRelicHardStopConfigured !== true)
    fail('New Relic requires a tested hard usage stop');

  for (const field of [
    'newRelicMonthlyIngestGb',
    'newRelicFreeIngestLimitGb',
    'postgresStorageGb',
    'kmsBillableKeyVersions',
    'kmsRequestCount',
    'primaryIngressGb',
    'primaryObjectStoredGb',
    'primaryObjectClassARequests',
    'primaryObjectClassBRequests',
    'primaryObjectEgressGb',
    'databaseTransferGb',
    'validatorRequestCount',
    'validatorRunCount',
    'validatorMemoryGb',
    'validatorDurationSeconds',
    'validatorTransferGb',
    'backupStoredGb',
    'backupRequestCount',
    'backupEgressGb',
  ])
    finiteNonNegative(input[field], field);

  if (input.validatorMemoryGb === 0 || input.validatorDurationSeconds === 0)
    fail('validator memory and duration must be positive');

  const dumpSizes = input.databaseDumpSizesGb;
  const databaseNames = Object.keys(sizing.services);
  if (
    !dumpSizes ||
    typeof dumpSizes !== 'object' ||
    Array.isArray(dumpSizes) ||
    Object.keys(dumpSizes).length !== databaseNames.length ||
    !databaseNames.every((name) => Object.hasOwn(dumpSizes, name))
  )
    fail('databaseDumpSizesGb must measure all four logical databases');
  let dumpTotalGb = 0;
  for (const name of databaseNames) {
    const size = finiteNonNegative(
      dumpSizes[name],
      `databaseDumpSizesGb.${name}`,
    );
    if (size === 0)
      fail('every logical database requires a positive measured dump size');
    dumpTotalGb += size;
  }
  const monthlyPoints =
    (sizing.monthlyHours * 60) / sizing.recovery.backupIntervalMinutes;
  const requiredValidations = monthlyPoints * databaseNames.length;
  if (
    !Number.isSafeInteger(input.validatorRunCount) ||
    input.validatorRunCount < requiredValidations
  )
    fail(
      `validatorRunCount must cover at least ${requiredValidations} scheduled database validations`,
    );
  const recoveryMinimums = {
    backupRequestCount: requiredValidations * sizing.recovery.requestsPerBackup,
    validatorRequestCount:
      input.validatorRunCount * sizing.recovery.requestsPerValidation,
    // Every immutable archive remains locked for 31 days, including frequent
    // points older than the seven-day operational retention target.
    backupStoredGb:
      ((sizing.recovery.retentionDays * 24 * 60) /
        sizing.recovery.backupIntervalMinutes) *
        dumpTotalGb +
      input.primaryObjectStoredGb,
    backupEgressGb: monthlyPoints * dumpTotalGb,
    validatorTransferGb: monthlyPoints * dumpTotalGb,
  };
  for (const [field, minimum] of Object.entries(recoveryMinimums)) {
    finiteNonNegative(minimum, `minimum ${field}`);
    if (input[field] < minimum)
      fail(
        `${field} is below the required recovery cadence and measured dump sizes`,
      );
  }

  if (
    input.postgresStorageGb !== sizing.postgres.storageGb ||
    input.postgresPlanId !== sizing.postgres.planId
  )
    fail('PostgreSQL storage and plan must match candidate-sizing.json');
  if (input.kmsBillableKeyVersions < 6)
    fail(
      'kmsBillableKeyVersions must price both keys and two annual rotations',
    );

  // Bind the quote's billing units to the declared estate and measured usage.
  // Keeping an independent editable quantity would let a four-service estate
  // claim zero compute cost or price only a fraction of its recovery traffic.
  const quantities = {
    'compute': input.flySingletonCount * input.flyMonthlyHours,
    'database-plan': 1,
    'database-storage': input.postgresStorageGb,
    'database-transfer': input.databaseTransferGb,
    'primary-object-storage': input.primaryObjectStoredGb,
    'primary-object-class-a': input.primaryObjectClassARequests / 1_000_000,
    'primary-object-class-b': input.primaryObjectClassBRequests / 1_000_000,
    'primary-object-egress': input.primaryObjectEgressGb,
    'kms-keys': input.kmsBillableKeyVersions,
    'kms-requests': input.kmsRequestCount,
    'backup-storage': input.backupStoredGb / 1_000,
    'backup-requests': input.backupRequestCount,
    'backup-egress': input.backupEgressGb,
    'validator-compute':
      input.validatorRunCount *
      input.validatorMemoryGb *
      input.validatorDurationSeconds,
    'validator-requests': input.validatorRequestCount,
    'validator-transfer': input.validatorTransferGb,
    'mail': 1,
    'monitoring': 1,
    'dns': 1,
    'primary-ingress': input.primaryIngressGb,
    'reserve': 1,
  };

  if (!Array.isArray(input.lineItems) || input.lineItems.length === 0)
    fail('lineItems must be a non-empty array');
  const seen = new Set();
  const subtotals = new Map();
  let subtotalUsd = 0;
  for (const [index, item] of input.lineItems.entries()) {
    if (!item || typeof item !== 'object')
      fail(`lineItems[${index}] must be an object`);
    if (!REQUIRED_CATEGORIES.has(item.category))
      fail(`lineItems[${index}].category is unsupported`);
    if (seen.has(item.category))
      fail(
        `category ${item.category} must have exactly one explicit line item`,
      );
    if (item.quantity !== quantities[item.category])
      fail(
        `category ${item.category} quantity does not match its declared estate/usage`,
      );
    if (typeof item.evidence !== 'string' || !item.evidence.trim())
      fail(`category ${item.category} requires explicit price evidence`);
    seen.add(item.category);
    const itemSubtotal =
      finiteNonNegative(item.quantity, `lineItems[${index}].quantity`) *
      finiteNonNegative(item.unitPriceUsd, `lineItems[${index}].unitPriceUsd`);
    subtotals.set(item.category, itemSubtotal);
    subtotalUsd += itemSubtotal;
    finiteNonNegative(subtotalUsd, 'total');
  }
  const missing = [...REQUIRED_CATEGORIES].filter(
    (category) => !seen.has(category),
  );
  if (missing.length > 0) fail(`missing categories: ${missing.join(', ')}`);

  const totalUsd = Math.round(subtotalUsd * 100) / 100;
  const headroomUsd = Math.round((input.monthlyCapUsd - totalUsd) * 100) / 100;
  const minimumHeadroomUsd = finiteNonNegative(
    input.minimumHeadroomUsd,
    'minimumHeadroomUsd',
  );
  const withinCap = subtotalUsd <= input.monthlyCapUsd;
  if (requireBudget && subtotals.get('reserve') === 0)
    fail('the budget check must price a non-zero recovery reserve');
  if (requireBudget && !withinCap)
    fail(`monthly total $${totalUsd.toFixed(2)} exceeds the $100.00 cap`);
  if (requireBudget && input.monthlyCapUsd - subtotalUsd < minimumHeadroomUsd)
    fail(
      `monthly headroom $${headroomUsd.toFixed(2)} is below the explicit minimum`,
    );
  if (requireBudget) {
    if (!Number.isFinite(now)) fail('pricing review time is invalid');
    for (const item of input.lineItems) verifyPricingDeclaration(item, now);
  }

  return {
    totalUsd,
    headroomUsd,
    withinCap,
    qualificationComplete: false,
    budgetAccepted: requireBudget,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2];
  if (!path) fail('usage: node cost-model.mjs <input.json> [--budget]');
  if (
    process.argv.slice(3).some((arg) => arg !== '--budget' && arg !== '--gate')
  )
    fail('unsupported option');
  const input = JSON.parse(await readFile(path, 'utf8'));
  const result = evaluateManagedEstateCost(input, {
    requireBudget: process.argv.includes('--budget'),
    requireQualification: process.argv.includes('--gate'),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
