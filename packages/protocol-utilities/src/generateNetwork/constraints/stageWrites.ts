/**
 * What each stage writes onto nodes, and when those nodes enter the network.
 *
 * Synthetic generation follows interview order: a creating stage fills only
 * what it collects, and later stages may write their own variables onto the
 * nodes they can reach. This model is derived from the handlers rather than
 * schema usage tags, because the handlers are the executable source of truth.
 */

import type { Stage } from '@codaco/protocol-validation';

const CROSS_VARIABLE_RULES = [
  'sameAs',
  'differentFrom',
  'lessThanVariable',
  'greaterThanVariable',
  'lessThanOrEqualToVariable',
  'greaterThanOrEqualToVariable',
] as const;

type VariableLike = unknown;

export type NodeVariablesFor = (
  nodeType: string,
) => Record<string, VariableLike> | undefined;

function setOf(values: readonly (string | undefined)[]): Set<string> {
  return new Set(values.filter((value): value is string => Boolean(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type CreationPrompt = {
  additionalAttributes?: readonly { variable: string }[];
};

function promptFixedVariables(stage: Stage, prompt?: CreationPrompt): string[] {
  if (
    stage.type !== 'NameGenerator' &&
    stage.type !== 'NameGeneratorQuickAdd' &&
    stage.type !== 'NameGeneratorRoster'
  ) {
    return [];
  }

  const prompts = prompt === undefined ? stage.prompts : [prompt];
  return prompts.flatMap((candidate) =>
    (candidate.additionalAttributes ?? []).map(
      (attribute) => attribute.variable,
    ),
  );
}

/**
 * `seeds` plus every variable tied to one of them by a cross-variable rule,
 * transitively and in both directions.
 *
 * Used to settle every variable a rule ties to one a stage writes, so the
 * generator and the feasibility counter agree about which values are written.
 */
export function withRuleTiedVariables(
  variables: Record<string, VariableLike> | undefined,
  seeds: ReadonlySet<string>,
): Set<string> {
  const tied = new Set(seeds);
  if (!variables) return tied;

  const partnersOf = (id: string): string[] => {
    const definition = variables[id];
    const validation =
      isRecord(definition) && isRecord(definition.validation)
        ? definition.validation
        : undefined;
    if (!validation) return [];

    const partners: string[] = [];
    for (const rule of CROSS_VARIABLE_RULES) {
      const target = validation[rule];
      if (typeof target === 'string') partners.push(target);
    }
    return partners;
  };

  const inbound = new Map<string, string[]>();
  for (const id of Object.keys(variables)) {
    for (const target of partnersOf(id)) {
      inbound.set(target, [...(inbound.get(target) ?? []), id]);
    }
  }

  const pending = [...seeds];
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined) break;
    for (const partner of [...partnersOf(id), ...(inbound.get(id) ?? [])]) {
      if (tied.has(partner) || !(partner in variables)) continue;
      tied.add(partner);
      pending.push(partner);
    }
  }

  return tied;
}

/** The node variables a creating stage fills on the nodes it creates. */
export function nodeVariablesWrittenOnCreation(
  stage: Stage,
  prompt?: CreationPrompt,
): Set<string> {
  switch (stage.type) {
    case 'NameGenerator':
      return setOf([
        ...(stage.form?.fields ?? []).map((field) => field.variable),
        ...promptFixedVariables(stage, prompt),
      ]);
    case 'NameGeneratorQuickAdd':
      return setOf([stage.quickAdd, ...promptFixedVariables(stage, prompt)]);
    case 'NameGeneratorRoster':
      return new Set();
    case 'NetworkComposer':
      return setOf([
        stage.quickAdd,
        stage.layoutVariable,
        stage.convexHullVariable,
        ...(stage.nodeForm?.fields ?? []).map((field) => field.variable),
      ]);
    case 'AlterEdgeForm':
    case 'AlterForm':
    case 'Anonymisation':
    case 'CategoricalBin':
    case 'DyadCensus':
    case 'EgoForm':
    case 'FamilyPedigree':
    case 'Geospatial':
    case 'Information':
    case 'Narrative':
    case 'OneToManyDyadCensus':
    case 'OrdinalBin':
    case 'Sociogram':
    case 'TieStrengthCensus':
      return new Set();
  }
}

/**
 * Whether a stage declares a collection surface for the nodes it creates.
 *
 * A roster's rows decide what is present, so it keeps the former whole-type
 * fill for values a row omits. An incomplete hand-built fixture with neither
 * fields nor prompt assignments gets the same conservative fallback: it may
 * over-count, but cannot let a real draw run out after feasibility
 * under-counted it.
 */
export function declaresNodeCollection(
  stage: Stage,
  prompt?: CreationPrompt,
): boolean {
  if (stage.type === 'NameGeneratorRoster') return false;
  return nodeVariablesWrittenOnCreation(stage, prompt).size > 0;
}

/** Variables a stage writes onto nodes that existed before it ran. */
function nodeVariablesWrittenOnExisting(stage: Stage): Set<string> {
  switch (stage.type) {
    case 'Sociogram':
      return setOf(
        stage.prompts.flatMap((prompt) => [
          prompt.layout?.layoutVariable,
          prompt.highlight?.allowHighlighting === true && !prompt.edges?.create
            ? prompt.highlight.variable
            : undefined,
        ]),
      );
    case 'OrdinalBin':
    case 'CategoricalBin':
    case 'Geospatial':
      return setOf(stage.prompts.map((prompt) => prompt.variable));
    case 'AlterForm':
      return setOf((stage.form?.fields ?? []).map((field) => field.variable));
    case 'AlterEdgeForm':
    case 'Anonymisation':
    case 'DyadCensus':
    case 'EgoForm':
    case 'FamilyPedigree':
    case 'Information':
    case 'NameGenerator':
    case 'NameGeneratorQuickAdd':
    case 'NameGeneratorRoster':
    case 'Narrative':
    case 'NetworkComposer':
    case 'OneToManyDyadCensus':
    case 'TieStrengthCensus':
      return new Set();
  }
}

function nodeTypeOf(stage: Stage): string | undefined {
  if ('subject' in stage && stage.subject?.entity === 'node') {
    return stage.subject.type;
  }
  return undefined;
}

/** Last stage index writing each variable onto existing nodes, per node type. */
export function lastExistingWriterByType(
  stages: readonly Stage[],
  respectSkipLogicAndFiltering = false,
): Map<string, Map<string, number>> {
  const byType = new Map<string, Map<string, number>>();

  for (const [stageIndex, stage] of stages.entries()) {
    // With filtering enabled, this stage may write only a subset of the
    // existing population. Promoting its variables to every earlier creation
    // would turn a one-node write into a whole-type feasibility demand. The
    // creation tally remains authoritative for variables written when those
    // nodes were made; filtered population writes are settled by the actual
    // filtered set at generation time.
    if (
      respectSkipLogicAndFiltering &&
      'filter' in stage &&
      stage.filter !== undefined
    ) {
      continue;
    }
    const type = nodeTypeOf(stage);
    if (type === undefined) continue;
    const written = nodeVariablesWrittenOnExisting(stage);
    if (written.size === 0) continue;

    const forType = byType.get(type) ?? new Map<string, number>();
    for (const variable of written) {
      forType.set(variable, Math.max(forType.get(variable) ?? -1, stageIndex));
    }
    byType.set(type, forType);
  }

  return byType;
}
