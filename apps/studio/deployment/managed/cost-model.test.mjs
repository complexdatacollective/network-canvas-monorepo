import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { evaluateManagedEstateCost } from './cost-model.mjs';

const fixture = JSON.parse(
  await readFile(new URL('./cost-input.example.json', import.meta.url), 'utf8'),
);

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
  const mutated = structuredClone(fixture);
  mutated.lineItems.find(
    ({ category }) => category === 'reserve',
  ).unitPriceUsd = 1;
  const result = evaluateManagedEstateCost(mutated, { requireBudget: true });
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

test('refuses unpriced ingress, compute sizing, and validator execution changes', () => {
  for (const [field, value] of [
    ['primaryIngressGb', 1000000],
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

test('increasing declared ingress and validator execution increases the estimate', () => {
  const mutated = structuredClone(fixture);
  const before = evaluateManagedEstateCost(mutated).totalUsd;
  mutated.primaryIngressGb = 100;
  const ingress = mutated.lineItems.find(
    ({ category }) => category === 'primary-ingress',
  );
  ingress.quantity = 100;
  ingress.unitPriceUsd = 0.02;
  mutated.validatorMemoryGb *= 2;
  mutated.lineItems.find(
    ({ category }) => category === 'validator-compute',
  ).quantity *= 2;
  assert.ok(evaluateManagedEstateCost(mutated).totalUsd >= before + 7.95);
});

test('does not round away a breach of the minimum budget headroom', () => {
  const mutated = structuredClone(fixture);
  const subtotal = mutated.lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceUsd,
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
