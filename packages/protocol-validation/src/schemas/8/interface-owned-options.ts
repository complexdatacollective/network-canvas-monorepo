import {
  BIOLOGICAL_SEX_OPTIONS,
  GAMETE_ROLE_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/shared-consts';

import type { InterfaceOwnedOptionSetKey } from './entity-attribute-reference.ts';

export type InterfaceOwnedOption = { value: string; label: string };

export type InterfaceOwnedOptionSet = {
  /**
   * Researcher-facing name of the value set, used verbatim in validation
   * messages, so it must read as a whole localisable phrase.
   */
  label: string;
  options: readonly InterfaceOwnedOption[];
};

/**
 * The canonical value sets an interface owns, keyed by the
 * `ownedOptions` tag a schema reference declares. The option arrays
 * themselves live in `@codaco/shared-consts` because the interview runtime
 * writes and branches on them; this table is only the slot → set mapping the
 * validator and Architect's option editors both derive from, so the editor's
 * idea of "locked" cannot drift from the validator's.
 */
export const INTERFACE_OWNED_OPTION_SETS: Record<
  InterfaceOwnedOptionSetKey,
  InterfaceOwnedOptionSet
> = {
  biologicalSex: {
    label: 'biological sex',
    options: BIOLOGICAL_SEX_OPTIONS,
  },
  relationshipType: {
    label: 'relationship type',
    options: RELATIONSHIP_TYPE_OPTIONS,
  },
  gameteRole: {
    label: 'gamete role',
    options: GAMETE_ROLE_OPTIONS,
  },
};

/**
 * True when a variable's options are exactly the canonical set (same members
 * and labels, order-independent).
 */
export const optionsMatchInterfaceOwnedSet = (
  variableOptions: { value: unknown; label?: unknown }[] | undefined,
  canonical: readonly InterfaceOwnedOption[],
): boolean => {
  if (!variableOptions || variableOptions.length !== canonical.length) {
    return false;
  }
  return canonical.every((expected) =>
    variableOptions.some(
      (option) =>
        option.value === expected.value && option.label === expected.label,
    ),
  );
};
