// What an upgrade has to leave alone: the schema 8 protocols and interviews a
// deployment already holds, judged from two readings of its database — one
// taken on the released image before the swap, one on the pending image after
// it.
//
// Fresco no longer upgrades stored protocols or interviews when a new version
// starts (scripts/setup-database.ts runs only the Prisma migrations and the
// categorical-answer clean-up). A schema 8 protocol stays at schema 8, and so
// does every interview recorded against it, which then runs in the schema 8
// interview Fresco bundles. So every oracle here says the same thing from a
// different side: what was stored is still stored, exactly.
//
// Pure and free of Playwright and Docker, so each oracle is exercised on
// synthetic readings in
// `scripts/release-test/fresco-release-test-lane-contracts.test.mjs` and shown
// failing there on readings that break the behaviour it guards. The lane
// (migration-lane.mjs) takes the readings.
//
// A reading is `{ protocols: [{ id, name, hash, schemaVersion, description,
// importedAt, lastModified, stages, codebook }], interviews: [{ id,
// protocolId, participantId, startTime, finishTime, currentStep, isSynthetic,
// finishStageId, finishOutcome, network, stageMetadata }] }`, every value as
// stored. The finish columns exist only from the schema 9 release on, so a
// reading of an older database holds them as null.

/** The schema the protocols this upgrade carries across were stored at. */
export const KEPT_SCHEMA = 8;

/**
 * The protocol columns an upgrade must not touch. `hash` is what the
 * duplicate check reads, so a protocol re-hashed by different code would let
 * the same file in twice; `stages` and `codebook` are the protocol itself.
 */
const PROTOCOL_FIELDS = [
  'name',
  'hash',
  'schemaVersion',
  'description',
  'importedAt',
  'lastModified',
  'stages',
  'codebook',
];

/**
 * The interview columns an upgrade must not touch, network and stage records
 * aside (compared entity by entity, so a failure names what was lost).
 * `exportTime` and `lastUpdated` are left out: the seed exports every
 * interview after taking its reading, which moves both.
 */
const INTERVIEW_FIELDS = [
  'protocolId',
  'participantId',
  'startTime',
  'finishTime',
  'currentStep',
  'isSynthetic',
];

const isRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stagesOf = (protocol) =>
  Array.isArray(protocol?.stages) ? protocol.stages.filter(isRecord) : [];

