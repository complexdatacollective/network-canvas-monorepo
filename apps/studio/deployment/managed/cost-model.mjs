import { readFile } from 'node:fs/promises';

const sizing = JSON.parse(
  await readFile(new URL('./candidate-sizing.json', import.meta.url), 'utf8'),
);

const DRILL_MODES = ['pitr', 'independent'];
const DRILL_UNITS = [
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
];

const REQUIRED_CATEGORIES = new Set([
  ...DRILL_MODES.flatMap((mode) =>
    DRILL_UNITS.map((unit) => `${mode}-drill-${unit}`),
  ),
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
  'mail',
  'mail-overage',
  'monitoring',
  'monitoring-collector-compute',
  'monitoring-collector-storage',
  'monitoring-collector-egress',
  'monitoring-anchor-http-requests',
  'monitoring-anchor-compute',
  'monitoring-anchor-database-reads',
  'monitoring-anchor-database-writes',
  'monitoring-anchor-storage',
  'dns',
  'primary-ingress',
  'primary-ingress-requests',
  'primary-ingress-cpu',
  'primary-ingress-websocket',
  'reserve',
]);
const DRILL_SOURCE_PROVIDERS = Object.freeze({
  'independent-drill-database': 'backblaze-b2',
  'independent-drill-object': 'backblaze-b2',
  'pitr-drill-database': 'crunchybridge',
  'pitr-drill-object': 'cloudflare-r2',
});
const MONITORING_PROVIDERS = Object.freeze({
  'monitoring': 'new-relic',
  'monitoring-collector-compute': 'fly',
  'monitoring-collector-storage': 'fly',
  'monitoring-collector-egress': 'fly',
  'monitoring-anchor-http-requests': 'aws',
  'monitoring-anchor-compute': 'aws',
  'monitoring-anchor-database-reads': 'aws',
  'monitoring-anchor-database-writes': 'aws',
  'monitoring-anchor-storage': 'aws',
});

function fail(message) {
  throw new Error(`managed estate cost input: ${message}`);
}

function finiteNonNegative(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail(`${path} must be a finite non-negative number`);
  }
  return value;
}

function nonNegativeSafeInteger(value, path) {
  finiteNonNegative(value, path);
  if (!Number.isSafeInteger(value)) fail(`${path} must be a safe integer`);
  return value;
}

function boundedIdentifier(value, path) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(value))
    fail(`${path} must be a bounded provider identifier`);
  return value;
}

function requireSelectedIdentifier(value, path) {
  if (
    /placeholder|illustrative|unverified|pending|unselected|unknown|historical/i.test(
      value,
    )
  )
    fail(
      `${path} must identify a selected provider product for a budget check`,
    );
}

