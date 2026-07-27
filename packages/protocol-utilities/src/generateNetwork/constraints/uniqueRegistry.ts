import type { VariableValue } from '@codaco/shared-consts';

/**
 * Serialise a value into a comparison key. Arrays of primitives are sorted
 * first, because the runtime's `isMatchingValue` compares categorical
 * selections as an order-insensitive multiset — two orderings of the same
 * options are the same value and must not both be issued.
 *
 * Exported because `differentFrom` must judge sameness by the same rule:
 * comparing raw JSON would call ['a','b'] and ['b','a'] different, and the
 * runtime would then reject the value the generator thought was fine.
 */
export function valueKey(value: VariableValue): string {
  if (Array.isArray(value)) {
    const primitives = value.every(
      (item) =>
        typeof item === 'string' ||
        typeof item === 'number' ||
        typeof item === 'boolean',
    );
    if (primitives) {
      // Compared by codepoint, not collation: `localeCompare` reports 0 for
      // strings that differ only by an ignorable character (a soft hyphen,
      // say), and a stable sort then leaves those in whichever order they
      // arrived in — so two orderings of one selection would key differently.
      return JSON.stringify(
        value.toSorted((a, b) => {
          const left = `${typeof a}:${String(a)}`;
          const right = `${typeof b}:${String(b)}`;
          if (left < right) return -1;
          return left > right ? 1 : 0;
        }),
      );
    }
  }
  return JSON.stringify(value ?? null);
}

export class UniqueRegistry {
  private readonly used = new Map<string, Set<string>>();
  private readonly reserved = new Map<string, Set<string>>();
  private readonly sequences = new Map<string, number>();

  private slot(scope: string, variableId: string): string {
    return `${scope}:${variableId}`;
  }

  isTaken(scope: string, variableId: string, value: VariableValue): boolean {
    return (
      this.used.get(this.slot(scope, variableId))?.has(valueKey(value)) ?? false
    );
  }

  claim(scope: string, variableId: string, value: VariableValue): void {
    const slot = this.slot(scope, variableId);
    const values = this.used.get(slot) ?? new Set<string>();
    values.add(valueKey(value));
    this.used.set(slot, values);
  }

  /**
   * Gives a slot's value back, for an entity about to replace the one it holds.
   *
   * No holder is recorded. For a value the registry issued that is safe: a slot
   * issues each of its values once, so the entity handing one back is the only
   * one that was ever given it, and an equal value in another slot or another
   * scope is keyed separately and left alone. It does not hold for values
   * written onto an entity from outside the registry and claimed after the fact
   * — a roster row's, a prompt's `additionalAttributes`, a binning stage's —
   * where two entities can hold one value and releasing frees a value the other
   * still holds. That can only propagate a duplicate the outside writer already
   * created, never create the first one.
   *
   * Callers must release before drawing the replacement, so a redraw that lands
   * on the same value reclaims it rather than being refused it.
   */
  release(scope: string, variableId: string, value: VariableValue): void {
    this.used.get(this.slot(scope, variableId))?.delete(valueKey(value));
  }

  /**
   * Holds a value back from generated draws without issuing it, for an entity
   * the run may still create. A roster row that can still be drawn reserves the
   * values it carries, so no node fabricated before it is issued one of them
   * and leaves the row's own node holding a duplicate.
   *
   * Softer than a claim: a draw left with nothing else takes a reserved value
   * anyway. A row that is never drawn holds nothing, and refusing a value on
   * account of an entity that may never exist is worse than the duplicate the
   * reservation guards against.
   */
  reserve(scope: string, variableId: string, value: VariableValue): void {
    const slot = this.slot(scope, variableId);
    const values = this.reserved.get(slot) ?? new Set<string>();
    values.add(valueKey(value));
    this.reserved.set(slot, values);
  }

  unreserve(scope: string, variableId: string, value: VariableValue): void {
    this.reserved.get(this.slot(scope, variableId))?.delete(valueKey(value));
  }

  isReserved(scope: string, variableId: string, value: VariableValue): boolean {
    return (
      this.reserved.get(this.slot(scope, variableId))?.has(valueKey(value)) ??
      false
    );
  }

  nextSeq(scope: string, variableId: string): number {
    const slot = this.slot(scope, variableId);
    const next = this.sequences.get(slot) ?? 0;
    this.sequences.set(slot, next + 1);
    return next;
  }
}
