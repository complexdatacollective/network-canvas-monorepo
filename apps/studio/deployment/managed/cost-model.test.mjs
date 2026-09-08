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
  input.minimumHeadroomUsd = 5;
  input.lineItems.find(({ category }) => category === 'reserve').unitPriceUsd =
    1;
  for (const item of input.lineItems) {
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
      ...(item.unitPriceUsd === 0
        ? {
            coveredQuantity: item.quantity,
            coverage: 'Synthetic included allowance',
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
    'backup-storage',
    'backup-requests',
    'backup-egress',
    'validator-compute',
    'validator-requests',
    'validator-transfer',
    'mail-overage',
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
  mutated.lineItems.find(
    ({ category }) => category === 'validator-compute',
  ).quantity *= 2;
  assert.ok(evaluateManagedEstateCost(mutated).totalUsd >= before + 7.95);
});

test('does not round away a breach of the minimum budget headroom', () => {
  const mutated = structuredClone(fixture);
  mutated.minimumHeadroomUsd = 1;
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
