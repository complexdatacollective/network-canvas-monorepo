import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { evaluateManagedEstateCost } from './cost-model.mjs';

const fixture = JSON.parse(
  await readFile(new URL('./cost-input.example.json', import.meta.url), 'utf8'),
);

// Synthetic declarations exercise the budget schema; these are not provider
// quotes and must never be used to provision an estate.
const reviewTime = Date.parse('2026-09-08T12:00:00.000Z');
function declaredBudget() {
  const input = structuredClone(fixture);
  input.postmarkPlanRef = 'synthetic-mail-plan';
  input.workerTierId = 'synthetic-worker-tier';
  input.minimumHeadroomUsd = 1;
  input.lineItems.find(({ category }) => category === 'reserve').unitPriceUsd =
    0.5;
  for (const item of input.lineItems) {
    const sourceProvider = Object.entries({
      'independent-drill-database': 'backblaze-b2',
      'independent-drill-object': 'backblaze-b2',
      'pitr-drill-database': 'crunchybridge',
      'pitr-drill-object': 'cloudflare-r2',
    }).find(([prefix]) => item.category.startsWith(`${prefix}-source-`))?.[1];
    const monitoringProvider =
      item.category === 'monitoring'
        ? 'new-relic'
        : item.category.startsWith('monitoring-collector-')
          ? 'fly'
          : item.category.startsWith('monitoring-anchor-')
            ? 'aws'
            : undefined;
    item.evidence = 'Synthetic regression fixture only';
    item.pricing = {
      kind:
        item.category === 'reserve'
          ? 'operator-reserve'
          : item.unitPriceUsd === 0
            ? 'included'
            : 'rate',
      currency: 'USD',
      quantity: item.quantity,
      unitPriceUsd: item.unitPriceUsd,
      reviewedAt: '2026-09-08',
      sourceUrl: 'https://example.invalid/synthetic-pricing',
      ...(['mail', 'mail-overage'].includes(item.category)
        ? {
            planRef: input.postmarkPlanRef,
            includedQuantity: input.postmarkIncludedMessages,
          }
        : {}),
      ...(item.category.startsWith('primary-ingress')
        ? { tierId: input.workerTierId }
        : {}),
      providerId: sourceProvider ?? monitoringProvider ?? 'synthetic-provider',
      ...(monitoringProvider ? { providerId: monitoringProvider } : {}),
      ...(item.category.startsWith('monitoring-collector-')
        ? { region: input.monitoringCollectorRegion }
        : {}),
      ...(item.category.startsWith('monitoring-anchor-')
        ? { region: input.monitoringAnchorRegion }
        : {}),
      ...(item.category === 'monitoring-collector-compute'
        ? {
            cpuKind: input.monitoringCollectorCpuKind,
            cpus: input.monitoringCollectorCpus,
            memoryMb: input.monitoringCollectorMemoryMb,
          }
        : {}),
      ...(item.unitPriceUsd === 0
        ? {
            coveredQuantity: 1_000_000_000,
            coverage: 'Synthetic included allowance',
            allowance: {
              billingScopeId: 'synthetic-billing-scope',
              productId: 'synthetic-product',
              allowanceId: item.category,
              unit: 'synthetic-units',
              period: 'month',
              limitQuantity: 1_000_000_000,
            },
          }
        : {}),
    };
  }
  return input;
}
const budgetOptions = { requireBudget: true, now: reviewTime };

test('reports the illustrative estimate without qualifying it', () => {
  const result = evaluateManagedEstateCost(fixture);
  assert.equal(result.qualificationComplete, false);
  assert.equal(result.withinCap, true);
  assert.ok(result.totalUsd > 0);
});

test('refuses to turn an incomplete estimate into a release gate', () => {
  assert.throws(
    () => evaluateManagedEstateCost(fixture, { requireQualification: true }),
    /cannot qualify/,
  );
});

test('refuses omitted request pricing even when the total would look cheaper', () => {
  const mutated = structuredClone(fixture);
  mutated.lineItems = mutated.lineItems.filter(
    ({ category }) => category !== 'primary-object-class-b',
  );
  assert.throws(
    () => evaluateManagedEstateCost(mutated),
    /missing categories: primary-object-class-b/,
  );
});

test('refuses free credits, paid monitoring fallback, and weakened PostgreSQL memory', () => {
  for (const [field, value, message] of [
    ['freeCreditsUsd', 5, /credits cannot make/],
    ['newRelicPaidUpgradeAllowed', true, /paid upgrades must be disabled/],
    ['postgresSharedBuffersBytes', 1_073_741_823, /shared_buffers/],
    ['postgresAppRoleWorkMemBytes', 268_435_455, /work_mem/],
  ]) {
    const mutated = structuredClone(fixture);
    mutated[field] = value;
    assert.throws(() => evaluateManagedEstateCost(mutated), message);
  }
});

test('refuses an estimate over the cap when checking the budget', () => {
  const mutated = structuredClone(fixture);
  mutated.lineItems.find(
    ({ category }) => category === 'reserve',
  ).unitPriceUsd = 100;
  assert.throws(
    () => evaluateManagedEstateCost(mutated, { requireBudget: true }),
    /exceeds the \$100\.00 cap/,
  );
});

test('a passing budget check still cannot qualify deployment', () => {
  const result = evaluateManagedEstateCost(declaredBudget(), budgetOptions);
  assert.equal(result.withinCap, true);
  assert.equal(result.budgetAccepted, true);
  assert.equal(result.qualificationComplete, false);
});

test('requires a priced reserve for the budget and measured monitoring headroom', () => {
  assert.throws(
    () => evaluateManagedEstateCost(fixture, { requireBudget: true }),
    /non-zero recovery reserve/,
  );
  const crowdedMonitoring = structuredClone(fixture);
  crowdedMonitoring.newRelicMonthlyIngestGb = 51;
  assert.throws(
    () => evaluateManagedEstateCost(crowdedMonitoring),
    /2x measured headroom/,
  );
});

test('refuses missing or non-numeric capacity and retention evidence', () => {
  for (const field of [
    'postgresSharedBuffersBytes',
    'postgresAppRoleWorkMemBytes',
    'monitoringRetentionDays',
  ]) {
    for (const value of [undefined, null, 'not measured', NaN, Infinity]) {
      const mutated = structuredClone(fixture);
      mutated[field] = value;
      assert.throws(
        () => evaluateManagedEstateCost(mutated),
        /must be a finite non-negative number/,
        `${field} must reject ${String(value)}`,
      );
    }
  }
});

