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
// finishOutcome, networkHash, stageMetadataKeys }] }`, with each protocol's
// `stages` as stored.

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
 */
export function introductionPanelProblems(before, after) {
  const problems = [];
  let panels = 0;
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
          `${where}: its Information stage does not take the stage's skip logic`,
        );
    }
  }
  if (panels === 0)
    problems.push(
      'the reading before the upgrade holds no introduction panel, so nothing was migrated',
    );
  return problems;
}

/**
 * Every interview of `before` is still stored against the same protocol,
 * resumes at the stage it was on (found by that stage's id in the migrated
 * protocol), keeps its answers and its stage records, and has not been given a
 * finish outcome nobody recorded.
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
    const step = expectedStep(
      protocolsBefore.get(interview.protocolId),
      protocolsAfter.get(interview.protocolId),
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
    if (migrated.networkHash !== interview.networkHash)
      problems.push(`${who}'s answers changed in the upgrade`);
    const keys = remapStageMetadata(
      Object.fromEntries(
        (interview.stageMetadataKeys ?? []).map((key) => [key, true]),
      ),
      protocolsBefore.get(interview.protocolId),
      protocolsAfter.get(interview.protocolId),
    );
    const byText = (a, b) => a.localeCompare(b);
    const expectedKeys = Object.keys(keys ?? {}).toSorted(byText);
    const actualKeys = [...(migrated.stageMetadataKeys ?? [])].toSorted(byText);
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
