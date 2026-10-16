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
      // Compared whether or not the stage had a rule: a rule the upgrade
      // gave a stage that had none skips what was always shown.
      if (stage.skipLogic !== undefined) rules += 1;
      if (!sameJson(migrated[index].skipLogic, stage.skipLogic))
        problems.push(
          `${where}: the stage's skip logic is now ${JSON.stringify(migrated[index].skipLogic ?? null)}, not ${stage.skipLogic === undefined ? 'none, as' : 'the rule'} it had before the upgrade`,
        );
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
        gameteAttribute: edge.gameteRoleVariable,
        egoAttribute: node.egoVariable,
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

/** The top-level fields of two records, but their attributes (and `skip`). */
const fieldsOf = (was, now, skip = []) =>
  [...new Set([...Object.keys(was), ...Object.keys(now)])].filter(
    (field) => field !== 'attributes' && !skip.includes(field),
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
  const egoBefore = isRecord(before?.ego) ? before.ego : {};
  const egoAfter = isRecord(after?.ego) ? after.ego : {};
  for (const field of fieldsOf(egoBefore, egoAfter))
    if (!sameJson(egoBefore[field], egoAfter[field]))
      changes.push(
        `the ego's ${field} was ${JSON.stringify(egoBefore[field] ?? null)}, is now ${JSON.stringify(egoAfter[field] ?? null)}`,
      );
  compareAttributes(
    "the ego's",
    attributesOf(egoBefore),
    attributesOf(egoAfter),
  );
  const networkBefore = isRecord(before) ? before : {};
  const networkAfter = isRecord(after) ? after : {};
  for (const field of fieldsOf(networkBefore, networkAfter, [
    'nodes',
    'edges',
    'ego',
  ]))
    if (!sameJson(networkBefore[field], networkAfter[field]))
      changes.push(
        `the network's ${field} was ${JSON.stringify(networkBefore[field] ?? null)}, is now ${JSON.stringify(networkAfter[field] ?? null)}`,
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
      // Every persisted field, not only the public attributes: encrypted
      // values (`_secureAttributes`) and where each came from (`stageId`,
      // `promptIDs`) have to survive too.
      for (const field of fieldsOf(was, now))
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

/** Biological parents and gamete donors gave the child an egg or a sperm. */
const GENETIC_KINDS = new Set(['biological', 'donor']);

const SEX_FOR_GAMETE = { egg: 'female', sperm: 'male' };

const firstValue = (value) => (Array.isArray(value) ? value[0] : value);

const isUnrecorded = (value) =>
  value === undefined ||
  value === null ||
  (Array.isArray(value) && value.length === 0);

/** Attributes without the values schema 8 stored as null. */
const definedAttributes = (attributes) =>
  Object.fromEntries(
    Object.entries(isRecord(attributes) ? attributes : {}).filter(
      ([, value]) => value !== null && value !== undefined,
    ),
  );

/**
 * The family a schema 8 stage record held that its network lacked: the one
 * schema 8 path that finalized a pedigree in the record before writing it to
 * the network left the record as the only copy. Each person listed there and
 * missing from the network should come back under the record's id, with the
 * participant flag if they were the participant and their label as their
 * name (unless the name is encrypted, which only the interview can do); a
 * record's own participant missing from the network stands for the one
 * already there. Each relationship missing from the network should come back
 * between the people the record names, with the attributes it recorded,
 * unless the network already joins the same two people with the same kind.
 */
function restoredFamily(
  record,
  people,
  relationships,
  pedigree,
  nameEncrypted,
) {
  const restored = { people: new Map(), relationships: new Map() };
  if (!isRecord(record)) return restored;
  const ids = new Set(people.map((node) => node._uid));
  const ego = people.find(
    (node) => attributesOf(node)[pedigree.egoAttribute] === true,
  );
  const aliases = new Map();
  for (const entry of Array.isArray(record.nodes) ? record.nodes : []) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue;
    if (ids.has(entry.id) || restored.people.has(entry.id)) continue;
    if (entry.isEgo === true && ego) {
      aliases.set(entry.id, ego._uid);
      continue;
    }
    const attributes = {};
    if (entry.isEgo === true) attributes[pedigree.egoAttribute] = true;
    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    if (label && pedigree.nameAttribute && !nameEncrypted)
      attributes[pedigree.nameAttribute] = label;
    restored.people.set(entry.id, {
      _uid: entry.id,
      type: pedigree.personType,
      attributes,
    });
  }
  const resolve = (id) => aliases.get(id) ?? id;
  const known = (id) => ids.has(id) || restored.people.has(id);
  const edgeIds = new Set(relationships.map((edge) => edge._uid));
  const kindOf = (edge) =>
    firstValue(attributesOf(edge)[pedigree.kindAttribute]);
  for (const entry of Array.isArray(record.edges) ? record.edges : []) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue;
    if (edgeIds.has(entry.id) || restored.relationships.has(entry.id)) continue;
    const from = resolve(entry.from);
    const to = resolve(entry.to);
    if (!known(from) || !known(to)) continue;
    const edge = {
      _uid: entry.id,
      type: pedigree.edgeType,
      from,
      to,
      attributes: definedAttributes(entry.attributes),
    };
    const already = [...relationships, ...restored.relationships.values()].some(
      (other) =>
        ((other.from === from && other.to === to) ||
          (other.from === to && other.to === from)) &&
        kindOf(other) === kindOf(edge),
    );
    if (!already) restored.relationships.set(entry.id, edge);
  }
  return restored;
}