test('prices the declared services and traffic instead of independent smaller quantities', () => {
  for (const category of [
    'compute',
    'fly-egress',
    'database-plan',
    'database-storage',
    'database-transfer',
    'primary-object-storage',
    'primary-object-class-a',
    'primary-object-class-b',
    'primary-object-egress',
    'kms-keys',
    'kms-requests',
    'annual-reencryption-kms-requests',
    'annual-reencryption-compute',
    'backup-storage',
    'backup-requests',
    'backup-egress',
    'validator-compute',
    'validator-requests',
    'validator-transfer',
    'mail-overage',
    'monitoring-collector-compute',
    'monitoring-collector-storage',
    'monitoring-collector-egress',
    'monitoring-anchor-http-requests',
    'monitoring-anchor-compute',
    'monitoring-anchor-database-reads',
    'monitoring-anchor-database-writes',
    'monitoring-anchor-storage',
    'primary-ingress',
    'primary-ingress-requests',
    'primary-ingress-cpu',
    'primary-ingress-websocket',
  ]) {
    const mutated = structuredClone(fixture);
    const item = mutated.lineItems.find((entry) => entry.category === category);
    assert.ok(item, `${category} must be priced`);
    item.quantity = 0;
    assert.throws(
      () => evaluateManagedEstateCost(mutated),
      /quantity does not match/,
      `${category} must price its measured quantity`,
    );
  }
});

test('requires the actual free monitoring limit and refuses missing price evidence', () => {
  const inventedLimit = structuredClone(fixture);
  inventedLimit.newRelicFreeIngestLimitGb = 10_000;
  assert.throws(() => evaluateManagedEstateCost(inventedLimit), /100 GB/);
  const missingQuote = structuredClone(fixture);
  delete missingQuote.lineItems[0].evidence;
  assert.throws(() => evaluateManagedEstateCost(missingQuote), /evidence/);
});

test('prices the persistent collector and independent anchor outside New Relic', () => {
  for (const [field, value, message] of [
    ['monitoringCollectorMonthlyHours', 743, /744-hour/],
    ['monitoringCollectorRegion', 'ord', /744-hour/],
    ['monitoringCollectorCpuKind', 'performance', /744-hour/],
    ['monitoringCollectorCpus', 2, /744-hour/],
    ['monitoringCollectorMemoryMb', 1024, /744-hour/],
    ['monitoringCollectorStorageGb', 0, /checkpoint storage/],
    ['monitoringCollectorEgressGb', 0, /checkpoint storage/],
    ['monitoringAnchorHttpRequestCount', 0, /anchor must measure/],
    ['monitoringAnchorComputeGbSeconds', 0, /anchor must measure/],
    ['monitoringAnchorDatabaseReadRequestUnits', 0, /anchor must measure/],
    ['monitoringAnchorDatabaseWriteRequestUnits', 0, /anchor must measure/],
    ['monitoringAnchorStorageGb', 0, /anchor must measure/],
    ['monitoringAnchorRegion', 'eu-west-1', /anchor must measure/],
  ]) {
    const input = structuredClone(fixture);
    input[field] = value;
    assert.throws(() => evaluateManagedEstateCost(input), message, field);
  }

  const wrongProvider = declaredBudget();
  wrongProvider.lineItems.find(
    (row) => row.category === 'monitoring-anchor-storage',
  ).pricing.providerId = 'new-relic';
  assert.throws(
    () => evaluateManagedEstateCost(wrongProvider, budgetOptions),
    /provider aws/,
  );

  const wrongRegion = declaredBudget();
  wrongRegion.lineItems.find(
    (row) => row.category === 'monitoring-anchor-compute',
  ).pricing.region = 'us-west-2';
  assert.throws(
    () => evaluateManagedEstateCost(wrongRegion, budgetOptions),
    /anchor region/,
  );

  const wrongCollectorSize = declaredBudget();
  wrongCollectorSize.lineItems.find(
    (row) => row.category === 'monitoring-collector-compute',
  ).pricing.memoryMb = 256;
  assert.throws(
    () => evaluateManagedEstateCost(wrongCollectorSize, budgetOptions),
    /candidate sizing/,
  );

  const missingIndependentCosts = structuredClone(fixture);
  missingIndependentCosts.lineItems = missingIndependentCosts.lineItems.filter(
    ({ category }) =>
      category === 'monitoring' || !category.startsWith('monitoring-'),
  );
  assert.throws(
    () => evaluateManagedEstateCost(missingIndependentCosts),
    /missing categories: .*monitoring-collector|missing categories: .*monitoring-anchor/,
  );
});

test('cannot qualify production from Boolean declarations and placeholder quotes', () => {
  const mutated = structuredClone(fixture);
  mutated.qualificationComplete = true;
  mutated.evidenceGates = Object.fromEntries(
    [
      'providerQuotesCurrent',
      'trafficMeasured',
      'capacityQualified',
      'recoveryQualified',
      'retentionQualified',
      'alertDeliveryQualified',
    ].map((gate) => [gate, true]),
  );
  mutated.lineItems.find(
    ({ category }) => category === 'reserve',
  ).unitPriceUsd = 1;
  assert.throws(
    () => evaluateManagedEstateCost(mutated, { requireQualification: true }),
    /cannot qualify/,
  );
});

test('refuses unpriced Worker usage, compute sizing, and validator execution changes', () => {
  for (const [field, value] of [
    ['workerMonthlyRequestCount', 1000001],
    [
      'flyServiceResources',
      {
        'studio-production': {
          cpu_kind: 'performance',
          cpus: 64,
          memory_mb: 65536,
        },
      },
    ],
    ['flyMonthlyHours', 1],
    ['validatorMemoryGb', 64],
    ['validatorDurationSeconds', 900],
  ]) {
    const mutated = structuredClone(fixture);
    mutated[field] = value;
    assert.throws(() => evaluateManagedEstateCost(mutated), undefined, field);
  }
});

test('increasing declared Worker requests and validator execution increases the estimate', () => {
  const mutated = structuredClone(fixture);
  const before = evaluateManagedEstateCost(mutated).totalUsd;
  mutated.workerMonthlyRequestCount = 2_000_000;
  const ingress = mutated.lineItems.find(
    ({ category }) => category === 'primary-ingress-requests',
  );
  ingress.quantity = 2_000_000;
  ingress.unitPriceUsd = 0.000002;
  mutated.validatorMemoryGb *= 2;
  mutated.objectScrubMemoryGb *= 2;
  mutated.objectCopyValidationMemoryGb *= 2;
  mutated.objectReconciliationMemoryGb *= 2;
  mutated.lineItems.find(
    ({ category }) => category === 'validator-compute',
  ).quantity *= 2;
  assert.ok(evaluateManagedEstateCost(mutated).totalUsd >= before + 7.95);
});

test('does not round away a breach of the minimum budget headroom', () => {
  const mutated = structuredClone(fixture);
  mutated.minimumHeadroomUsd = 1;
  const subtotal = mutated.lineItems.reduce(
    (sum, item) =>
      sum +
      item.quantity *
        item.unitPriceUsd *
        (item.category.includes('-drill-') ? 3 : 1),
    0,
  );
  mutated.lineItems.find(
    ({ category }) => category === 'reserve',
  ).unitPriceUsd = 100 - subtotal - mutated.minimumHeadroomUsd + 0.004;
  assert.throws(
    () => evaluateManagedEstateCost(mutated, { requireBudget: true }),
    /below the explicit minimum/,
  );
});

