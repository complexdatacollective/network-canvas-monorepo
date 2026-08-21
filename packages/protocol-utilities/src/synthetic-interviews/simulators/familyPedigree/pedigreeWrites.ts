/**
 * What a FamilyPedigree stage writes onto the people it creates.
 *
 * Relocated (pedigree subset only) from the deleted G2 engine's
 * `generateNetwork/constraints/stageWrites.ts`: the materializer draws exactly
 * the fields the stage renders, plus whatever a cross-variable rule ties to
 * them, and this module is the one statement of that write set. Derived from
 * the live interface rather than schema usage tags, because the interface is
 * the executable source of truth.
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

function setOf(values: readonly (string | undefined)[]): Set<string> {
  return new Set(values.filter((value): value is string => Boolean(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Variables rendered as ordinary fields or labels by FamilyPedigree. */
export function pedigreeDrawnNodeVariables(stage: Stage): Set<string> {
  if (stage.type !== 'FamilyPedigree') return new Set();
  const nodeLabelVariable = stage.nodeConfig?.nodeLabelVariable;
  return setOf([
    nodeLabelVariable,
    ...(stage.nodeConfig?.form ?? [])
      .map((field) => field.variable)
      // PersonNameField owns the wizard's internal `name` path. A second form
      // field with that id is suppressed by the live interface, as is a form
      // field duplicating the configured label variable.
      .filter(
        (variable) => variable !== nodeLabelVariable && variable !== 'name',
      ),
  ]);
}

/** Disease and nomination variables the pedigree materializer fixes. */
function pedigreeDiseaseVariables(
  stage: Stage,
  stages: readonly Stage[],
): Set<string> {
  if (stage.type !== 'FamilyPedigree') return new Set();

  const variables = new Set(
    (stage.nominationPrompts ?? []).map((prompt) => prompt.variable),
  );
  for (const candidate of stages) {
    if (
      candidate.type !== 'NarrativePedigree' ||
      candidate.sourceStageId !== stage.id
    ) {
      continue;
    }
    for (const disease of candidate.diseases) variables.add(disease.variable);
  }
  return variables;
}

/** Variables written on FamilyPedigree's one iconic ego node. */
export function pedigreeEgoNodeVariables(
  stage: Stage,
  stages: readonly Stage[] = [stage],
  variables?: Record<string, VariableLike>,
): Set<string> {
  if (stage.type !== 'FamilyPedigree') return new Set();

  const directlyWritten = setOf([
    stage.nodeConfig?.egoVariable,
    stage.nodeConfig?.biologicalSexVariable,
    ...pedigreeDiseaseVariables(stage, stages),
  ]);
  const connected = withRuleTiedVariables(variables, directlyWritten);

  // Name and additional node-form controls are rendered only for relatives.
  // Do not let a cross-variable rule turn an unrendered ego control into a
  // synthetic write. A variable that is also written semantically (for
  // example, an imported conflicting biological-sex form field) remains fixed.
  for (const variable of pedigreeDrawnNodeVariables(stage)) {
    if (!directlyWritten.has(variable)) connected.delete(variable);
  }

  return connected;
}

/**
 * `seeds` plus every variable tied to one of them by a cross-variable rule,
 * transitively and in both directions.
 *
 * FamilyPedigree fixes structural values directly. If a rule connects another
 * variable to one of those values, the materializer must settle that connected
 * variable too.
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