/**
 * What a relationship's attributes should be once the upgrade has given a
 * parent relationship what the redesigned stage writes on one: no current
 * partner flag (schema 8's `isActive`), and the gestational carrier flag as
 * true or false. A partner relationship keeps what was recorded.
 */
function expectedRelationshipAttributes(attributes, pedigree) {
  const kind = firstValue(attributes[pedigree.kindAttribute]);
  if (typeof kind !== 'string' || !PARENT_KINDS.has(kind)) return attributes;
  const expected = { ...attributes };
  if (pedigree.activeAttribute) delete expected[pedigree.activeAttribute];
  if (pedigree.carrierAttribute)
    expected[pedigree.carrierAttribute] =
      attributes[pedigree.carrierAttribute] === true;
  return expected;
}

/**
 * The sex at birth the upgrade records for each person who had none: female
 * for someone recorded as giving an egg, male for a sperm, by the gamete role
 * on a biological or donor relationship to their child. Someone recorded as
 * giving both has no single answer, and keeps none.
 */
function derivedSexes(relationships, pedigree) {
  const sexes = new Map();
  if (!pedigree.gameteAttribute) return sexes;
  for (const edge of relationships) {
    const attributes = attributesOf(edge);
    if (!GENETIC_KINDS.has(firstValue(attributes[pedigree.kindAttribute])))
      continue;
    const sex =
      SEX_FOR_GAMETE[firstValue(attributes[pedigree.gameteAttribute])];
    if (!sex) continue;
    const given = sexes.get(edge.from) ?? new Set();
    given.add(sex);
    sexes.set(edge.from, given);
  }
  return new Map(
    [...sexes]
      .filter(([, given]) => given.size === 1)
      .map(([id, given]) => [id, [...given]]),
  );
}