test('refuses database storage and plan drift from the shared Terraform candidate', () => {
  const storage = structuredClone(fixture);
  storage.postgresStorageGb = 1000;
  storage.lineItems.find(
    ({ category }) => category === 'database-storage',
  ).quantity = 1000;
  assert.throws(() => evaluateManagedEstateCost(storage), /candidate-sizing/);
  const plan = structuredClone(fixture);
  plan.postgresPlanId = 'standard-64';
  assert.throws(() => evaluateManagedEstateCost(plan), /candidate-sizing/);
});

test('rejects zero validation cadence even with self-consistent cheaper line items', () => {
  const input = structuredClone(fixture);
  input.validatorRunCount = 0;
  input.validatorRequestCount = 0;
  input.validatorTransferGb = 0;
  for (const item of input.lineItems) {
    if (item.category.startsWith('validator-')) item.quantity = 0;
  }
  assert.throws(
    () => evaluateManagedEstateCost(input),
    /5952 scheduled database validations/,
  );
});

test('prices the complete locked recovery window and scheduled transfer', () => {
  for (const [field, category, divisor] of [
    ['backupRequestCount', 'backup-requests', 1],
    ['backupStoredGb', 'backup-storage', 1000],
    ['backupEgressGb', 'backup-egress', 1],
    ['validatorRequestCount', 'validator-requests', 1],
    ['validatorTransferGb', 'validator-transfer', 1],
  ]) {
    const input = structuredClone(fixture);
    input[field] = 0;
    input.lineItems.find((item) => item.category === category).quantity =
      input[field] / divisor;
    assert.throws(
      () => evaluateManagedEstateCost(input),
      /required recovery cadence/,
      field,
    );
  }
  const shortRetention = structuredClone(fixture);
  shortRetention.backupStoredGb = 143.6;
  shortRetention.lineItems.find(
    ({ category }) => category === 'backup-storage',
  ).quantity = 143.6 / 1000;
  assert.throws(
    () => evaluateManagedEstateCost(shortRetention),
    /backupStoredGb is below/,
  );
});

test('binds source database egress to every scheduled dump', () => {
  const input = structuredClone(fixture);
  input.databaseTransferGb = 0;
  input.lineItems.find(
    ({ category }) => category === 'database-transfer',
  ).quantity = 0;
  assert.throws(
    () => evaluateManagedEstateCost(input),
    /databaseTransferGb is below the required recovery cadence/,
  );
});

test('prices retained object versions, recovery copies, and 30-day readback', () => {
  const missingVersions = structuredClone(fixture);
  missingVersions.primaryObjectRetainedVersionGb =
    missingVersions.primaryObjectStoredGb;
  missingVersions.primaryObjectRetainedVersionCount =
    missingVersions.primaryObjectCurrentCount;
  assert.throws(
    () => evaluateManagedEstateCost(missingVersions),
    /retained object version inventory/,
  );

  const currentOnlyStorage = structuredClone(fixture);
  currentOnlyStorage.lineItems.find(
    ({ category }) => category === 'primary-object-storage',
  ).quantity = currentOnlyStorage.primaryObjectStoredGb;
  assert.throws(
    () => evaluateManagedEstateCost(currentOnlyStorage),
    /quantity does not match/,
  );

  for (const [field, category, value, divisor] of [
    ['backupRequestCount', 'backup-requests', 11904, 1],
    ['validatorRequestCount', 'validator-requests', 11904, 1],
    ['backupEgressGb', 'backup-egress', 595.2, 1],
    ['validatorTransferGb', 'validator-transfer', 595.2, 1],
    ['backupStoredGb', 'backup-storage', 615.2, 1000],
  ]) {
    const input = structuredClone(fixture);
    input[field] = value;
    input.lineItems.find(({ category: candidate }) => candidate === category)[
      'quantity'
    ] = value / divisor;
    assert.throws(
      () => evaluateManagedEstateCost(input),
      /required recovery cadence/,
      field,
    );
  }

  const omittedCopyTransfer = structuredClone(fixture);
  omittedCopyTransfer.primaryObjectEgressGb =
    omittedCopyTransfer.primaryObjectApplicationEgressGb;
  omittedCopyTransfer.lineItems.find(
    ({ category }) => category === 'primary-object-egress',
  ).quantity = omittedCopyTransfer.primaryObjectEgressGb;
  assert.throws(
    () => evaluateManagedEstateCost(omittedCopyTransfer),
    /application delivery and recovery copies/,
  );

  const omittedPrimaryWritesAndInventory = structuredClone(fixture);
  omittedPrimaryWritesAndInventory.primaryObjectClassARequests = 0;
  omittedPrimaryWritesAndInventory.lineItems.find(
    ({ category }) => category === 'primary-object-class-a',
  ).quantity = 0;
  assert.throws(
    () => evaluateManagedEstateCost(omittedPrimaryWritesAndInventory),
    /582820 scheduled inventory pages and measured version writes/,
  );

  const exactPrimaryClassAMinimum = structuredClone(fixture);
  // Thirteen listing pages across four buckets, reconciled once per minute
  // for all 31 days, plus immutable version writes.
  exactPrimaryClassAMinimum.primaryObjectClassARequests = 580_320 + 2_500;
  exactPrimaryClassAMinimum.lineItems.find(
    ({ category }) => category === 'primary-object-class-a',
  ).quantity =
    exactPrimaryClassAMinimum.primaryObjectClassARequests / 1_000_000;
  assert.doesNotThrow(() =>
    evaluateManagedEstateCost(exactPrimaryClassAMinimum),
  );

  exactPrimaryClassAMinimum.primaryObjectClassARequests -= 1;
  exactPrimaryClassAMinimum.lineItems.find(
    ({ category }) => category === 'primary-object-class-a',
  ).quantity =
    exactPrimaryClassAMinimum.primaryObjectClassARequests / 1_000_000;
  assert.throws(
    () => evaluateManagedEstateCost(exactPrimaryClassAMinimum),
    /582820 scheduled inventory pages and measured version writes/,
  );

  const halfHourlyInventory = structuredClone(fixture);
  halfHourlyInventory.primaryObjectClassARequests = 5_952 + 2_500;
  halfHourlyInventory.lineItems.find(
    ({ category }) => category === 'primary-object-class-a',
  ).quantity = halfHourlyInventory.primaryObjectClassARequests / 1_000_000;
  assert.throws(
    () => evaluateManagedEstateCost(halfHourlyInventory),
    /582820 scheduled inventory pages and measured version writes/,
  );
});

