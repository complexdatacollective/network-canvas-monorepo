// What the schema 8 to 9 upgrade has to do to the protocols and interviews a
// deployment already holds, judged from two readings of its database: one
// taken on the released image before the swap, one on the pending image
// after it.
//
// Pure and free of Playwright and Docker, so each oracle is exercised on
// synthetic readings in
// `scripts/release-test/fresco-release-test-lane-contracts.test.mjs` and shown
// failing there on readings that break the behaviour it guards. The lane
// (migration-lane.mjs) takes the readings; diff-exports.mjs uses the stage
// mapping to tell an interview that resumes where it was from one that moved.
//
// A reading is `{ protocols: [{ id, name, schemaVersion, stages }],
// interviews: [{ id, protocolId, currentStep, finishTime, finishStageId,
// finishOutcome, network, stageMetadata }] }`, with each protocol's `stages`
// and each interview's `network` and `stageMetadata` as stored.

import { escapeMessageText } from '../../../../packages/protocol-validation/src/localization/messageSyntax.ts';

/** The first schema whose protocols declare languages and finish stages. */
export const MIGRATED_SCHEMA = 9;

/** The language the migration records an older protocol's text in. */
const MIGRATED_LOCALE = 'en';

const isRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stagesOf = (protocol) =>
  Array.isArray(protocol?.stages) ? protocol.stages.filter(isRecord) : [];

/**
 * The step a session at `step` of `before` resumes at in `after`, by the id of
 * the stage it was on. A session on the old finish screen — one past the last
 * stage, where schema 8 kept it — resumes on the first finish stage the
 * migration gave the protocol. `null` when the stage it was on no longer
 * exists, or the step pointed at nothing at all.
 */
export function expectedStep(before, after, step) {
  const beforeStages = stagesOf(before);
  const afterStages = stagesOf(after);
  if (!Number.isInteger(step) || step < 0) return null;
  if (step === beforeStages.length) {
    const finish = afterStages.findIndex(
      (stage) => stage.type === 'FinishSession',
    );
    return finish === -1 ? null : finish;
  }
  const id = beforeStages[step]?.id;
  if (typeof id !== 'string') return null;
  const index = afterStages.findIndex((stage) => stage.id === id);
  return index === -1 ? null : index;
}

/**
 * A session's stage metadata, keyed by stage index, re-keyed onto `after`'s
 * indices by stage id — what the migration has to do to it. `null` when a key
 * names a stage that has no counterpart.
 */
export function remapStageMetadata(metadata, before, after) {
  if (!isRecord(metadata)) return metadata;
  const remapped = {};
  for (const [key, value] of Object.entries(metadata)) {
    const step = expectedStep(before, after, Number(key));
    if (step === null || String(Number(key)) !== key) return null;
    remapped[String(step)] = value;
  }
  return remapped;
}

/** Every protocol of `before` is still stored, now as a schema 9 protocol
 * that ends at a finish stage. */
export function protocolMigrationProblems(before, after) {
  const problems = [];
  const afterById = new Map(after.protocols.map((p) => [p.id, p]));
  for (const protocol of before.protocols) {
    const migrated = afterById.get(protocol.id);
    if (!migrated) {
      problems.push(`protocol "${protocol.name}" is no longer stored`);
      continue;
    }
    if (migrated.schemaVersion !== MIGRATED_SCHEMA)
      problems.push(
        `protocol "${protocol.name}" is stored as schema ${migrated.schemaVersion}, not ${MIGRATED_SCHEMA}`,
      );
    const stages = stagesOf(migrated);
    if (stages.at(-1)?.type !== 'FinishSession')
      problems.push(
        `protocol "${protocol.name}" does not end at a finish stage (its last stage is ${stages.at(-1)?.type ?? 'missing'})`,
      );
  }
  if (before.protocols.length === 0)
    problems.push('the reading before the upgrade holds no protocols at all');
  return problems;
}

