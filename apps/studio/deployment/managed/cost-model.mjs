import { readFile } from 'node:fs/promises';

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
  'validator-transfer',
  'mail',
  'monitoring',
  'dns-ingress',
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

export function evaluateManagedEstateCost(
  input,
  { requireQualification = false } = {},
) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    fail('root must be an object');
  if (input.monthlyCapUsd !== 100)
    fail('monthlyCapUsd must preserve the authorized $100 cap');
  if (input.freeCreditsUsd !== 0)
    fail(
      'freeCreditsUsd must be zero; credits cannot make the estate affordable',
    );
  if (input.flySingletonCount !== 4)
    fail('flySingletonCount must be exactly four');
  if (input.logicalDatabaseCount !== 4)
    fail('logicalDatabaseCount must be exactly four');
  if (input.postgresSharedBuffersBytes < 1_073_741_824)
    fail('shared_buffers must remain at least 1 GB');
  if (input.postgresAppRoleWorkMemBytes < 268_435_456)
    fail('app-role work_mem must remain at least 256 MB');
  if (input.monitoringRetentionDays < 30)
    fail('logs and metrics require at least 30 days of retention');
  if (input.newRelicPaidUpgradeAllowed !== false)
    fail('New Relic paid upgrades must be disabled');
  if (input.newRelicMonthlyIngestGb > input.newRelicFreeIngestLimitGb)
    fail('New Relic ingest exceeds the explicit free limit');
  if (input.newRelicMonthlyIngestGb * 2 > input.newRelicFreeIngestLimitGb)
    fail('New Relic ingest must preserve at least 2x measured headroom');
  if (input.newRelicHardStopConfigured !== true)
    fail('New Relic requires a tested hard usage stop');

  for (const field of [
    'newRelicMonthlyIngestGb',
    'newRelicFreeIngestLimitGb',
    'primaryIngressGb',
    'primaryObjectStoredGb',
    'primaryObjectClassARequests',
    'primaryObjectClassBRequests',
    'primaryObjectEgressGb',
    'databaseTransferGb',
    'validatorRequestCount',
    'validatorTransferGb',
    'backupStoredGb',
    'backupRequestCount',
    'backupEgressGb',
  ])
    finiteNonNegative(input[field], field);

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
    seen.add(item.category);
    const itemSubtotal =
      finiteNonNegative(item.quantity, `lineItems[${index}].quantity`) *
      finiteNonNegative(item.unitPriceUsd, `lineItems[${index}].unitPriceUsd`);
    subtotals.set(item.category, itemSubtotal);
    subtotalUsd += itemSubtotal;
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
  const withinCap = totalUsd <= input.monthlyCapUsd;
  const qualificationComplete = input.qualificationComplete === true;
  const requiredEvidence = [
    'providerQuotesCurrent',
    'trafficMeasured',
    'capacityQualified',
    'recoveryQualified',
    'retentionQualified',
    'alertDeliveryQualified',
  ];
  if (!input.evidenceGates || typeof input.evidenceGates !== 'object')
    fail('evidenceGates must be an object');
  const evidenceComplete = requiredEvidence.every(
    (name) => input.evidenceGates[name] === true,
  );
  if (requireQualification && !qualificationComplete)
    fail(
      'qualificationComplete must be true after live capacity, recovery, retention, alert, and billing evidence exists',
    );
  if (requireQualification && !evidenceComplete)
    fail('every named live evidence gate must be true');
  if (requireQualification && subtotals.get('reserve') === 0)
    fail('the qualified estimate must price a non-zero recovery reserve');
  if (requireQualification && !withinCap)
    fail(`monthly total $${totalUsd.toFixed(2)} exceeds the $100.00 cap`);
  if (requireQualification && headroomUsd < minimumHeadroomUsd)
    fail(
      `monthly headroom $${headroomUsd.toFixed(2)} is below the explicit minimum`,
    );

  return {
    totalUsd,
    headroomUsd,
    withinCap,
    qualificationComplete,
    evidenceComplete,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2];
  if (!path) fail('usage: node cost-model.mjs <input.json> [--gate]');
  const input = JSON.parse(await readFile(path, 'utf8'));
  const result = evaluateManagedEstateCost(input, {
    requireQualification: process.argv.includes('--gate'),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