test('binds Postmark plan and overage costs to measured message volume', () => {
  const omittedOverage = structuredClone(fixture);
  omittedOverage.lineItems.find(
    ({ category }) => category === 'mail-overage',
  ).quantity = 0;
  assert.throws(
    () => evaluateManagedEstateCost(omittedOverage),
    /quantity does not match/,
  );

  const wrongAllowance = declaredBudget();
  wrongAllowance.lineItems.find(({ category }) => category === 'mail').pricing[
    'includedQuantity'
  ] = 1_000_000;
  assert.throws(
    () => evaluateManagedEstateCost(wrongAllowance, budgetOptions),
    /selected mail plan and included message allowance/,
  );
});

test('refuses one-page costing for a paginated retained-version inventory', () => {
  const input = structuredClone(fixture);
  input.primaryObjectClassARequests = 181_060;
  input.lineItems.find(
    ({ category }) => category === 'primary-object-class-a',
  ).quantity = 0.18106;
  assert.throws(
    () => evaluateManagedEstateCost(input),
    /582820 scheduled inventory pages/,
  );

  input.primaryObjectBucketInventories[
    'studio-production'
  ].requestsPerCompleteScan = 1;
  assert.throws(() => evaluateManagedEstateCost(input), /every inventory page/);
});

test('binds all bucket pages to the retained inventory, including empty buckets and short pages', () => {
  for (const edit of [
    (input) => {
      delete input.primaryObjectBucketInventories['studio-staging'];
    },
    (input) => {
      input.primaryObjectBucketInventories.extra = {
        retainedVersionCount: 0,
        requestsPerCompleteScan: 1,
      };
    },
    (input) => {
      input.primaryObjectBucketInventories[
        'studio-production'
      ].retainedVersionCount = 9_999;
    },
    (input) => {
      input.primaryObjectBucketInventories[
        'studio-production'
      ].requestsPerCompleteScan = 9.5;
    },
  ]) {
    const input = structuredClone(fixture);
    edit(input);
    assert.throws(() => evaluateManagedEstateCost(input), /primary|inventory/);
  }
  const input = structuredClone(fixture);
  input.primaryObjectBucketInventories['studio-production'] = {
    retainedVersionCount: 12_500,
    requestsPerCompleteScan: 13,
  };
  for (const name of [
    'studio-staging',
    'registry-production',
    'registry-staging',
  ])
    input.primaryObjectBucketInventories[name] = {
      retainedVersionCount: 0,
      requestsPerCompleteScan: 1,
    };
  const line = input.lineItems.find(
    ({ category }) => category === 'primary-object-class-a',
  );
  for (const drill of Object.values(input.restoreDrills)) {
    for (const [name, inventory] of Object.entries(
      input.primaryObjectBucketInventories,
    )) {
      drill.services[name].objectRestoreCount = inventory.retainedVersionCount;
      drill.services[name].objectRestoreGb =
        inventory.retainedVersionCount * 0.002;
    }
  }
  input.primaryObjectClassARequests = 44_640 * 16 + 2_500;
  line.quantity = input.primaryObjectClassARequests / 1_000_000;
  assert.doesNotThrow(() => evaluateManagedEstateCost(input));
  input.primaryObjectBucketInventories[
    'studio-staging'
  ].requestsPerCompleteScan = 0;
  assert.throws(() => evaluateManagedEstateCost(input), /every inventory page/);
  input.primaryObjectBucketInventories[
    'studio-staging'
  ].requestsPerCompleteScan = 1;
  input.primaryObjectBucketInventories[
    'studio-production'
  ].requestsPerCompleteScan = 20;
  assert.throws(
    () => evaluateManagedEstateCost(input),
    /scheduled inventory pages/,
  );
  input.primaryObjectClassARequests = 44_640 * 23 + 2_500;
  line.quantity = input.primaryObjectClassARequests / 1_000_000;
  assert.doesNotThrow(() => evaluateManagedEstateCost(input));
});

test('refuses database-only compute even when object readback requests and transfer are priced', () => {
  const input = structuredClone(fixture);
  input.lineItems.find(
    ({ category }) => category === 'validator-compute',
  ).quantity =
    input.validatorRunCount *
    input.validatorMemoryGb *
    input.validatorDurationSeconds;
  assert.throws(
    () => evaluateManagedEstateCost(input),
    /validator-compute quantity does not match/,
  );
});

test('requires complete scrub cadence and independently measured positive execution', () => {
  for (const [field, value] of [
    ['objectScrubRunCount', 0],
    ['objectScrubRunCount', 1],
    ['objectScrubRunCount', 2.5],
    ['objectScrubMemoryGb', 0],
    ['objectScrubDurationSeconds', 0],
    ['objectScrubDurationSeconds', undefined],
  ]) {
    const input = structuredClone(fixture);
    input[field] = value;
    assert.throws(() => evaluateManagedEstateCost(input), /scrub|objectScrub/);
  }
  const input = structuredClone(fixture);
  const before = evaluateManagedEstateCost(input).totalUsd;
  input.objectScrubDurationSeconds *= 2;
  const line = input.lineItems.find(
    ({ category }) => category === 'validator-compute',
  );
  assert.throws(
    () => evaluateManagedEstateCost(input),
    /quantity does not match/,
  );
  line.quantity =
    input.validatorRunCount *
      input.validatorMemoryGb *
      input.validatorDurationSeconds +
    input.objectScrubRunCount *
      input.objectScrubMemoryGb *
      input.objectScrubDurationSeconds +
    input.primaryObjectMonthlyVersionChurnCount *
      input.objectCopyValidationMemoryGb *
      input.objectCopyValidationDurationSeconds +
    178_560 *
      input.objectReconciliationMemoryGb *
      input.objectReconciliationDurationSeconds;
  assert.equal(
    Math.round((evaluateManagedEstateCost(input).totalUsd - before) * 100),
    4,
  );
  input.objectScrubRunCount = 3;
  assert.throws(
    () => evaluateManagedEstateCost(input),
    /required recovery cadence/,
  );
});

test('prices every new-copy readback before checkpoint advancement independently of history scrubs', () => {
  for (const [field, category, omitted] of [
    ['backupRequestCount', 'backup-requests', 2_500],
    ['validatorRequestCount', 'validator-requests', 2_500],
    ['backupEgressGb', 'backup-egress', 5],
    ['validatorTransferGb', 'validator-transfer', 5],
  ]) {
    const input = structuredClone(fixture);
    input[field] -= omitted;
    input.lineItems.find((item) => item.category === category).quantity =
      input[field];
    assert.throws(
      () => evaluateManagedEstateCost(input),
      new RegExp(`${field} is below`),
    );
  }
  const input = structuredClone(fixture);
  input.lineItems.find(
    (item) => item.category === 'validator-compute',
  ).quantity -=
    input.primaryObjectMonthlyVersionChurnCount *
    input.objectCopyValidationMemoryGb *
    input.objectCopyValidationDurationSeconds;
  assert.throws(
    () => evaluateManagedEstateCost(input),
    /validator-compute quantity does not match/,
  );
  for (const field of [
    'objectCopyValidationMemoryGb',
    'objectCopyValidationDurationSeconds',
  ]) {
    const missing = structuredClone(fixture);
    missing[field] = 0;
    assert.throws(
      () => evaluateManagedEstateCost(missing),
      /objectCopyValidation memory and duration/,
    );
  }
});

