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

  nextSeq(scope: string, variableId: string): number {
    const slot = this.slot(scope, variableId);
    const next = this.sequences.get(slot) ?? 0;
    this.sequences.set(slot, next + 1);
    return next;
  }
}