// Postgres stores JSON as jsonb, which keeps an object's keys in its own
// order rather than the order they were written in, so two readings of the
// same value can list them differently. Keys are sorted before comparing;
// array order still counts.
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : isRecord(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;

const sameJson = (a, b) =>
  JSON.stringify(canonical(a ?? null)) === JSON.stringify(canonical(b ?? null));

const shown = (value) => {
  const text = JSON.stringify(value ?? null);
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
};

/**
 * Every protocol of `before` is still stored, at the schema it was stored at,
 * with its name, hash, stages and codebook exactly as they were. The readings
 * must hold a schema 8 protocol: without one, keeping schema 8 went untested.
 */
export function protocolKeptProblems(before, after) {
  const problems = [];
  const afterById = new Map(after.protocols.map((p) => [p.id, p]));
  for (const protocol of before.protocols) {
    const now = afterById.get(protocol.id);
    if (!now) {
      problems.push(`protocol "${protocol.name}" is no longer stored`);
      continue;
    }
    for (const field of PROTOCOL_FIELDS)
      if (!sameJson(protocol[field], now[field]))
        problems.push(
          field === 'schemaVersion'
            ? `protocol "${protocol.name}" was stored as schema ${protocol.schemaVersion} and is now stored as schema ${now.schemaVersion}`
            : `protocol "${protocol.name}"'s ${field} changed in the upgrade (was ${shown(protocol[field])}, is now ${shown(now[field])})`,
        );
  }
  if (before.protocols.length === 0)
    problems.push('the reading before the upgrade holds no protocols at all');
  else if (!before.protocols.some((p) => p.schemaVersion === KEPT_SCHEMA))
    problems.push(
      `the reading before the upgrade holds no schema ${KEPT_SCHEMA} protocol, so keeping one went untested`,
    );
  return problems;
}

const entitiesOf = (network, key) =>
  isRecord(network) && Array.isArray(network[key])
    ? network[key].filter(isRecord)
    : [];

/**
 * What changed between two networks, entity by entity and field by field.
 * Named rather than hashed, so a failure says what the upgrade lost. With
 * `entitiesOnly`, the ego and the network's other fields are left out, for a
 * caller comparing a part of a network it has picked out itself.
 */
function networkChanges(before, after, { entitiesOnly = false } = {}) {
  const changes = [];
  const compareFields = (label, was, now) => {
    for (const field of new Set([...Object.keys(was), ...Object.keys(now)])) {
      if (field === 'attributes') {
        const wasAttributes = isRecord(was.attributes) ? was.attributes : {};
        const nowAttributes = isRecord(now.attributes) ? now.attributes : {};
        for (const key of new Set([
          ...Object.keys(wasAttributes),
          ...Object.keys(nowAttributes),
        ]))
          if (!sameJson(wasAttributes[key], nowAttributes[key]))
            changes.push(
              `${label}'s ${key} was ${shown(wasAttributes[key])}, is now ${shown(nowAttributes[key])}`,
            );
        continue;
      }
      // Every persisted field, not only the public attributes: encrypted
      // values (`_secureAttributes`) and where each came from (`stageId`,
      // `promptIDs`) have to survive too.
      if (!sameJson(was[field], now[field]))
        changes.push(
          `${label}'s ${field} was ${shown(was[field])}, is now ${shown(now[field])}`,
        );
    }
  };
  if (!entitiesOnly)
    compareFields(
      'the ego',
      isRecord(before?.ego) ? before.ego : {},
      isRecord(after?.ego) ? after.ego : {},
    );
  const networkBefore = isRecord(before) ? before : {};
  const networkAfter = isRecord(after) ? after : {};
  if (!entitiesOnly)
    for (const field of new Set([
      ...Object.keys(networkBefore),
      ...Object.keys(networkAfter),
    ]))
      if (
        !['nodes', 'edges', 'ego'].includes(field) &&
        !sameJson(networkBefore[field], networkAfter[field])
      )
        changes.push(
          `the network's ${field} was ${shown(networkBefore[field])}, is now ${shown(networkAfter[field])}`,
        );
  for (const key of ['nodes', 'edges']) {
    const noun = key === 'nodes' ? 'node' : 'edge';
    const now = entitiesOf(after, key);
    // Each id once: a second copy would hide behind the first below.
    const counts = new Map();
    for (const entity of now)
      counts.set(entity._uid, (counts.get(entity._uid) ?? 0) + 1);
    for (const [id, count] of counts)
      if (count > 1) changes.push(`${noun} ${id} is stored ${count} times`);
    const nowById = new Map(now.map((entity) => [entity._uid, entity]));
    const wasIds = new Set();
    for (const was of entitiesOf(before, key)) {
      wasIds.add(was._uid);
      const label = `${noun} ${was._uid} (${was.type})`;
      const kept = nowById.get(was._uid);
      if (!kept) changes.push(`${label} is gone`);
      else compareFields(label, was, kept);
    }
    for (const entity of now)
      if (!wasIds.has(entity._uid))
        changes.push(`${noun} ${entity._uid} (${entity.type}) was added`);
  }
  return changes;
}

/**
 * Every interview of `before` is still stored against the same protocol, at
 * the step it was on, with every answer, every stage record and its start and
 * finish times exactly as they were, and has not been given a finish stage or
 * outcome: a schema 8 interview records neither, so any value there was
 * invented. Nothing else has been added. Each change is named.
 */
export function interviewKeptProblems(before, after) {
  const problems = [];
  const afterById = new Map(after.interviews.map((i) => [i.id, i]));
  for (const interview of before.interviews) {
    const now = afterById.get(interview.id);
    const who = `interview ${interview.id}`;
    if (!now) {
      problems.push(`${who} is no longer stored`);
      continue;
    }
    for (const field of INTERVIEW_FIELDS)
      if (!sameJson(interview[field], now[field]))
        problems.push(
          field === 'currentStep'
            ? `${who} was on step ${interview.currentStep} and now resumes at step ${now.currentStep}`
            : `${who}'s ${field} changed in the upgrade (was ${shown(interview[field])}, is now ${shown(now[field])})`,
        );
    const changes = networkChanges(interview.network, now.network);
    if (changes.length)
      problems.push(
        `${who}'s answers changed in the upgrade: ${changes.join('; ')}`,
      );
    // Each stage record, contents and all: a record holds answers too (a
    // census question answered "no", a pedigree's members), so one kept under
    // the right step with its contents changed is still lost.
    const recordsBefore = isRecord(interview.stageMetadata)
      ? interview.stageMetadata
      : {};
    const recordsAfter = isRecord(now.stageMetadata) ? now.stageMetadata : {};
    for (const step of new Set([
      ...Object.keys(recordsBefore),
      ...Object.keys(recordsAfter),
    ]))
      if (!sameJson(recordsBefore[step], recordsAfter[step]))
        problems.push(
          `${who}'s stage record at step ${step} was ${shown(recordsBefore[step])}, is now ${shown(recordsAfter[step])}`,
        );
    if (
      (now.finishOutcome ?? null) !== (interview.finishOutcome ?? null) ||
      (now.finishStageId ?? null) !== (interview.finishStageId ?? null)
    )
      problems.push(
        `${who} was given an outcome ("${now.finishOutcome}" at "${now.finishStageId}") that nothing recorded before the upgrade`,
      );
  }
  const beforeIds = new Set(before.interviews.map((i) => i.id));
  for (const interview of after.interviews)
    if (!beforeIds.has(interview.id))
      problems.push(
        `interview ${interview.id} appeared in the upgrade, recorded against protocol ${interview.protocolId}`,
      );
  if (before.interviews.length === 0)
    problems.push('the reading before the upgrade holds no interviews at all');
  return problems;
}

/**
 * The Family Pedigree stages of a protocol, with the person and relationship
 * types each records a family in, and the step each is at.
 */
const pedigreesOf = (protocol) =>
  stagesOf(protocol).flatMap((stage, step) =>
    stage.type === 'FamilyPedigree'
      ? [
          {
            step,
            id: stage.id,
            personType: stage.nodeConfig?.type,
            edgeType: stage.edgeConfig?.type,
          },
        ]
      : [],
  );

/**
 * Every Family Pedigree family recorded before the upgrade is stored after it
 * exactly as it was: each person and each relationship with every attribute,
 * and the pedigree's schema 8 stage record (its membership list and
 * `isNetworkCommitted`), which the schema 8 interview reads when the
 * participant comes back to it. The schema 9 migration rewrote both, so this
 * is the one place an accidental upgrade would show first.
 *
 * The readings must hold at least one interview whose family has someone in
 * it besides the participant, and a relationship: without one, nothing here
 * was tested.
 */
export function familyKeptProblems(before, after) {
  const problems = [];
  let families = 0;
  const protocols = new Map(before.protocols.map((p) => [p.id, p]));
  const afterById = new Map(after.interviews.map((i) => [i.id, i]));
  for (const interview of before.interviews) {
    const now = afterById.get(interview.id);
    if (!now) continue; // interviewKeptProblems reports it
    for (const pedigree of pedigreesOf(protocols.get(interview.protocolId))) {
      const who = `interview ${interview.id}'s "${pedigree.id}" pedigree`;
      const typesOf = (network) =>
        new Map(
          entitiesOf(network, 'nodes').map((node) => [node._uid, node.type]),
        );
      const typesBefore = typesOf(interview.network);
      const typesAfter = typesOf(now.network);
      const inFamily = (types) => (entity) =>
        'from' in entity
          ? entity.type === pedigree.edgeType &&
            types.get(entity.from) === pedigree.personType &&
            types.get(entity.to) === pedigree.personType
          : entity.type === pedigree.personType;
      const people = entitiesOf(interview.network, 'nodes').filter(
        inFamily(typesBefore),
      );
      const relationships = entitiesOf(interview.network, 'edges').filter(
        inFamily(typesBefore),
      );
      if (people.length > 1 && relationships.length > 0) families += 1;
      // Each side read with its own node types, so a person retyped in the
      // upgrade leaves the family on one side and is named as gone.
      const changes = networkChanges(
        {
          nodes: people,
          edges: relationships,
        },
        {
          nodes: entitiesOf(now.network, 'nodes').filter(inFamily(typesAfter)),
          edges: entitiesOf(now.network, 'edges').filter(inFamily(typesAfter)),
        },
        { entitiesOnly: true },
      );
      for (const change of changes) problems.push(`${who}: ${change}`);
      const step = String(pedigree.step);
      const record = isRecord(interview.stageMetadata)
        ? interview.stageMetadata[step]
        : undefined;
      const recordAfter = isRecord(now.stageMetadata)
        ? now.stageMetadata[step]
        : undefined;
      if (!sameJson(record, recordAfter))
        problems.push(
          `${who}'s stage record was ${shown(record)} before the upgrade and is ${shown(recordAfter)} after it`,
        );
    }
  }
  if (families === 0)
    problems.push(
      'no interview held a Family Pedigree family before the upgrade, so nothing showed that one survives it',
    );
  return problems;
}