const message = (text) => ({ [MIGRATED_LOCALE]: escapeMessageText(text) });

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Every introduction panel of `before` became what schema 9 makes of it:
 * an Information stage just before its stage, titled and named with the
 * panel's title and showing its text, with the stage's skip logic; an Ego
 * Form's title becomes the form's title, and its text — when it has any — an
 * Information stage before it. No stage carries a panel any more.
 *
 * Panels whose title or text is blank are outside this oracle: the migration
 * gives them a fallback title, which is its own rule, and the fixtures this
 * lane seeds write every panel out in full.
 *
 * The skip logic has to be the stage's own rule, unchanged, on both the
 * Information stage and the stage after it: a panel was shown only when its
 * stage was, so an Information stage that skipped on another rule, or on
 * none, would show a participant an introduction to a stage they never reach
 * (or hide one from a stage they do). Two stages that merely agree with each
 * other prove nothing if the rule itself was lost, so each is compared with
 * the rule stored before the upgrade, and the readings must hold at least one
 * panel whose stage had a rule — without one, carrying it over went untested.
 */
export function introductionPanelProblems(before, after) {
  const problems = [];
  let panels = 0;
  let rules = 0;
  const afterById = new Map(after.protocols.map((p) => [p.id, p]));
  for (const protocol of before.protocols) {
    const migrated = stagesOf(afterById.get(protocol.id));
    for (const stage of migrated)
      if ('introductionPanel' in stage)
        problems.push(
          `"${protocol.name}" stage "${stage.id}" still has an introduction panel`,
        );
    for (const stage of stagesOf(protocol)) {
      const panel = stage.introductionPanel;
      if (!isRecord(panel)) continue;
      if (typeof panel.title !== 'string' || !panel.title.trim()) continue;
      panels += 1;
      const where = `"${protocol.name}" stage "${stage.id}"`;
      const index = migrated.findIndex((s) => s.id === stage.id);
      if (index === -1) {
        problems.push(`${where} is gone`);
        continue;
      }
      if (stage.skipLogic !== undefined) {
        rules += 1;
        if (!sameJson(migrated[index].skipLogic, stage.skipLogic))
          problems.push(
            `${where}: the stage's skip logic is now ${JSON.stringify(migrated[index].skipLogic ?? null)}, not the rule it had before the upgrade`,
          );
      }
      const text =
        typeof panel.text === 'string' && panel.text.trim()
          ? panel.text
          : undefined;
      const isEgoForm = stage.type === 'EgoForm';
      if (
        isEgoForm &&
        !sameJson(migrated[index].form?.title, message(panel.title))
      )
        problems.push(
          `${where}: the form is titled ${JSON.stringify(migrated[index].form?.title)}, not its panel's title "${panel.title}"`,
        );
      if (isEgoForm && text === undefined) continue;
      const information = migrated[index - 1];
      const introductionId = `${stage.id}-introduction`;
      if (
        information?.type !== 'Information' ||
        information.id !== introductionId
      ) {
        problems.push(
          `${where} is not preceded by its Information stage "${introductionId}" (found ${information ? `${information.type} "${information.id}"` : 'nothing'})`,
        );
        continue;
      }
      if (!sameJson(information.title, message(panel.title)))
        problems.push(
          `${where}: its Information stage is titled ${JSON.stringify(information.title)}, not "${panel.title}"`,
        );
      const items = Array.isArray(information.items) ? information.items : [];
      if (
        text !== undefined &&
        !items.some(
          (item) =>
            item?.type === 'text' && sameJson(item.content, message(text)),
        )
      )
        problems.push(
          `${where}: its Information stage does not show the panel's text`,
        );
      if (!sameJson(information.skipLogic, stage.skipLogic))
        problems.push(
          `${where}: its Information stage does not take the stage's skip logic (it holds ${JSON.stringify(information.skipLogic ?? null)}, the stage had ${JSON.stringify(stage.skipLogic ?? null)})`,
        );
    }
  }
  if (panels === 0)
    problems.push(
      'the reading before the upgrade holds no introduction panel, so nothing was migrated',
    );
  else if (rules === 0)
    problems.push(
      'no introduction panel in the reading before the upgrade belongs to a stage with skip logic, so carrying a rule onto its Information stage went untested',
    );
  return problems;
}

