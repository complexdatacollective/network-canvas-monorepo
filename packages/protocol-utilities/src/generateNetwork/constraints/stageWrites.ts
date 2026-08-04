/**
 * What each stage writes, and to which entities.
 *
 * A Network Canvas interview is linear: a stage writes the variables it
 * collects, onto the entities it reaches, and later stages may modify what
 * earlier ones set. Generation had no model of this — `createNodesForStage`
 * filled every variable a node type declared, whatever the creating stage
 * actually asked about, so a name generator that never mentions a pedigree's
 * proband flag still produced nodes carrying it.
 *
 * This module is the model. It is built from the handlers rather than from the
 * schema's `usage` tags, because the two disagree in several places and the
 * handler is what actually runs:
 *
 * - `EgoForm` writes every ego variable, not the fields its form declares.
 * - `CategoricalBin.otherVariable` is tagged as written but never is.
 * - `Sociogram`'s `highlight.variable` was tagged but never written; it is now
 *   written by the handler, and appears here.
 * - `FamilyPedigree` writes some of its edge-config variables and not others.
 *
 * The distinction between `onCreated` and `onExisting` is load-bearing for
 * counting: a variable a later stage writes onto nodes an earlier stage made
 * still needs values for all of them, while a variable nothing writes needs
 * none at all.
 */

import type { Stage } from '@codaco/protocol-validation';

export type EntityWriteSet = {
  entity: 'node' | 'edge';
  type: string;
  /** Variables filled on entities this stage creates. */
  onCreated: ReadonlySet<string>;
  /** Variables written onto entities that already existed when it ran. */
  onExisting: ReadonlySet<string>;
};

export type StageWrites = EntityWriteSet & { stageIndex: number };

function setOf(values: readonly (string | undefined)[]): Set<string> {
  return new Set(values.filter((value): value is string => Boolean(value)));
}

const EMPTY: ReadonlySet<string> = new Set();

/**
 * The node variables a FamilyPedigree stage writes on the people it builds:
 * the four `nodeConfig` slots, plus one boolean per nomination prompt.
 *
 * All of these are written by the pedigree generator itself rather than drawn,
 * because each is constrained by the pedigree's structure — the proband flag is
 * true exactly once, the kinship term follows from the graph, and the sex of a
 * gamete contributor follows from the role. They are listed here so the count
 * knows a value is spent on them, not so the generic draw supplies one.
 */
export function pedigreeNodeVariables(stage: Stage): Set<string> {
  if (stage.type !== 'FamilyPedigree') return new Set();
  return setOf([
    stage.nodeConfig?.nodeLabelVariable,
    stage.nodeConfig?.egoVariable,
    stage.nodeConfig?.relationshipVariable,
    stage.nodeConfig?.biologicalSexVariable,
    ...(stage.nodeConfig?.form ?? []).map((field) => field.variable),
    ...(stage.nominationPrompts ?? []).map((prompt) => prompt.variable),
  ]);
}

/**
 * Whether a stage says what it collects on the nodes it creates.
 *
 * A `NameGeneratorRoster` never does — its values come from its rows, and the
 * draw supplies whatever a row leaves unset — so it keeps the old whole-type
 * fill. The same fallback catches a stage whose collection surface is empty,
 * which the schema does not allow for the generators that have one (a
 * `NameGenerator` requires a form with at least one field) but which appears in
 * unit fixtures built by hand. Filling the whole type there is the conservative
 * reading: it can over-count, never under-count, and an under-count is what
 * lets a run fail partway through.
 */
export function declaresNodeCollection(stage: Stage): boolean {
  if (stage.type === 'NameGeneratorRoster') return false;
  return nodeVariablesWrittenOnCreation(stage).size > 0;
}

/**
 * The node variables a node-creating stage fills as it creates a node.
 *
 * Roster columns are deliberately absent: a `NameGeneratorRoster`'s values come
 * from its rows rather than from the protocol, and they arrive as fixed values
 * that bypass the draw entirely.
 */
export function nodeVariablesWrittenOnCreation(stage: Stage): Set<string> {
  switch (stage.type) {
    case 'NameGenerator':
      return setOf((stage.form?.fields ?? []).map((field) => field.variable));
    case 'NameGeneratorQuickAdd':
      return setOf([stage.quickAdd]);
    case 'NameGeneratorRoster':
      return new Set();
    case 'FamilyPedigree':
      return pedigreeNodeVariables(stage);
    case 'NetworkComposer':
      // The composer handler writes nothing of its own after creation, so
      // everything it collects — including the layout and hull variables — has
      // to be filled here or its nodes come out with no position at all.
      return setOf([
        stage.quickAdd,
        stage.layoutVariable,
        stage.convexHullVariable,
        ...(stage.nodeForm?.fields ?? []).map((field) => field.variable),
      ]);
    default:
      return new Set();
  }
}

/** The node variables a stage writes onto nodes it did not create. */
export function nodeVariablesWrittenOnExisting(stage: Stage): Set<string> {
  switch (stage.type) {
    case 'Sociogram':
      return setOf(
        stage.prompts.flatMap((prompt) => [
          prompt.layout?.layoutVariable,
          prompt.highlight?.variable,
        ]),
      );
    case 'OrdinalBin':
    case 'CategoricalBin':
      // `otherVariable` is collected by the interface but never written by the
      // generator, so it is not here.
      return setOf(stage.prompts.map((prompt) => prompt.variable));
    case 'Geospatial':
      return setOf(stage.prompts.map((prompt) => prompt.variable));
    case 'AlterForm':
      return setOf((stage.form?.fields ?? []).map((field) => field.variable));
    default:
      return new Set();
  }
}

function nodeTypeOf(stage: Stage): string | undefined {
  if ('subject' in stage && stage.subject?.entity === 'node') {
    return stage.subject.type;
  }
  if (stage.type === 'FamilyPedigree') return stage.nodeConfig?.type;
  return undefined;
}

/**
 * Every stage's writes, in run order.
 *
 * Edge writes are not modelled here: `EdgeCounts` already carries an equivalent
 * per-variable model (`named` plus the pedigree split), and duplicating it
 * would give two answers to one question.
 */
export function collectStageWrites(stages: Stage[]): StageWrites[] {
  const writes: StageWrites[] = [];

  for (let stageIndex = 0; stageIndex < stages.length; stageIndex++) {
    const stage = stages[stageIndex];
    if (!stage) continue;

    const type = nodeTypeOf(stage);
    if (type === undefined) continue;

    const onCreated = nodeVariablesWrittenOnCreation(stage);
    const onExisting = nodeVariablesWrittenOnExisting(stage);
    if (onCreated.size === 0 && onExisting.size === 0) continue;

    writes.push({ stageIndex, entity: 'node', type, onCreated, onExisting });
  }

  return writes;
}

/**
 * The last stage index writing each node variable onto entities it did not
 * create, per node type. The node twin of `EdgeCounts.named`, and read the same
 * way: "a stage writing it runs no later than this".
 */
export function lastExistingWriterByType(
  stages: Stage[],
): Map<string, Map<string, number>> {
  const byType = new Map<string, Map<string, number>>();

  for (const write of collectStageWrites(stages)) {
    if (write.onExisting.size === 0) continue;
    const forType = byType.get(write.type) ?? new Map<string, number>();
    for (const variable of write.onExisting) {
      forType.set(variable, Math.max(forType.get(variable) ?? -1, write.stageIndex));
    }
    byType.set(write.type, forType);
  }

  return byType;
}

export { EMPTY as NO_WRITES };