function verifyPricingDeclaration(item, now, usage) {
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
  if (
    (item.category === 'mail' || item.category === 'mail-overage') &&
    (quote.planRef !== usage.postmarkPlanRef ||
      quote.includedQuantity !== usage.postmarkIncludedMessages)
  )
    fail(
      `category ${item.category} pricing must identify the selected mail plan and included message allowance`,
    );
  if (
    item.category.startsWith('primary-ingress') &&
    quote.tierId !== usage.workerTierId
  )
    fail(
      `category ${item.category} pricing must identify the selected Worker tier`,
    );
  if (item.category === 'primary-ingress-websocket' && item.unitPriceUsd !== 0)
    fail(
      'primary-ingress-websocket must use an explicit zero-price inclusion declaration for plain Workers',
    );
  const drillSource = Object.entries(DRILL_SOURCE_PROVIDERS).find(([prefix]) =>
    item.category.startsWith(`${prefix}-source-`),
  );
  if (drillSource && quote.providerId !== drillSource[1])
    fail(
      `category ${item.category} pricing must identify its source provider ${drillSource[1]}`,
    );
  const monitoringProvider = MONITORING_PROVIDERS[item.category];
  if (monitoringProvider && quote.providerId !== monitoringProvider)
    fail(
      `category ${item.category} pricing must identify provider ${monitoringProvider}`,
    );
  if (
    item.category.startsWith('monitoring-collector-') &&
    quote.region !== usage.monitoringCollectorRegion
  )
    fail(
      `category ${item.category} pricing must identify the collector region`,
    );
  if (
    item.category.startsWith('monitoring-anchor-') &&
    quote.region !== usage.monitoringAnchorRegion
  )
    fail(`category ${item.category} pricing must identify the anchor region`);
  if (
    item.category === 'monitoring-collector-compute' &&
    (quote.cpuKind !== usage.monitoringCollectorCpuKind ||
      quote.cpus !== usage.monitoringCollectorCpus ||
      quote.memoryMb !== usage.monitoringCollectorMemoryMb)
  )
    fail('monitoring collector pricing must identify its candidate sizing');
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
    'monitoringCollectorMonthlyHours',
    'monitoringCollectorStorageGb',
    'monitoringCollectorEgressGb',
    'monitoringAnchorComputeGbSeconds',
    'monitoringAnchorStorageGb',
    'flyApplicationEgressGb',
    'flyRecoveryUploadGb',
    'flyEgressGb',
    'primaryObjectApplicationEgressGb',
    'primaryObjectStoredGb',
    'primaryObjectMonthlyVersionChurnGb',
    'primaryObjectRetainedVersionGb',
    'primaryObjectClassARequests',
    'primaryObjectClassBRequests',
    'primaryObjectEgressGb',
    'databaseTransferGb',
    'validatorRequestCount',
    'validatorRunCount',
    'validatorMemoryGb',
    'validatorDurationSeconds',
    'objectScrubMemoryGb',
    'objectScrubDurationSeconds',
    'objectCopyValidationMemoryGb',
    'objectCopyValidationDurationSeconds',
    'objectReconciliationMemoryGb',
    'objectReconciliationDurationSeconds',
    'validatorTransferGb',
    'backupStoredGb',
    'backupRequestCount',
    'backupEgressGb',
    'workerMonthlyCpuMilliseconds',
    'workerMonthlyWebSocketMinutes',
  ])
    finiteNonNegative(input[field], field);

  for (const field of [
    'primaryObjectCurrentCount',
    'primaryObjectMonthlyVersionChurnCount',
    'primaryObjectRetainedVersionCount',
    'objectScrubRunCount',
    'databaseCheckpointSizeBytes',
    'objectCheckpointSizeBytes',
    'objectScrubResultSizeBytes',
    'objectScrubResultRequestsPerVersion',
    'objectScrubPublicationRequestsPerBucket',
    'recoveryObjectRequestsPerReconciliation',
    'recoveryObjectRequestsPerScrubStart',
    'postmarkMessageCount',
    'postmarkIncludedMessages',
    'workerMonthlyRequestCount',
    'monitoringCollectorCpus',
    'monitoringCollectorMemoryMb',
    'monitoringAnchorHttpRequestCount',
    'monitoringAnchorDatabaseReadRequestUnits',
    'monitoringAnchorDatabaseWriteRequestUnits',
  ])
    nonNegativeSafeInteger(input[field], field);
  const postmarkPlanRef = boundedIdentifier(
    input.postmarkPlanRef,
    'postmarkPlanRef',
  );
  const workerTierId = boundedIdentifier(input.workerTierId, 'workerTierId');
  const monitoringCollectorRegion = boundedIdentifier(
    input.monitoringCollectorRegion,
    'monitoringCollectorRegion',
  );
  const monitoringAnchorRegion = boundedIdentifier(
    input.monitoringAnchorRegion,
    'monitoringAnchorRegion',
  );
  const monitoringCollectorCpuKind = boundedIdentifier(
    input.monitoringCollectorCpuKind,
    'monitoringCollectorCpuKind',
  );
  if (
    (input.primaryObjectStoredGb === 0) !==
      (input.primaryObjectCurrentCount === 0) ||
    (input.primaryObjectRetainedVersionGb === 0) !==
      (input.primaryObjectRetainedVersionCount === 0) ||
    (input.primaryObjectMonthlyVersionChurnGb === 0) !==
      (input.primaryObjectMonthlyVersionChurnCount === 0)
  )
    fail(
      'object byte and object-count measurements must describe the same inventory',
    );
  if (
    input.workerMonthlyRequestCount === 0 ||
    input.workerMonthlyCpuMilliseconds === 0
  )
    fail('Worker requests and CPU usage must measure the active ingress');
  if (input.flyApplicationEgressGb === 0)
    fail('Fly application egress must measure the active services');
  if (
    input.monitoringCollectorMonthlyHours !== sizing.monthlyHours ||
    monitoringCollectorRegion !== sizing.region ||
    monitoringCollectorCpuKind !== 'shared' ||
    input.monitoringCollectorCpus !== 1 ||
    input.monitoringCollectorMemoryMb !== 512
  )
    fail(
      'monitoring collector compute must cover the 744-hour IAD 1x shared 512 MB candidate',
    );
  if (
    input.monitoringCollectorStorageGb === 0 ||
    input.monitoringCollectorEgressGb === 0
  )
    fail('monitoring collector must measure checkpoint storage and egress');
  if (
    monitoringAnchorRegion !== 'us-east-1' ||
    input.monitoringAnchorHttpRequestCount === 0 ||
    input.monitoringAnchorComputeGbSeconds === 0 ||
    input.monitoringAnchorDatabaseReadRequestUnits === 0 ||
    input.monitoringAnchorDatabaseWriteRequestUnits === 0 ||
    input.monitoringAnchorStorageGb === 0
  )
    fail(
      'monitoring anchor must measure US-region HTTP, compute, database read/write, and storage usage',
    );

  if (input.validatorMemoryGb === 0 || input.validatorDurationSeconds === 0)
    fail('validator memory and duration must be positive');
  if (input.objectScrubMemoryGb === 0 || input.objectScrubDurationSeconds === 0)
    fail('object scrub memory and duration must be positive');
  for (const phase of ['objectCopyValidation', 'objectReconciliation']) {
    if (
      input[`${phase}MemoryGb`] === 0 ||
      input[`${phase}DurationSeconds`] === 0
    )
      fail(`${phase} memory and duration must be positive`);
  }
  if (
    input.databaseCheckpointSizeBytes === 0 ||
    input.objectCheckpointSizeBytes === 0
  )
    fail('database and object checkpoint sizes must be positive measurements');
  if (
    input.recoveryObjectRequestsPerReconciliation < 3 ||
    input.recoveryObjectRequestsPerScrubStart < 2
  )
    fail(
      'recovery object I/O must include checkpoint discovery, full proof-index reads, and reconciliation checkpoint writes',
    );

  if (
    input.objectScrubResultSizeBytes === 0 ||
    input.objectScrubResultRequestsPerVersion < 1 ||
    input.objectScrubPublicationRequestsPerBucket < 1
  )
    fail(
      'object scrub results require durable per-version records and per-bucket proof publication',
    );

  const dumpSizes = input.databaseDumpSizesGb;
  const expandedSizes = input.databaseExpandedSizesGb;
  const databaseNames = Object.keys(sizing.services);
  if (
    !dumpSizes ||
    typeof dumpSizes !== 'object' ||
    Array.isArray(dumpSizes) ||
    Object.keys(dumpSizes).length !== databaseNames.length ||
    !databaseNames.every((name) => Object.hasOwn(dumpSizes, name))
  )
    fail('databaseDumpSizesGb must measure all four logical databases');
  if (
    !expandedSizes ||
    typeof expandedSizes !== 'object' ||
    Array.isArray(expandedSizes) ||
    Object.keys(expandedSizes).length !== databaseNames.length ||
    !databaseNames.every((name) => Object.hasOwn(expandedSizes, name))
  )
    fail('databaseExpandedSizesGb must measure all four logical databases');
  let dumpTotalGb = 0;
  let expandedTotalGb = 0;
  for (const name of databaseNames) {
    const size = finiteNonNegative(
      dumpSizes[name],
      `databaseDumpSizesGb.${name}`,
    );
    if (size === 0)
      fail('every logical database requires a positive measured dump size');
    dumpTotalGb += size;
    const expanded = finiteNonNegative(
      expandedSizes[name],
      `databaseExpandedSizesGb.${name}`,
    );
    if (expanded === 0 || expanded < size)
      fail(
        'every logical database requires a positive independently measured expanded size at least as large as its dump',
      );
    expandedTotalGb += expanded;
  }
  if (expandedTotalGb > input.postgresStorageGb)
    fail('expanded database footprints exceed the selected PostgreSQL storage');
  const monthlyPoints =
    (sizing.monthlyHours * 60) / sizing.recovery.backupIntervalMinutes;
  const requiredValidations = monthlyPoints * databaseNames.length;
  // Every bucket, including an idle one, needs a validated authoritative
  // reconciliation and an immutable checkpoint. This is separate from both
  // changed-version readback and the slower complete history scrub.
  const objectReconciliations =
    ((sizing.monthlyHours * 60) /
      sizing.recovery.objectReconciliationIntervalMinutes) *
    databaseNames.length;
  const retainedDatabasePoints =
    ((sizing.recovery.retentionDays * 24 * 60) /
      sizing.recovery.backupIntervalMinutes) *
    databaseNames.length;
  const retainedObjectCheckpoints =
    ((sizing.recovery.retentionDays * 24 * 60) /
      sizing.recovery.objectReconciliationIntervalMinutes) *
    databaseNames.length;
  const requiredObjectScrubRuns = Math.ceil(
    sizing.recovery.retentionDays / sizing.recovery.objectScrubIntervalDays,
  );
  if (input.objectScrubRunCount < requiredObjectScrubRuns)
    fail(
      `objectScrubRunCount must cover at least ${requiredObjectScrubRuns} complete retained-version integrity scrubs`,
    );
  if (
    !Number.isSafeInteger(input.validatorRunCount) ||
    input.validatorRunCount < requiredValidations
  )
    fail(
      `validatorRunCount must cover at least ${requiredValidations} scheduled database validations`,
    );
  const scrubResultBytesPerRun =
    input.primaryObjectRetainedVersionCount * input.objectScrubResultSizeBytes +
    databaseNames.length * input.objectCheckpointSizeBytes;
  const scrubResultRequests =
    input.objectScrubRunCount *
    (input.primaryObjectRetainedVersionCount *
      input.objectScrubResultRequestsPerVersion +
      databaseNames.length * input.objectScrubPublicationRequestsPerBucket);
  const recoveryMinimums = {
    flyRecoveryUploadGb:
      monthlyPoints * dumpTotalGb + input.primaryObjectMonthlyVersionChurnGb,
    flyEgressGb: input.flyApplicationEgressGb + input.flyRecoveryUploadGb,
    databaseTransferGb: monthlyPoints * dumpTotalGb,
    backupRequestCount:
      scrubResultRequests +
      requiredValidations * sizing.recovery.requestsPerBackup +
      input.primaryObjectMonthlyVersionChurnCount *
        sizing.recovery.backupRequestsPerObjectCopy +
      objectReconciliations * input.recoveryObjectRequestsPerReconciliation +
      input.objectScrubRunCount *
        databaseNames.length *
        input.recoveryObjectRequestsPerScrubStart +
      input.objectScrubRunCount *
        input.primaryObjectRetainedVersionCount *
        sizing.recovery.backupRequestsPerObjectValidation,
    validatorRequestCount:
      input.validatorRunCount * sizing.recovery.requestsPerValidation +
      input.primaryObjectMonthlyVersionChurnCount *
        sizing.recovery.validatorRequestsPerObjectCopy +
      objectReconciliations *
        sizing.recovery.validatorRequestsPerObjectReconciliation +
      input.objectScrubRunCount *
        input.primaryObjectRetainedVersionCount *
        sizing.recovery.validatorRequestsPerObjectValidation,
    // Every immutable archive remains locked for 31 days, including frequent
    // points older than the seven-day operational retention target.
    backupStoredGb:
      ((sizing.recovery.retentionDays * 24 * 60) /
        sizing.recovery.backupIntervalMinutes) *
        dumpTotalGb +
      input.primaryObjectRetainedVersionGb +
      (input.objectScrubRunCount * scrubResultBytesPerRun +
        retainedDatabasePoints * input.databaseCheckpointSizeBytes +
        retainedObjectCheckpoints * input.objectCheckpointSizeBytes) /
        1_000_000_000,
    backupEgressGb:
      monthlyPoints * dumpTotalGb +
      input.primaryObjectMonthlyVersionChurnGb +
      input.objectScrubRunCount * input.primaryObjectRetainedVersionGb +
      ((objectReconciliations +
        input.objectScrubRunCount * databaseNames.length) *
        input.objectCheckpointSizeBytes) /
        1_000_000_000,
    validatorTransferGb:
      monthlyPoints * dumpTotalGb +
      input.primaryObjectMonthlyVersionChurnGb +
      input.objectScrubRunCount * input.primaryObjectRetainedVersionGb +
      (input.objectScrubRunCount * scrubResultBytesPerRun +
        (2 * objectReconciliations +
          input.objectScrubRunCount * databaseNames.length) *
          input.objectCheckpointSizeBytes +
        requiredValidations * input.databaseCheckpointSizeBytes) /
        1_000_000_000,
  };
  for (const [field, minimum] of Object.entries(recoveryMinimums)) {
    finiteNonNegative(minimum, `minimum ${field}`);
    if (input[field] < minimum)
      fail(
        `${field} is below the required recovery cadence, scrub cadence, or measured inventory`,
      );
  }

  if (
    input.primaryObjectRetainedVersionGb <
      input.primaryObjectStoredGb + input.primaryObjectMonthlyVersionChurnGb ||
    input.primaryObjectRetainedVersionCount <
      input.primaryObjectCurrentCount +
        input.primaryObjectMonthlyVersionChurnCount
  )
    fail(
      'retained object version inventory must cover current objects and measured monthly churn',
    );
  const buckets = input.primaryObjectBucketInventories;
  if (
    !buckets ||
    typeof buckets !== 'object' ||
    Array.isArray(buckets) ||
    Object.keys(buckets).length !== databaseNames.length ||
    !databaseNames.every((name) => Object.hasOwn(buckets, name))
  )
    fail(
      'primaryObjectBucketInventories must measure all four primary buckets',
    );
  let retainedVersions = 0;
  let requestsPerScan = 0;
  for (const name of databaseNames) {
    const bucket = buckets[name];
    const versions = nonNegativeSafeInteger(
      bucket?.retainedVersionCount,
      `primaryObjectBucketInventories.${name}.retainedVersionCount`,
    );
    const requests = nonNegativeSafeInteger(
      bucket?.requestsPerCompleteScan,
      `primaryObjectBucketInventories.${name}.requestsPerCompleteScan`,
    );
    // R2/S3 ListObjectsV2 returns at most 1,000 keys. An empty bucket still
    // needs a request; short pages/retries require a larger measured count.
    if (requests < Math.max(1, Math.ceil(versions / 1_000)))
      fail(
        `primary bucket ${name} scan requests must cover every inventory page`,
      );
    retainedVersions += versions;
    requestsPerScan += requests;
  }
  if (retainedVersions !== input.primaryObjectRetainedVersionCount)
    fail(
      'primary bucket inventories must cover the complete retained object version inventory',
    );
  nonNegativeSafeInteger(
    requestsPerScan,
    'complete inventory scan request count',
  );
  const requiredPrimaryBucketInventories =
    ((sizing.monthlyHours * 60) /
      sizing.recovery.objectReconciliationIntervalMinutes) *
    requestsPerScan;
  if (
    input.primaryObjectClassBRequests <
    input.primaryObjectMonthlyVersionChurnCount
  )
    fail('primary object read requests must cover every recovery copy');
  const requiredPrimaryClassARequests =
    requiredPrimaryBucketInventories +
    input.primaryObjectMonthlyVersionChurnCount;
  if (input.primaryObjectClassARequests < requiredPrimaryClassARequests)
    fail(
      `primary object Class A requests must cover at least ${requiredPrimaryClassARequests} scheduled inventory pages and measured version writes`,
    );
  if (
    input.primaryObjectEgressGb <
    input.primaryObjectApplicationEgressGb +
      input.primaryObjectMonthlyVersionChurnGb
  )
    fail(
      'primaryObjectEgressGb must cover measured application delivery and recovery copies',
    );

  if (
    input.postgresStorageGb !== sizing.postgres.storageGb ||
    input.postgresPlanId !== sizing.postgres.planId
  )
    fail('PostgreSQL storage and plan must match candidate-sizing.json');
  if (input.kmsBillableKeyVersions < 6)
    fail(
      'kmsBillableKeyVersions must price both keys and two annual rotations',
    );
  const annualReencryption = input.annualReencryption;
  const annualEnvironments = ['studio-production', 'studio-staging'];
  if (
    !annualReencryption ||
    typeof annualReencryption !== 'object' ||
    Array.isArray(annualReencryption) ||
    Object.keys(annualReencryption).length !== annualEnvironments.length ||
    !annualEnvironments.every((name) => Object.hasOwn(annualReencryption, name))
  )
    fail('annualReencryption must measure both Studio environments');
  let annualReencryptionKmsRequests = 0;
  let annualReencryptionComputeGbSeconds = 0;
  for (const name of annualEnvironments) {
    const measurement = annualReencryption[name];
    const recordCount = nonNegativeSafeInteger(
      measurement?.recordCount,
      `annualReencryption.${name}.recordCount`,
    );
    const batchSize = nonNegativeSafeInteger(
      measurement?.batchSize,
      `annualReencryption.${name}.batchSize`,
    );
    const batchInvocationCount = nonNegativeSafeInteger(
      measurement?.batchInvocationCount,
      `annualReencryption.${name}.batchInvocationCount`,
    );
    const verificationInvocationCount = nonNegativeSafeInteger(
      measurement?.verificationInvocationCount,
      `annualReencryption.${name}.verificationInvocationCount`,
    );
    const configuredRootCount = nonNegativeSafeInteger(
      measurement?.configuredRootCount,
      `annualReencryption.${name}.configuredRootCount`,
    );
    const computeGbSeconds = finiteNonNegative(
      measurement?.computeGbSeconds,
      `annualReencryption.${name}.computeGbSeconds`,
    );
    if (
      batchSize < 1 ||
      batchSize > 100 ||
      batchInvocationCount < Math.floor(recordCount / batchSize) + 1 ||
      verificationInvocationCount < 1 ||
      configuredRootCount < 1 ||
      computeGbSeconds === 0
    )
      fail(
        `annualReencryption.${name} must cover bounded traversal, the terminal page, final verification, every configured root, and measured compute`,
      );
    annualReencryptionKmsRequests +=
      (batchInvocationCount + verificationInvocationCount) *
      configuredRootCount;
    annualReencryptionComputeGbSeconds += computeGbSeconds;
  }
  nonNegativeSafeInteger(
    annualReencryptionKmsRequests,
    'annualReencryptionKmsRequests',
  );
  finiteNonNegative(
    annualReencryptionComputeGbSeconds,
    'annualReencryptionComputeGbSeconds',
  );

  const drillQuantities = {};
  let monthlyDrillReceiptRequests = 0;
  let monthlyDrillReceiptReadGb = 0;
  let retainedDrillReceiptGb = 0;
  if (
    !input.restoreDrills ||
    Object.keys(input.restoreDrills).length !== DRILL_MODES.length
  )
    fail(
      'restoreDrills must measure both PITR and independent quarterly recovery',
    );
  for (const mode of DRILL_MODES) {
    const drill = input.restoreDrills[mode];
    if (
      !drill ||
      !drill.services ||
      Object.keys(drill.services).length !== databaseNames.length ||
      !databaseNames.every((name) => Object.hasOwn(drill.services, name))
    )
      fail(`${mode} drill must restore all four databases and object stores`);
    for (const field of [
      'runsPerQuarter',
      'durationHours',
      'computeGbSeconds',
      'requestCount',
      'databaseSourceRequestCount',
      'databaseSourceTransferGb',
      'objectSourceRequestCount',
      'objectSourceTransferGb',
      'runnerTransferGb',
      'scratchStorageGb',
      'receiptSizeBytes',
      'receiptRequestCount',
    ]) {
      if (finiteNonNegative(drill[field], `${mode} drill ${field}`) === 0)
        fail(`${mode} drill ${field} must be a positive measurement`);
    }
    if (!Number.isSafeInteger(drill.runsPerQuarter))
      fail(`${mode} drill runsPerQuarter must be an integer`);
    let databaseStorageGb = 0;
    let objectGb = 0;
    let objectCount = 0;
    for (const name of databaseNames) {
      const service = drill.services[name];
      const databaseGb = finiteNonNegative(
        service?.databaseStorageGb,
        `${mode} drill ${name} databaseStorageGb`,
      );
      const restoredGb = finiteNonNegative(
        service?.objectRestoreGb,
        `${mode} drill ${name} objectRestoreGb`,
      );
      const count = nonNegativeSafeInteger(
        service?.objectRestoreCount,
        `${mode} drill ${name} objectRestoreCount`,
      );
      if (
        databaseGb < expandedSizes[name] ||
        count < buckets[name].retainedVersionCount ||
        (count > 0 && restoredGb === 0)
      )
        fail(
          `${mode} drill ${name} must cover its database and retained object inventory`,
        );
      databaseStorageGb += databaseGb;
      objectGb += restoredGb;
      objectCount += count;
    }
    const payloadGb = dumpTotalGb + objectGb;
    // Includes four database archives, every retained object, and at least one
    // proof/checkpoint discovery read per logical store. Paged reads and retries
    // increase these measured totals; encrypted-envelope bytes must be measured.
    if (
      objectGb < input.primaryObjectRetainedVersionGb ||
      drill.databaseSourceRequestCount < 2 * databaseNames.length ||
      drill.databaseSourceTransferGb < dumpTotalGb ||
      drill.objectSourceRequestCount < objectCount ||
      drill.objectSourceTransferGb < objectGb ||
      drill.runnerTransferGb <
        drill.databaseSourceTransferGb +
          drill.objectSourceTransferGb +
          (2 * drill.receiptSizeBytes) / 1_000_000_000 ||
      drill.scratchStorageGb < payloadGb
    )
      fail(
        `${mode} drill transfer, requests, and scratch storage must cover the complete recovery inventory`,
      );
    const monthlyRuns =
      drill.runsPerQuarter / sizing.recovery.restoreDrillIntervalMonths;
    if (
      !Number.isSafeInteger(drill.receiptSizeBytes) ||
      !Number.isSafeInteger(drill.receiptRequestCount) ||
      drill.receiptRequestCount < 2
    )
      fail(
        `${mode} drill receipt requires immutable publication and independent readback`,
      );
    monthlyDrillReceiptRequests += monthlyRuns * drill.receiptRequestCount;
    monthlyDrillReceiptReadGb +=
      (monthlyRuns * drill.receiptSizeBytes) / 1_000_000_000;
    retainedDrillReceiptGb +=
      (Math.ceil(
        sizing.recovery.retentionDays /
          (sizing.recovery.restoreDrillIntervalMonths * 28),
      ) *
        drill.runsPerQuarter *
        drill.receiptSizeBytes) /
      1_000_000_000;
    const perDrill = {
      'compute': drill.computeGbSeconds,
      'requests': drill.requestCount,
      'database-source-requests': drill.databaseSourceRequestCount,
      'database-source-transfer': drill.databaseSourceTransferGb,
      'object-source-requests': drill.objectSourceRequestCount,
      'object-source-transfer': drill.objectSourceTransferGb,
      'runner-transfer': drill.runnerTransferGb,
      'database-hours': databaseNames.length * drill.durationHours,
      'database-storage': databaseStorageGb * drill.durationHours,
      'scratch-storage': drill.scratchStorageGb * drill.durationHours,
    };
    for (const [unit, quantity] of Object.entries(perDrill)) {
      drillQuantities[`${mode}-drill-${unit}`] = quantity * monthlyRuns;
    }
  }

  for (const [field, extra] of Object.entries({
    backupRequestCount: monthlyDrillReceiptRequests,
    backupEgressGb: monthlyDrillReceiptReadGb,
    backupStoredGb: retainedDrillReceiptGb,
  })) {
    if (input[field] < recoveryMinimums[field] + extra)
      fail(
        `${field} must also cover quarterly drill receipt publication, readback, and locked retention`,
      );
  }

  // Bind the quote's billing units to the declared estate and measured usage.
  // Keeping an independent editable quantity would let a four-service estate
  // claim zero compute cost or price only a fraction of its recovery traffic.
  const quantities = {
    ...drillQuantities,
    'compute': input.flySingletonCount * input.flyMonthlyHours,
    'fly-egress': input.flyEgressGb,
    'database-plan': 1,
    'database-storage': input.postgresStorageGb,
    'database-transfer': input.databaseTransferGb,
    'primary-object-storage': input.primaryObjectRetainedVersionGb,
    'primary-object-class-a': input.primaryObjectClassARequests / 1_000_000,
    'primary-object-class-b': input.primaryObjectClassBRequests / 1_000_000,
    'primary-object-egress': input.primaryObjectEgressGb,
    'kms-keys': input.kmsBillableKeyVersions,
    'kms-requests': input.kmsRequestCount,
    'annual-reencryption-kms-requests': annualReencryptionKmsRequests / 12,
    'annual-reencryption-compute': annualReencryptionComputeGbSeconds / 12,
    'backup-storage': input.backupStoredGb / 1_000,
    'backup-requests': input.backupRequestCount,
    'backup-egress': input.backupEgressGb,
    'validator-compute':
      input.validatorRunCount *
        input.validatorMemoryGb *
        input.validatorDurationSeconds +
      input.objectScrubRunCount *
        input.objectScrubMemoryGb *
        input.objectScrubDurationSeconds +
      input.primaryObjectMonthlyVersionChurnCount *
        input.objectCopyValidationMemoryGb *
        input.objectCopyValidationDurationSeconds +
      objectReconciliations *
        input.objectReconciliationMemoryGb *
        input.objectReconciliationDurationSeconds,
    'validator-requests': input.validatorRequestCount,
    'validator-transfer': input.validatorTransferGb,
    'mail': 1,
    'mail-overage': Math.max(
      0,
      input.postmarkMessageCount - input.postmarkIncludedMessages,
    ),
    'monitoring': 1,
    'monitoring-collector-compute': input.monitoringCollectorMonthlyHours,
    'monitoring-collector-storage': input.monitoringCollectorStorageGb,
    'monitoring-collector-egress': input.monitoringCollectorEgressGb,
    'monitoring-anchor-http-requests': input.monitoringAnchorHttpRequestCount,
    'monitoring-anchor-compute': input.monitoringAnchorComputeGbSeconds,
    'monitoring-anchor-database-reads':
      input.monitoringAnchorDatabaseReadRequestUnits,
    'monitoring-anchor-database-writes':
      input.monitoringAnchorDatabaseWriteRequestUnits,
    'monitoring-anchor-storage': input.monitoringAnchorStorageGb,
    'dns': 1,
    'primary-ingress': 1,
    'primary-ingress-requests': input.workerMonthlyRequestCount,
    'primary-ingress-cpu': input.workerMonthlyCpuMilliseconds,
    'primary-ingress-websocket': input.workerMonthlyWebSocketMinutes,
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

  // Accrue quarterly work monthly, but also enforce the cash cost of the
  // month when both mandatory drill paths run. An average cannot hide a breach.
  const monthlyReceiptUsd =
    monthlyDrillReceiptRequests *
      input.lineItems.find((row) => row.category === 'backup-requests')
        .unitPriceUsd +
    monthlyDrillReceiptReadGb *
      input.lineItems.find((row) => row.category === 'backup-egress')
        .unitPriceUsd;
  const monthlyDrillUsd =
    monthlyReceiptUsd +
    [...subtotals]
      .filter(([category]) => category.includes('-drill-'))
      .reduce((sum, [, amount]) => sum + amount, 0);
  const monthlyAnnualReencryptionUsd =
    subtotals.get('annual-reencryption-kms-requests') +
    subtotals.get('annual-reencryption-compute');
  const peakSubtotalUsd =
    subtotalUsd +
    monthlyDrillUsd * (sizing.recovery.restoreDrillIntervalMonths - 1) +
    monthlyAnnualReencryptionUsd * 11;
  const peakMonthUsd = Math.round(peakSubtotalUsd * 100) / 100;
  const totalUsd = Math.round(subtotalUsd * 100) / 100;
  const headroomUsd =
    Math.round((input.monthlyCapUsd - peakSubtotalUsd) * 100) / 100;
  const minimumHeadroomUsd = finiteNonNegative(
    input.minimumHeadroomUsd,
    'minimumHeadroomUsd',
  );
  const withinCap = peakSubtotalUsd <= input.monthlyCapUsd;
  if (requireBudget && subtotals.get('reserve') === 0)
    fail('the budget check must price a non-zero recovery reserve');
  if (requireBudget && !withinCap)
    fail(
      `peak monthly total $${peakMonthUsd.toFixed(2)} exceeds the $100.00 cap`,
    );
  if (
    requireBudget &&
    input.monthlyCapUsd - peakSubtotalUsd < minimumHeadroomUsd
  )
    fail(
      `monthly headroom $${headroomUsd.toFixed(2)} is below the explicit minimum`,
    );
  if (requireBudget) {
    if (!Number.isFinite(now)) fail('pricing review time is invalid');
    requireSelectedIdentifier(postmarkPlanRef, 'postmarkPlanRef');
    requireSelectedIdentifier(workerTierId, 'workerTierId');
    const usage = {
      postmarkPlanRef,
      postmarkIncludedMessages: input.postmarkIncludedMessages,
      workerTierId,
      monitoringCollectorRegion,
      monitoringCollectorCpuKind,
      monitoringCollectorCpus: input.monitoringCollectorCpus,
      monitoringCollectorMemoryMb: input.monitoringCollectorMemoryMb,
      monitoringAnchorRegion,
    };
    for (const item of input.lineItems)
      verifyPricingDeclaration(item, now, usage);
  }

  return {
    totalUsd,
    peakMonthUsd,
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