/**
 * The Family Pedigree stages of a schema 8 protocol, with the attributes each
 * one records a family in, and the step each is at.
 */
const pedigreesOf = (protocol) =>
  stagesOf(protocol).flatMap((stage, step) => {
    if (stage.type !== 'FamilyPedigree') return [];
    const node = isRecord(stage.nodeConfig) ? stage.nodeConfig : {};
    const edge = isRecord(stage.edgeConfig) ? stage.edgeConfig : {};
    return [
      {
        step,
        id: stage.id,
        personType: node.type,
        nameAttribute: node.nodeLabelVariable,
        sexAttribute: node.biologicalSexVariable,
        edgeType: edge.type,
        kindAttribute: edge.relationshipTypeVariable,
        activeAttribute: edge.isActiveVariable,
        carrierAttribute: edge.isGestationalCarrierVariable,
      },
    ];
  });

const entitiesOf = (network, key) =>
  isRecord(network) && Array.isArray(network[key])
    ? network[key].filter(isRecord)
    : [];

const attributesOf = (entity) =>
  isRecord(entity?.attributes) ? entity.attributes : {};

/** Whether a node or edge is part of a pedigree's family. */
const inFamily = (pedigrees, entity, nodeTypes) =>
  pedigrees.some((pedigree) =>
    'from' in entity
      ? entity.type === pedigree.edgeType &&
        nodeTypes.get(entity.from) === pedigree.personType &&
        nodeTypes.get(entity.to) === pedigree.personType
      : entity.type === pedigree.personType,
  );

/**
 * What changed between two networks, entity by entity and attribute by
 * attribute, leaving out the ones `skip` says another oracle judges. Named
 * rather than hashed, so a failure says what the upgrade lost.
 */
function networkChanges(before, after, skip) {
  const changes = [];
  const compareAttributes = (label, was, now) => {
    for (const key of new Set([...Object.keys(was), ...Object.keys(now)]))
      if (!sameJson(was[key], now[key]))
        changes.push(
          `${label} ${key} was ${JSON.stringify(was[key] ?? null)}, is now ${JSON.stringify(now[key] ?? null)}`,
        );
  };
  compareAttributes(
    "the ego's",
    attributesOf(isRecord(before) ? before.ego : undefined),
    attributesOf(isRecord(after) ? after.ego : undefined),
  );
  for (const key of ['nodes', 'edges']) {
    const noun = key === 'nodes' ? 'node' : 'edge';
    const nowById = new Map(entitiesOf(after, key).map((e) => [e._uid, e]));
    const wasIds = new Set();
    for (const was of entitiesOf(before, key)) {
      wasIds.add(was._uid);
      if (skip(was, 'before')) continue;
      const now = nowById.get(was._uid);
      const label = `${noun} ${was._uid} (${was.type})`;
      if (!now) {
        changes.push(`${label} is gone`);
        continue;
      }
      for (const field of ['type', 'from', 'to'])
        if (!sameJson(was[field], now[field]))
          changes.push(
            `${label}'s ${field} was ${JSON.stringify(was[field] ?? null)}, is now ${JSON.stringify(now[field] ?? null)}`,
          );
      compareAttributes(`${label}'s`, attributesOf(was), attributesOf(now));
    }
    for (const now of entitiesOf(after, key))
      if (!wasIds.has(now._uid) && !skip(now, 'after'))
        changes.push(`${noun} ${now._uid} (${now.type}) was added`);
  }
  return changes;
}