test('prices immutable database checkpoint writes in addition to archive PUT and readback GET', () => {
  const input = structuredClone(fixture);
  input.backupRequestCount -= 5_952;
  input.lineItems.find((item) => item.category === 'backup-requests').quantity =
    input.backupRequestCount;
  assert.throws(
    () => evaluateManagedEstateCost(input),
    /backupRequestCount is below/,
  );
});

test('prices idle-bucket reconciliation, signed checkpoint publication, and locked metadata retention', () => {
  for (const [field, category, omitted, divisor] of [
    ['backupRequestCount', 'backup-requests', 178_560, 1],
    ['validatorRequestCount', 'validator-requests', 178_560, 1],
    [
      'backupStoredGb',
      'backup-storage',
      ((5_952 + 178_560) * 1_024) / 1_000_000_000,
      1_000,
    ],
  ]) {
    const input = structuredClone(fixture);
    input[field] -= omitted;
    input.lineItems.find((item) => item.category === category).quantity =
      input[field] / divisor;
    assert.throws(
      () => evaluateManagedEstateCost(input),
      new RegExp(`${field} is below`),
    );
  }
  const input = structuredClone(fixture);
  input.lineItems.find(
    (item) => item.category === 'validator-compute',
  ).quantity -=
    178_560 *
    input.objectReconciliationMemoryGb *
    input.objectReconciliationDurationSeconds;
  assert.throws(
    () => evaluateManagedEstateCost(input),
    /validator-compute quantity does not match/,
  );
  for (const field of [
    'databaseCheckpointSizeBytes',
    'objectCheckpointSizeBytes',
    'objectReconciliationMemoryGb',
    'objectReconciliationDurationSeconds',
  ]) {
    const missing = structuredClone(fixture);
    missing[field] = 0;
    assert.throws(
      () => evaluateManagedEstateCost(missing),
      /checkpoint sizes|objectReconciliation memory and duration/,
    );
  }
});

test('new-copy validation and reconciliation measurements cannot grow without repricing compute', () => {
  for (const field of [
    'objectCopyValidationMemoryGb',
    'objectCopyValidationDurationSeconds',
    'objectReconciliationMemoryGb',
    'objectReconciliationDurationSeconds',
  ]) {
    const input = structuredClone(fixture);
    input[field] *= 2;
    assert.throws(
      () => evaluateManagedEstateCost(input),
      /validator-compute quantity does not match/,
    );
  }
});

test('prices independent proof-index discovery and reads for reconciliation and scrub startup', () => {
  for (const [field, category, omitted] of [
    ['backupRequestCount', 'backup-requests', 2 * 178_560 + 16],
    [
      'backupEgressGb',
      'backup-egress',
      ((178_560 + 8) * 1_024) / 1_000_000_000,
    ],
    [
      'validatorTransferGb',
      'validator-transfer',
      ((2 * 178_560 + 8) * 1_024 + 5_952 * 1_024) / 1_000_000_000,
    ],
  ]) {
    const input = structuredClone(fixture);
    input[field] -= omitted;
    input.lineItems.find((item) => item.category === category).quantity =
      input[field];
    assert.throws(
      () => evaluateManagedEstateCost(input),
      new RegExp(`${field} is below`),
    );
  }
  for (const field of [
    'recoveryObjectRequestsPerReconciliation',
    'recoveryObjectRequestsPerScrubStart',
  ]) {
    const input = structuredClone(fixture);
    input[field] = 1;
    assert.throws(
      () => evaluateManagedEstateCost(input),
      /recovery object I\/O/,
    );
    input[field] = fixture[field] + 1;
    assert.throws(
      () => evaluateManagedEstateCost(input),
      /backupRequestCount is below/,
    );
  }
});

test('requires measured Fly egress and Worker tier, request, CPU, and WebSocket costs', () => {
  for (const [category, quantity] of [
    ['fly-egress', 0],
    ['primary-ingress', 0],
    ['primary-ingress-requests', 0],
    ['primary-ingress-cpu', 0],
    ['primary-ingress-websocket', 0],
  ]) {
    const input = structuredClone(fixture);
    input.lineItems.find(({ category: candidate }) => candidate === category)[
      'quantity'
    ] = quantity;
    assert.throws(
      () => evaluateManagedEstateCost(input),
      /quantity does not match/,
      category,
    );
  }

  for (const field of [
    'flyApplicationEgressGb',
    'workerMonthlyRequestCount',
    'workerMonthlyCpuMilliseconds',
  ]) {
    const input = structuredClone(fixture);
    input[field] = 0;
    const category =
      field === 'flyApplicationEgressGb'
        ? 'fly-egress'
        : field === 'workerMonthlyRequestCount'
          ? 'primary-ingress-requests'
          : 'primary-ingress-cpu';
    input.lineItems.find(({ category: candidate }) => candidate === category)[
      'quantity'
    ] = 0;
    assert.throws(
      () => evaluateManagedEstateCost(input),
      /must measure the active/,
      field,
    );
  }

  const wrongTier = declaredBudget();
  wrongTier.lineItems.find(
    ({ category }) => category === 'primary-ingress-cpu',
  ).pricing['tierId'] = 'different-tier';
  assert.throws(
    () => evaluateManagedEstateCost(wrongTier, budgetOptions),
    /selected Worker tier/,
  );

  const inventedWebSocketRate = declaredBudget();
  const webSocket = inventedWebSocketRate.lineItems.find(
    ({ category }) => category === 'primary-ingress-websocket',
  );
  webSocket.unitPriceUsd = 0.000001;
  webSocket.pricing.unitPriceUsd = webSocket.unitPriceUsd;
  webSocket.pricing.kind = 'rate';
  assert.throws(
    () => evaluateManagedEstateCost(inventedWebSocketRate, budgetOptions),
    /explicit zero-price inclusion declaration for plain Workers/,
  );

  for (const [field, value] of [
    ['workerTierId', 'unselected'],
    ['postmarkPlanRef', 'historical-comparison'],
  ]) {
    const input = declaredBudget();
    input[field] = value;
    assert.throws(
      () => evaluateManagedEstateCost(input, budgetOptions),
      /selected provider product/,
      field,
    );
  }
});

test('requires measured dump sizes for every database before costing recovery', () => {
  for (const value of [
    undefined,
    {},
    { ...fixture.databaseDumpSizesGb, 'studio-production': 0 },
  ]) {
    const input = structuredClone(fixture);
    input.databaseDumpSizesGb = value;
    assert.throws(
      () => evaluateManagedEstateCost(input),
      /all four|positive measured/,
    );
  }
});

