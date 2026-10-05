import type { InterfaceOwnedOptionSetKey } from './entity-attribute-reference.ts';
import {
  PEDIGREE_GENDER_IDENTITY_OPTIONS,
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
} from './family-pedigree-values.ts';

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
 * `ownedOptions` tag a schema reference declares. The option arrays themselves
 * live in this version directory (`family-pedigree-values.ts`); this table is
 * only the slot → set mapping the validator and Architect's option editors both
 * derive from, so the editor's idea of "locked" cannot drift from the
 * validator's.
 */
export const INTERFACE_OWNED_OPTION_SETS: Record<
  InterfaceOwnedOptionSetKey,
  InterfaceOwnedOptionSet
> = {
  pedigreeGenderIdentity: {
    label: 'gender identity',
    options: PEDIGREE_GENDER_IDENTITY_OPTIONS,
  },
  pedigreeSexAssignedAtBirth: {
    label: 'sex assigned at birth',
    options: PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
  },
  pedigreeRelationship: {
    label: 'family relationship kind',
    options: PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
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