const nodeTypesOf = (network) =>
  new Map(entitiesOf(network, 'nodes').map((node) => [node._uid, node.type]));

/**
 * Every interview of `before` is still stored against the same protocol,
 * resumes at the stage it was on (found by that stage's id in the migrated
 * protocol), keeps its answers and its stage records, and has not been given a
 * finish outcome nobody recorded. A Family Pedigree's family and its stage
 * record are left to `pedigreeMigrationProblems`, because the upgrade is meant
 * to change them; everything else in the network has to be exactly as it was,
 * and each change is named.
 */
export function interviewMigrationProblems(before, after) {
  const problems = [];
  const protocolsBefore = new Map(before.protocols.map((p) => [p.id, p]));
  const protocolsAfter = new Map(after.protocols.map((p) => [p.id, p]));
  const afterById = new Map(after.interviews.map((i) => [i.id, i]));
  for (const interview of before.interviews) {
    const migrated = afterById.get(interview.id);
    const who = `interview ${interview.id}`;
    if (!migrated) {
      problems.push(`${who} is no longer stored`);
      continue;
    }
    if (migrated.protocolId !== interview.protocolId)
      problems.push(`${who} moved to another protocol`);
    const protocolBefore = protocolsBefore.get(interview.protocolId);
    const protocolAfter = protocolsAfter.get(interview.protocolId);
    const step = expectedStep(
      protocolBefore,
      protocolAfter,
      interview.currentStep,
    );
    if (step === null)
      problems.push(
        `${who} was on step ${interview.currentStep}, which has no counterpart after the upgrade`,
      );
    else if (migrated.currentStep !== step)
      problems.push(
        `${who} resumes at step ${migrated.currentStep}, but the stage it was on (step ${interview.currentStep}) is now step ${step}`,
      );
    const pedigrees = pedigreesOf(protocolBefore);
    const typesBefore = nodeTypesOf(interview.network);
    const typesAfter = nodeTypesOf(migrated.network);
    const changes = networkChanges(
      interview.network,
      migrated.network,
      (entity, side) =>
        inFamily(
          pedigrees,
          entity,
          side === 'before' ? typesBefore : typesAfter,
        ),
    );
    if (changes.length)
      problems.push(
        `${who}'s answers changed in the upgrade: ${changes.join('; ')}`,
      );
    const pedigreeSteps = new Set(
      pedigrees.map((pedigree) => String(pedigree.step)),
    );
    const keysBefore = Object.keys(
      isRecord(interview.stageMetadata) ? interview.stageMetadata : {},
    ).filter((key) => !pedigreeSteps.has(key));
    const keys = remapStageMetadata(
      Object.fromEntries(keysBefore.map((key) => [key, true])),
      protocolBefore,
      protocolAfter,
    );
    const pedigreeStepsAfter = new Set(
      pedigrees.map((pedigree) =>
        String(expectedStep(protocolBefore, protocolAfter, pedigree.step)),
      ),
    );
    const byText = (a, b) => a.localeCompare(b);
    const expectedKeys = Object.keys(keys ?? {}).toSorted(byText);
    const actualKeys = Object.keys(
      isRecord(migrated.stageMetadata) ? migrated.stageMetadata : {},
    )
      .filter((key) => !pedigreeStepsAfter.has(key))
      .toSorted(byText);
    if (keys === null || !sameJson(expectedKeys, actualKeys))
      problems.push(
        `${who}'s stage records are kept under ${JSON.stringify(actualKeys)}, not ${JSON.stringify(expectedKeys)}`,
      );
    if (migrated.finishTime !== interview.finishTime)
      problems.push(`${who}'s finish time changed in the upgrade`);
    if (migrated.finishOutcome !== null || migrated.finishStageId !== null)
      problems.push(
        `${who} was given an outcome ("${migrated.finishOutcome}" at "${migrated.finishStageId}") that nothing recorded before the upgrade`,
      );
  }
  if (before.interviews.length === 0)
    problems.push('the reading before the upgrade holds no interviews at all');
  return problems;
}