test('adding a reserve cannot turn placeholder pricing into an accepted budget', () => {
  const input = structuredClone(fixture);
  input.minimumHeadroomUsd = 0;
  input.lineItems.find(({ category }) => category === 'reserve').unitPriceUsd =
    1;
  assert.throws(
    () => evaluateManagedEstateCost(input, budgetOptions),
    /selected provider product|current pricing declaration/,
  );
});

test('budget checks bind current declarations to every category and quantity', () => {
  for (const edit of [
    (item) => {
      delete item.pricing;
    },
    (item) => {
      item.evidence = 'placeholder requiring a current quote';
    },
    (item) => {
      item.pricing.currency = 'EUR';
    },
    (item) => {
      item.pricing.quantity = 0;
    },
    (item) => {
      item.pricing.unitPriceUsd = 0;
    },
    (item) => {
      item.pricing.reviewedAt = '2026-08-01';
    },
    (item) => {
      item.pricing.reviewedAt = '2026-09-09';
    },
    (item) => {
      item.pricing.reviewedAt = '2026-02-30';
    },
    (item) => {
      item.pricing.sourceUrl = 'http://example.invalid/pricing';
    },
    (item) => {
      item.pricing.kind = 'included';
    },
  ]) {
    const input = declaredBudget();
    edit(input.lineItems[0]);
    assert.throws(
      () => evaluateManagedEstateCost(input, budgetOptions),
      /pricing|quoted recurring rate/,
    );
  }
});

test('zero-price categories need explicit coverage of their whole usage', () => {
  for (const edit of [
    (item) => {
      item.pricing.kind = 'rate';
    },
    (item) => {
      delete item.pricing.coveredQuantity;
    },
    (item) => {
      item.pricing.coveredQuantity = item.quantity - 1;
    },
    (item) => {
      delete item.pricing.coverage;
    },
    (item) => {
      item.pricing.coverage = 'unverified free-egress eligibility';
    },
  ]) {
    const input = declaredBudget();
    edit(input.lineItems.find(({ category }) => category === 'backup-egress'));
    assert.throws(
      () => evaluateManagedEstateCost(input, budgetOptions),
      /coverage|coveredQuantity/,
    );
  }
});

test('prices Fly recovery uploads in addition to measured application delivery', () => {
  for (const [field, amount] of [
    ['flyRecoveryUploadGb', 600],
    ['flyEgressGb', 600],
  ]) {
    const input = structuredClone(fixture);
    input[field] -= amount;
    input.lineItems.find((row) => row.category === 'fly-egress').quantity =
      input.flyEgressGb;
    assert.throws(
      () => evaluateManagedEstateCost(input),
      new RegExp(`${field} is below`),
    );
  }
  const input = structuredClone(fixture);
  input.flyRecoveryUploadGb += 1;
  assert.throws(() => evaluateManagedEstateCost(input), /flyEgressGb is below/);
});

test('prices durable scrub results, revised proof indexes, and immutable result retention', () => {
  const resultBytes = 2 * (12_500 * 256 + 4 * 1_024);
  for (const [field, category, omitted, divisor] of [
    ['backupRequestCount', 'backup-requests', 25_008, 1],
    ['backupStoredGb', 'backup-storage', resultBytes / 1e9, 1_000],
    ['validatorTransferGb', 'validator-transfer', resultBytes / 1e9, 1],
  ]) {
    const input = structuredClone(fixture);
    input[field] -= omitted;
    input.lineItems.find((row) => row.category === category).quantity =
      input[field] / divisor;
    assert.throws(
      () => evaluateManagedEstateCost(input),
      new RegExp(`${field} is below`),
    );
  }
  for (const field of [
    'objectScrubResultSizeBytes',
    'objectScrubResultRequestsPerVersion',
    'objectScrubPublicationRequestsPerBucket',
  ]) {
    const input = structuredClone(fixture);
    input[field] = 0;
    assert.throws(
      () => evaluateManagedEstateCost(input),
      /durable per-version records/,
    );
    input[field] = fixture[field] * 2;
    assert.throws(
      () => evaluateManagedEstateCost(input),
      /below the required recovery/,
    );
  }
});

test('requires both quarterly drills to cover every database and retained object store', () => {
  for (const mode of ['pitr', 'independent']) {
    for (const edit of [
      (input) => {
        delete input.restoreDrills[mode];
      },
      (input) => {
        delete input.restoreDrills[mode].services['registry-staging'];
      },
      (input) => {
        input.restoreDrills[mode].services[
          'registry-staging'
        ].objectRestoreCount = 0;
      },
      (input) => {
        input.restoreDrills[mode].services[
          'registry-staging'
        ].databaseStorageGb = 0;
      },
      (input) => {
        input.restoreDrills[mode].databaseSourceTransferGb = 0.1;
      },
      (input) => {
        input.restoreDrills[mode].objectSourceTransferGb = 1;
      },
      (input) => {
        input.restoreDrills[mode].runnerTransferGb = 1;
      },
      (input) => {
        input.restoreDrills[mode].scratchStorageGb = 1;
      },
      (input) => {
        input.restoreDrills[mode].databaseSourceRequestCount = 1;
      },
      (input) => {
        input.restoreDrills[mode].objectSourceRequestCount = 1;
      },
      (input) => {
        input.restoreDrills[mode].runsPerQuarter = 0;
      },
      (input) => {
        input.restoreDrills[mode].receiptRequestCount = 1;
      },
    ]) {
      const input = structuredClone(fixture);
      edit(input);
      assert.throws(
        () => evaluateManagedEstateCost(input),
        /drill|restoreDrills/,
      );
    }
    for (const unit of [
      'compute',
      'requests',
      'database-source-requests',
      'database-source-transfer',
      'object-source-requests',
      'object-source-transfer',
      'runner-transfer',
      'database-hours',
      'database-storage',
      'scratch-storage',
    ]) {
      const input = structuredClone(fixture);
      const category = `${mode}-drill-${unit}`;
      input.lineItems.find((row) => row.category === category).quantity = 0;
      assert.throws(
        () => evaluateManagedEstateCost(input),
        /quantity does not match/,
        category,
      );
      input.lineItems = input.lineItems.filter(
        (row) => row.category !== category,
      );
      assert.throws(
        () => evaluateManagedEstateCost(input),
        /missing categories/,
        category,
      );
    }
  }
});

