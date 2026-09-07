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
    /qualificationComplete must be true/,
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

test('refuses an estimate over the cap when used as a qualification gate', () => {
  const mutated = structuredClone(fixture);
  mutated.qualificationComplete = true;
  for (const gate of Object.keys(mutated.evidenceGates))
    mutated.evidenceGates[gate] = true;
  mutated.lineItems.find(
    ({ category }) => category === 'reserve',
  ).unitPriceUsd = 100;
  assert.throws(
    () => evaluateManagedEstateCost(mutated, { requireQualification: true }),
    /exceeds the \$100\.00 cap/,
  );
});

test('refuses qualification when a named live evidence gate is absent', () => {
  const mutated = structuredClone(fixture);
  mutated.qualificationComplete = true;
  assert.throws(
    () => evaluateManagedEstateCost(mutated, { requireQualification: true }),
    /every named live evidence gate/,
  );
});

test('refuses qualification without priced reserve and measured monitoring headroom', () => {
  const noReserve = structuredClone(fixture);
  noReserve.qualificationComplete = true;
  for (const gate of Object.keys(noReserve.evidenceGates))
    noReserve.evidenceGates[gate] = true;
  assert.throws(
    () => evaluateManagedEstateCost(noReserve, { requireQualification: true }),
    /non-zero recovery reserve/,
  );

  const crowdedMonitoring = structuredClone(fixture);
  crowdedMonitoring.newRelicMonthlyIngestGb = 51;
  assert.throws(
    () => evaluateManagedEstateCost(crowdedMonitoring),
    /2x measured headroom/,
  );
});