/**
 * Every Family Pedigree family recorded before the upgrade is there after
 * it, as the redesigned stage reads it, and the stage record is in the shape
 * that stage reads. Each person and relationship after the upgrade is held
 * to exactly what the upgrade should make of what was recorded:
 *
 * - Each person keeps every attribute recorded (name, the participant flag,
 *   the relationship to the participant, the sex at birth). Someone with no
 *   sex at birth recorded gains the one their recorded gamete settles
 *   (female for an egg, male for a sperm) and no other; someone it does not
 *   settle stays unrecorded.
 * - Each relationship keeps its two ends and every attribute, except that a
 *   parent relationship loses schema 8's `isActive` flag (schema 9 reads it
 *   as "current partner") and has its gestational carrier flag recorded as
 *   true or false. A partner relationship keeps its current-partner flag.
 * - A family that reached only the stage record (see `restoredFamily`) is
 *   written to the network: each person with their label as their name and
 *   their participant flag, each relationship between the right two people
 *   with its recorded attributes, held to the same rules.
 * - The participant's "no children" answer is recorded on their
 *   relatives-not-recorded attribute when they have no children.
 * - Nobody else joins the family.
 *
 * Each difference is named, person by person and relationship by
 * relationship, so a failure says what the participant lost.
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
      const schema8Record =
        isRecord(record) &&
        [
          'isNetworkCommitted',
          'edgeIdVersion',
          'selectedFraming',
          'noChildrenAffirmed',
          'nodes',
          'edges',
        ].some((key) => key in record)
          ? record
          : undefined;
      const stageAfter = stagesOf(protocolAfter).find(
        (stage) => stage.id === pedigree.id,
      );
      const nameEncrypted =
        protocolAfter?.codebook?.node?.[pedigree.personType]?.variables?.[
          pedigree.nameAttribute
        ]?.encrypted === true;
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
      const restored = restoredFamily(
        schema8Record,
        people,
        relationships,
        pedigree,
        nameEncrypted,
      );
      const everyone = [...people, ...restored.people.values()];
      const allRelationships = [
        ...relationships,
        ...restored.relationships.values(),
      ];
      const nameOf = (node) => {
        const name = attributesOf(node)[pedigree.nameAttribute];
        return typeof name === 'string' && name !== ''
          ? `"${name}" (${node._uid})`
          : `person ${node._uid}`;
      };
      const label = new Map(everyone.map((node) => [node._uid, nameOf(node)]));
      if (everyone.length > 1 && allRelationships.length > 0) families += 1;

      // What each person should hold after the upgrade.
      const sexes = derivedSexes(allRelationships, pedigree);
      const egoId = everyone.find(
        (node) => attributesOf(node)[pedigree.egoAttribute] === true,
      )?._uid;
      const noChildrenAttribute = isRecord(stageAfter?.completeness)
        ? stageAfter.completeness.relativesNotRecordedAttribute
        : undefined;
      const hasChildren = allRelationships.some(
        (edge) =>
          edge.from === egoId &&
          PARENT_KINDS.has(
            firstValue(attributesOf(edge)[pedigree.kindAttribute]),
          ),
      );
      const expectedPerson = (node) => {
        const expected = { ...attributesOf(node) };
        if (
          pedigree.sexAttribute &&
          isUnrecorded(expected[pedigree.sexAttribute]) &&
          sexes.has(node._uid)
        )
          expected[pedigree.sexAttribute] = sexes.get(node._uid);
        if (
          node._uid === egoId &&
          schema8Record?.noChildrenAffirmed === true &&
          typeof noChildrenAttribute === 'string' &&
          !hasChildren
        ) {
          const current = expected[noChildrenAttribute];
          if (current === undefined || current === null)
            expected[noChildrenAttribute] = ['noChildren'];
          else if (Array.isArray(current) && !current.includes('noChildren'))
            expected[noChildrenAttribute] = [...current, 'noChildren'];
        }
        return expected;
      };

      const peopleAfter = new Map(
        entitiesOf(migrated.network, 'nodes')
          .filter((node) => node.type === pedigree.personType)
          .map((node) => [node._uid, node]),
      );
      for (const person of everyone) {
        const now = peopleAfter.get(person._uid);
        const isRestored = restored.people.has(person._uid);
        if (!now) {
          problems.push(
            isRestored
              ? `${who} did not restore ${label.get(person._uid)}, whom only its stage record held`
              : `${who} lost ${label.get(person._uid)}`,
          );
          continue;
        }
        // Fields beyond the attributes (encrypted values, the stage and
        // prompt each person came from) stay as they were.
        if (!isRestored)
          for (const field of fieldsOf(person, now))
            if (!sameJson(person[field], now[field]))
              problems.push(
                `${who}: ${label.get(person._uid)}'s ${field} was ${JSON.stringify(person[field] ?? null)}, is now ${JSON.stringify(now[field] ?? null)}`,
              );
        const should = expectedPerson(person);
        const is = attributesOf(now);
        for (const key of new Set([
          ...Object.keys(should),
          ...Object.keys(is),
        ])) {
          if (sameJson(should[key], is[key])) continue;
          if (isUnrecorded(should[key]) && isUnrecorded(is[key])) continue;
          problems.push(
            isRestored
              ? `${who}: ${label.get(person._uid)}, restored from its stage record, has ${key}=${JSON.stringify(is[key] ?? null)}, not ${JSON.stringify(should[key] ?? null)}`
              : `${who}: ${label.get(person._uid)}'s ${key} was ${JSON.stringify(attributesOf(person)[key] ?? null)}, is now ${JSON.stringify(is[key] ?? null)}${sameJson(should[key], attributesOf(person)[key]) ? '' : ` (expected ${JSON.stringify(should[key] ?? null)})`}`,
          );
        }
      }
      const everyoneIds = new Set(everyone.map((node) => node._uid));
      for (const id of peopleAfter.keys())
        if (!everyoneIds.has(id))
          problems.push(`${who} gained a person nobody recorded (${id})`);

      const edgesAfter = new Map(
        entitiesOf(migrated.network, 'edges')
          .filter((edge) => edge.type === pedigree.edgeType)
          .map((edge) => [edge._uid, edge]),
      );
      for (const edge of allRelationships) {
        const was = attributesOf(edge);
        const kind = firstValue(was[pedigree.kindAttribute]);
        const isRestored = restored.relationships.has(edge._uid);
        const what = `the ${kind ?? 'unnamed'} relationship from ${label.get(edge.from)} to ${label.get(edge.to)}${isRestored ? ', restored from its stage record,' : ''}`;
        const now = edgesAfter.get(edge._uid);
        if (!now) {
          problems.push(
            isRestored
              ? `${who} did not restore ${what.replace(/,$/, '')}`
              : `${who} lost ${what}`,
          );
          continue;
        }
        if (!isRestored)
          for (const field of fieldsOf(edge, now, ['from', 'to']))
            if (!sameJson(edge[field], now[field]))
              problems.push(
                `${who}: ${what}'s ${field} was ${JSON.stringify(edge[field] ?? null)}, is now ${JSON.stringify(now[field] ?? null)}`,
              );
        if (now.from !== edge.from || now.to !== edge.to)
          problems.push(`${who}: ${what} now joins ${now.from} to ${now.to}`);
        const should = expectedRelationshipAttributes(was, pedigree);
        const is = attributesOf(now);
        for (const key of new Set([
          ...Object.keys(should),
          ...Object.keys(is),
        ])) {
          if (sameJson(should[key], is[key])) continue;
          problems.push(
            `${who}: ${what} had ${key}=${JSON.stringify(was[key] ?? null)}, now ${JSON.stringify(is[key] ?? null)}${sameJson(should[key], was[key]) ? '' : ` (expected ${JSON.stringify(should[key] ?? null)})`}`,
          );
        }
      }
      const relationshipIds = new Set(
        allRelationships.map((edge) => edge._uid),
      );
      for (const [id, edge] of edgesAfter)
        if (
          !relationshipIds.has(id) &&
          everyoneIds.has(edge.from) &&
          everyoneIds.has(edge.to)
        )
          problems.push(`${who} gained a relationship nobody recorded (${id})`);

      const step = expectedStep(protocolBefore, protocolAfter, pedigree.step);
      const recordAfter =
        step !== null && isRecord(migrated.stageMetadata)
          ? migrated.stageMetadata[String(step)]
          : undefined;
      // A schema 8 record keeps only the framing choice; any other record,
      // or none, is left as it was: a record the upgrade made up would
      // change how the participant's pedigree resumes.
      const framing = schema8Record?.selectedFraming;
      const expectedRecord = schema8Record
        ? framing === 'gamete' || framing === 'gendered'
          ? { framing }
          : undefined
        : record;
      if (!sameJson(recordAfter, expectedRecord))
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