/** The kinds of relationship that make one person another's parent. */
const PARENT_KINDS = new Set([
  'biological',
  'adoptive',
  'social',
  'donor',
  'surrogate',
]);

const firstValue = (value) => (Array.isArray(value) ? value[0] : value);

const isUnrecorded = (value) =>
  value === undefined ||
  value === null ||
  (Array.isArray(value) && value.length === 0);

/**
 * Every Family Pedigree family recorded before the upgrade is still there
 * after it, as the redesigned stage reads it, and the stage record is in the
 * shape that stage reads.
 *
 * Each person keeps every attribute recorded (name, the participant flag, the
 * relationship to the participant, the sex at birth), and may only GAIN a sex
 * at birth where none was recorded, which the upgrade works out from the
 * gamete they gave. Each relationship keeps its two ends and every attribute,
 * with two exceptions on a parent relationship, both of them what the
 * redesigned stage itself writes on one: schema 8's `isActive` flag, which
 * schema 9 reads as "current partner", may go, and a gestational carrier flag
 * left unrecorded may be recorded as false. A carrier recorded as true must
 * stay true, and a partner relationship keeps its current-partner flag.
 * Nobody joins the family except people and relationships the stage record
 * listed and the network lacked. Each loss is named, person by person and
 * relationship by relationship, so a failure says what the participant lost.
 *
 * The record itself keeps the participant's framing choice, if they made one,
 * and nothing else: a record still in the schema 8 shape (its membership list,
 * `isNetworkCommitted`) is one the redesigned stage would misread.
 *
 * The readings must hold at least one interview whose family has someone in
 * it besides the participant, and a relationship: without one, nothing here
 * was tested.
 */
