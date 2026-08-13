/**
 * The closure a fixed value drags behind it through cross-variable validation
 * rules.
 *
 * A stage that settles one value settles every variable a rule ties to it: a
 * `sameAs` partner has no freedom left, and a comparator's other end has to be
 * drawn against a bound that now exists. The materialiser and the feasibility
 * counter both read this closure so they cannot disagree about which values a
 * stage writes — a disagreement would let feasibility accept a protocol whose
 * draw then runs out, or refuse one the draw would have satisfied.
 */

import { VARIABLE_REFERENCE_VALIDATIONS } from '@codaco/protocol-validation';

/**
 * A codebook's variable definitions for one node type, as the caller holds
 * them. Only the `validation` block is read, so the definitions stay opaque.
 */
export type NodeVariablesFor = (
  nodeType: string,
) => Record<string, unknown> | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * `seeds` plus every variable tied to one of them by a cross-variable rule,
 * transitively and in both directions.
 *
 * Both directions, because a rule binds the pair rather than the declaring
 * side: fixing the variable a comparator names constrains the declarer just as
 * fixing the declarer constrains the named one.
 */
export function withRuleTiedVariables(
  variables: Record<string, unknown> | undefined,
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
    for (const rule of VARIABLE_REFERENCE_VALIDATIONS) {
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