test('amortizes measured quarterly restore resources without absorbing them into reserve', () => {
  for (const mode of ['pitr', 'independent']) {
    const input = structuredClone(fixture);
    const row = input.lineItems.find(
      (item) => item.category === `${mode}-drill-compute`,
    );
    assert.equal(row.quantity, 9_600);
    input.restoreDrills[mode].computeGbSeconds *= 2;
    assert.throws(
      () => evaluateManagedEstateCost(input),
      /quantity does not match/,
    );
    row.quantity *= 2;
    assert.ok(
      evaluateManagedEstateCost(input).totalUsd >
        evaluateManagedEstateCost(fixture).totalUsd,
    );
  }
  for (const field of [
    'backupRequestCount',
    'backupEgressGb',
    'backupStoredGb',
  ]) {
    const input = structuredClone(fixture);
    // Increase receipt size/publications while leaving normal recovery fully priced.
    for (const drill of Object.values(input.restoreDrills)) {
      if (field === 'backupRequestCount') drill.receiptRequestCount = 100;
      else drill.receiptSizeBytes = 1_000_000;
    }
    for (const [other, value, category, divisor] of [
      ['backupRequestCount', 1_000_000, 'backup-requests', 1],
      ['backupEgressGb', 651, 'backup-egress', 1],
      ['backupStoredGb', 621, 'backup-storage', 1_000],
    ]) {
      if (other === field) continue;
      input[other] = value;
      input.lineItems.find((row) => row.category === category).quantity =
        value / divisor;
    }
    assert.throws(
      () => evaluateManagedEstateCost(input),
      new RegExp(`${field} must also cover quarterly drill receipt`),
    );
  }
});

test('refuses a quarterly execution month above the cap even when its monthly accrual fits', () => {
  const input = structuredClone(fixture);
  const before = evaluateManagedEstateCost(input);
  assert.ok(before.peakMonthUsd > before.totalUsd);
  input.lineItems.find((row) => row.category === 'reserve').unitPriceUsd =
    100 - before.peakMonthUsd + 0.5;
  const estimate = evaluateManagedEstateCost(input);
  assert.ok(estimate.totalUsd < 100);
  assert.ok(estimate.peakMonthUsd > 100);
  assert.equal(estimate.withinCap, false);
  assert.throws(
    () => evaluateManagedEstateCost(input, { requireBudget: true }),
    /peak monthly total.*exceeds/,
  );
});

test('includes quarterly receipt traffic in peak-month budget enforcement', () => {
  const input = declaredBudget();
  for (const drill of Object.values(input.restoreDrills))
    drill.receiptRequestCount = 1_000_000;
  input.backupRequestCount += (2_000_000 - 4) / 3;
  for (const row of input.lineItems) {
    row.unitPriceUsd =
      row.category === 'backup-requests'
        ? 0.00006
        : row.category === 'reserve'
          ? 1
          : 0;
    if (row.category === 'backup-requests')
      row.quantity = input.backupRequestCount;
    Object.assign(row.pricing, {
      quantity: row.quantity,
      unitPriceUsd: row.unitPriceUsd,
      kind:
        row.category === 'reserve'
          ? 'operator-reserve'
          : row.unitPriceUsd === 0
            ? 'included'
            : 'rate',
      coveredQuantity: row.quantity,
      coverage: 'Synthetic included allowance',
    });
  }
  const result = evaluateManagedEstateCost(input);
  assert.ok(result.totalUsd < 100);
  assert.ok(result.peakMonthUsd > 100);
  assert.throws(
    () => evaluateManagedEstateCost(input, budgetOptions),
    /peak monthly total.*exceeds/,
  );
});

test('refuses smaller drill I/O even when the quoted quantities match', () => {
  for (const mode of ['pitr', 'independent']) {
    for (const [field, unit, quantity] of [
      ['databaseSourceTransferGb', 'database-source-transfer', 1 / 3],
      ['objectSourceTransferGb', 'object-source-transfer', 1 / 3],
      ['runnerTransferGb', 'runner-transfer', 1 / 3],
      ['databaseSourceRequestCount', 'database-source-requests', 1 / 3],
      ['objectSourceRequestCount', 'object-source-requests', 1 / 3],
      ['scratchStorageGb', 'scratch-storage', 4 / 3],
    ]) {
      const input = structuredClone(fixture);
      input.restoreDrills[mode][field] = 1;
      input.lineItems.find(
        (row) => row.category === `${mode}-drill-${unit}`,
      ).quantity = quantity;
      assert.throws(
        () => evaluateManagedEstateCost(input),
        /must cover the complete recovery inventory/,
        `${mode} ${field}`,
      );
    }
  }
});

test('requires object counts and byte totals to agree in both directions', () => {
  for (const [bytes, count] of [
    ['primaryObjectStoredGb', 'primaryObjectCurrentCount'],
    ['primaryObjectRetainedVersionGb', 'primaryObjectRetainedVersionCount'],
  ]) {
    const missingBytes = structuredClone(fixture);
    missingBytes[bytes] = 0;
    assert.throws(
      () => evaluateManagedEstateCost(missingBytes),
      /object byte and object-count measurements/,
    );
    const missingCount = structuredClone(fixture);
    missingCount[count] = 0;
    assert.throws(
      () => evaluateManagedEstateCost(missingCount),
      /object byte and object-count measurements/,
    );
  }
});

test('prices database and object drill sources as separate provider quantities', () => {
  for (const mode of ['pitr', 'independent']) {
    for (const kind of ['database', 'object']) {
      for (const unit of ['requests', 'transfer']) {
        const input = structuredClone(fixture);
        const category = `${mode}-drill-${kind}-source-${unit}`;
        input.lineItems.find((row) => row.category === category).quantity = 0;
        assert.throws(
          () => evaluateManagedEstateCost(input),
          /quantity does not match/,
          category,
        );
      }
    }
  }

  const wrongProvider = declaredBudget();
  wrongProvider.lineItems.find(
    (row) => row.category === 'pitr-drill-object-source-transfer',
  ).pricing.providerId = 'crunchybridge';
  assert.throws(
    () => evaluateManagedEstateCost(wrongProvider, budgetOptions),
    /source provider cloudflare-r2/,
  );
});

test('drill storage uses measured expanded databases rather than compressed dumps', () => {
  for (const mode of ['pitr', 'independent']) {
    const input = structuredClone(fixture);
    input.databaseExpandedSizesGb['studio-production'] = 5;
    const otherMode = mode === 'pitr' ? 'independent' : 'pitr';
    input.restoreDrills[otherMode].services[
      'studio-production'
    ].databaseStorageGb = 5;
    assert.throws(
      () => evaluateManagedEstateCost(input),
      /expanded|retained object inventory/,
      mode,
    );
  }
  const missing = structuredClone(fixture);
  delete missing.databaseExpandedSizesGb['studio-staging'];
  assert.throws(
    () => evaluateManagedEstateCost(missing),
    /databaseExpandedSizesGb/,
  );
});