export function pedigreeMigrationProblems(before, after) {
  const problems = [];
  let families = 0;
  const protocolsBefore = new Map(before.protocols.map((p) => [p.id, p]));
  const protocolsAfter = new Map(after.protocols.map((p) => [p.id, p]));
  const afterById = new Map(after.interviews.map((i) => [i.id, i]));
  for (const interview of before.interviews) {
    const migrated = afterById.get(interview.id);
    if (!migrated) continue; // interviewMigrationProblems reports it
    const protocolBefore = protocolsBefore.get(interview.protocolId);
    const protocolAfter = protocolsAfter.get(interview.protocolId);
    for (const pedigree of pedigreesOf(protocolBefore)) {
      const who = `interview ${interview.id}'s "${pedigree.id}" pedigree`;
      const record = isRecord(interview.stageMetadata)
        ? interview.stageMetadata[String(pedigree.step)]
        : undefined;
      const listed = new Set(
        ['nodes', 'edges'].flatMap((key) =>
          isRecord(record) && Array.isArray(record[key])
            ? record[key].filter(isRecord).map((entry) => entry.id)
            : [],
        ),
      );
      const people = entitiesOf(interview.network, 'nodes').filter(
        (node) => node.type === pedigree.personType,
      );
      const personIds = new Set(people.map((node) => node._uid));
      const relationships = entitiesOf(interview.network, 'edges').filter(
        (edge) =>
          edge.type === pedigree.edgeType &&
          personIds.has(edge.from) &&
          personIds.has(edge.to),
      );
      const nameOf = (node) => {
        const name = attributesOf(node)[pedigree.nameAttribute];
        return typeof name === 'string' && name !== ''
          ? `"${name}" (${node._uid})`
          : `person ${node._uid}`;
      };
      const label = new Map(people.map((node) => [node._uid, nameOf(node)]));
      if (people.length > 1 && relationships.length > 0) families += 1;

      const peopleAfter = new Map(
        entitiesOf(migrated.network, 'nodes')
          .filter((node) => node.type === pedigree.personType)
          .map((node) => [node._uid, node]),
      );
      for (const person of people) {
        const now = peopleAfter.get(person._uid);
        if (!now) {
          problems.push(`${who} lost ${label.get(person._uid)}`);
          continue;
        }
        const was = attributesOf(person);
        const is = attributesOf(now);
        for (const key of new Set([...Object.keys(was), ...Object.keys(is)])) {
          if (sameJson(was[key], is[key])) continue;
          if (key === pedigree.sexAttribute && isUnrecorded(was[key])) continue;
          problems.push(
            `${who}: ${label.get(person._uid)}'s ${key} was ${JSON.stringify(was[key] ?? null)}, is now ${JSON.stringify(is[key] ?? null)}`,
          );
        }
      }
      for (const id of peopleAfter.keys())
        if (!personIds.has(id) && !listed.has(id))
          problems.push(`${who} gained a person nobody recorded (${id})`);

      const edgesAfter = new Map(
        entitiesOf(migrated.network, 'edges')
          .filter((edge) => edge.type === pedigree.edgeType)
          .map((edge) => [edge._uid, edge]),
      );
      const relationshipIds = new Set();
      for (const edge of relationships) {
        relationshipIds.add(edge._uid);
        const was = attributesOf(edge);
        const kind = firstValue(was[pedigree.kindAttribute]);
        const what = `the ${kind ?? 'unnamed'} relationship from ${label.get(edge.from)} to ${label.get(edge.to)}`;
        const now = edgesAfter.get(edge._uid);
        if (!now) {
          problems.push(`${who} lost ${what}`);
          continue;
        }
        if (now.from !== edge.from || now.to !== edge.to)
          problems.push(`${who}: ${what} now joins ${now.from} to ${now.to}`);
        const is = attributesOf(now);
        const parent = typeof kind === 'string' && PARENT_KINDS.has(kind);
        for (const key of new Set([...Object.keys(was), ...Object.keys(is)])) {
          if (sameJson(was[key], is[key])) continue;
          if (
            parent &&
            key === pedigree.activeAttribute &&
            is[key] === undefined
          )
            continue;
          if (
            parent &&
            key === pedigree.carrierAttribute &&
            was[key] === undefined &&
            is[key] === false
          )
            continue;
          problems.push(
            `${who}: ${what} had ${key}=${JSON.stringify(was[key] ?? null)}, now ${JSON.stringify(is[key] ?? null)}`,
          );
        }
      }
      for (const [id, edge] of edgesAfter)
        if (
          !relationshipIds.has(id) &&
          !listed.has(id) &&
          personIds.has(edge.from) &&
          personIds.has(edge.to)
        )
          problems.push(`${who} gained a relationship nobody recorded (${id})`);
      for (const id of listed)
        if (!peopleAfter.has(id) && !edgesAfter.has(id))
          problems.push(
            `${who}: ${id}, listed in its stage record, is in neither the family nor its relationships after the upgrade`,
          );

      const step = expectedStep(protocolBefore, protocolAfter, pedigree.step);
      const recordAfter =
        step !== null && isRecord(migrated.stageMetadata)
          ? migrated.stageMetadata[String(step)]
          : undefined;
      const framing = isRecord(record) ? record.selectedFraming : undefined;
      const expectedRecord =
        framing === 'gamete' || framing === 'gendered'
          ? { framing }
          : undefined;
      if (record !== undefined && !sameJson(recordAfter, expectedRecord))
        problems.push(
          `${who}'s stage record is ${JSON.stringify(recordAfter ?? null)} after the upgrade, not ${JSON.stringify(expectedRecord ?? null)}${isRecord(recordAfter) && ('nodes' in recordAfter || 'isNetworkCommitted' in recordAfter) ? ' (still in the schema 8 shape)' : ''}`,
        );
    }
  }
  if (families === 0)
    problems.push(
      'no interview held a Family Pedigree family before the upgrade, so nothing showed that one survives it',
    );
  return problems;
}