test('annual re-encryption binds measured KMS and compute and raises peak month', () => {
  for (const [field, value] of [
    ['batchSize', 0],
    ['batchInvocationCount', 500],
    ['verificationInvocationCount', 0],
    ['configuredRootCount', 0],
    ['computeGbSeconds', 0],
  ]) {
    const input = structuredClone(fixture);
    input.annualReencryption['studio-production'][field] = value;
    if (field === 'batchInvocationCount')
      input.lineItems.find(
        (row) => row.category === 'annual-reencryption-kms-requests',
      ).quantity = 2006 / 12;
    assert.throws(() => evaluateManagedEstateCost(input), /annualReencryption/);
  }

  const changedRoots = structuredClone(fixture);
  changedRoots.annualReencryption['studio-production'].configuredRootCount = 3;
  assert.throws(
    () => evaluateManagedEstateCost(changedRoots),
    /quantity does not match/,
  );
  const repricedRoots = structuredClone(changedRoots);
  repricedRoots.lineItems.find(
    (row) => row.category === 'annual-reencryption-kms-requests',
  ).quantity = 2510 / 12;
  assert.doesNotThrow(() => evaluateManagedEstateCost(repricedRoots));

  const emptyEnvironment = structuredClone(fixture);
  Object.assign(emptyEnvironment.annualReencryption['studio-production'], {
    recordCount: 0,
    batchInvocationCount: 1,
    computeGbSeconds: 1,
  });
  emptyEnvironment.lineItems.find(
    (row) => row.category === 'annual-reencryption-kms-requests',
  ).quantity = 1008 / 12;
  emptyEnvironment.lineItems.find(
    (row) => row.category === 'annual-reencryption-compute',
  ).quantity = 51 / 12;
  assert.doesNotThrow(() => evaluateManagedEstateCost(emptyEnvironment));

  const priced = structuredClone(fixture);
  priced.lineItems.find(
    (row) => row.category === 'annual-reencryption-compute',
  ).unitPriceUsd = 0.01;
  const result = evaluateManagedEstateCost(priced);
  assert.ok(result.peakMonthUsd > result.totalUsd);

  const peakBreach = declaredBudget();
  const compute = peakBreach.lineItems.find(
    (row) => row.category === 'annual-reencryption-compute',
  );
  compute.unitPriceUsd = 0.1;
  compute.pricing.unitPriceUsd = compute.unitPriceUsd;
  assert.throws(
    () => evaluateManagedEstateCost(peakBreach, budgetOptions),
    /peak monthly total .* exceeds the \$100\.00 cap/,
  );
});

test('object drill sources include each bucket discovery read even with internally consistent quotes', () => {
  for (const mode of ['pitr', 'independent']) {
    const input = structuredClone(fixture);
    const drill = input.restoreDrills[mode];
    drill.objectSourceRequestCount = Object.values(drill.services).reduce(
      (sum, service) => sum + service.objectRestoreCount,
      0,
    );
    input.lineItems.find(
      (row) => row.category === `${mode}-drill-object-source-requests`,
    ).quantity = drill.objectSourceRequestCount * (1 / 3);
    assert.throws(
      () => evaluateManagedEstateCost(input),
      /complete recovery inventory/,
    );
  }
});

function includeTogether(
  input,
  categories,
  limitQuantity,
  unit = 'gb-seconds',
) {
  for (const category of categories) {
    const item = input.lineItems.find((row) => row.category === category);
    item.unitPriceUsd = 0;
    Object.assign(item.pricing, {
      kind: 'included',
      unitPriceUsd: 0,
      providerId: 'aws',
      coveredQuantity: limitQuantity,
      coverage: 'Synthetic shared allowance',
      allowance: {
        billingScopeId: 'fixture-aws-payer',
        productId: 'lambda',
        allowanceId: 'monthly-compute',
        unit,
        period: 'month',
        limitQuantity,
      },
    });
  }
}

test('aggregates recurring, quarterly and annual included usage in the execution month', () => {
  const input = declaredBudget();
  includeTogether(
    input,
    [
      'validator-compute',
      'pitr-drill-compute',
      'independent-drill-compute',
      'annual-reencryption-compute',
      'monitoring-anchor-compute',
    ],
    400_000,
  );
  assert.throws(
    () => evaluateManagedEstateCost(input, budgetOptions),
    /shared allowance .* peak usage .* exceeds/,
  );
  includeTogether(
    input,
    [
      'validator-compute',
      'pitr-drill-compute',
      'independent-drill-compute',
      'annual-reencryption-compute',
      'monitoring-anchor-compute',
    ],
    430_000,
  );
  assert.equal(
    evaluateManagedEstateCost(input, budgetOptions).budgetAccepted,
    true,
  );
});

test('case-only allowance identity variations cannot split shared capacity', () => {
  for (const field of ['billingScopeId', 'productId', 'allowanceId', 'unit']) {
    const input = declaredBudget();
    includeTogether(
      input,
      ['validator-compute', 'monitoring-anchor-compute'],
      362_380,
    );
    const allowance = input.lineItems.find(
      (row) => row.category === 'monitoring-anchor-compute',
    ).pricing.allowance;
    allowance[field] = allowance[field].toUpperCase();
    assert.throws(
      () => evaluateManagedEstateCost(input, budgetOptions),
      /shared allowance .* peak usage .* exceeds/,
    );
  }
});

test('shared allowances cannot reset through a different unit, limit or period', () => {
  for (const changes of [
    { unit: 'milliseconds' },
    { limitQuantity: 999_999 },
    { period: 'quarter' },
  ]) {
    const input = declaredBudget();
    includeTogether(
      input,
      ['validator-compute', 'monitoring-anchor-compute'],
      1_000_000,
    );
    const quote = input.lineItems.find(
      (row) => row.category === 'monitoring-anchor-compute',
    ).pricing;
    Object.assign(quote.allowance, changes);
    if (changes.limitQuantity) quote.coveredQuantity = changes.limitQuantity;
    assert.throws(
      () => evaluateManagedEstateCost(input, budgetOptions),
      /shared allowance|execution month/,
    );
  }
  const missing = declaredBudget();
  delete missing.lineItems.find((row) => row.category === 'monitoring').pricing
    .allowance;
  assert.throws(
    () => evaluateManagedEstateCost(missing, budgetOptions),
    /shared allowance declaration/,
  );
});

test('accounts for quarterly receipt usage inside a shared recurring B2 allowance', () => {
  const input = declaredBudget();
  const recurring = input.lineItems.find(
    (row) => row.category === 'backup-egress',
  );
  const extra = input.lineItems.find(
    (row) => row.category === 'independent-drill-object-source-transfer',
  );
  const monthlyTotal = recurring.quantity + extra.quantity;
  for (const item of [recurring, extra]) {
    item.pricing.providerId = 'backblaze-b2';
    item.pricing.coveredQuantity = monthlyTotal;
    item.pricing.allowance = {
      billingScopeId: 'fixture-b2-account',
      productId: 'b2',
      allowanceId: 'egress',
      unit: 'gigabytes',
      period: 'month',
      limitQuantity: monthlyTotal,
    };
  }
  assert.throws(
    () => evaluateManagedEstateCost(input, budgetOptions),
    /shared allowance .* peak usage .* exceeds/,
  );
});
