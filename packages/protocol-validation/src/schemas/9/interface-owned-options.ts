import type { InterfaceOwnedOptionSetKey } from './entity-attribute-reference.ts';
import {
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_RELATIONSHIP_TO_PARTICIPANT_OPTIONS,
  PEDIGREE_RELATIVES_NOT_RECORDED_OPTIONS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
} from './family-pedigree-values.ts';

/**
 * One value of an interface-owned set. `label` is the default label written
 * when a migration creates the attribute; a set no migration creates has
 * none, and Architect labels its values through its own translations.
 */
export type InterfaceOwnedOption = { value: string; label?: string };

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
  pedigreeSexAssignedAtBirth: {
    label: 'sex assigned at birth',
    options: PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
  },
  pedigreeRelationship: {
    label: 'family relationship kind',
    options: PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  },
  pedigreeRelativesNotRecorded: {
    label: 'relatives not recorded',
    options: PEDIGREE_RELATIVES_NOT_RECORDED_OPTIONS,
  },
  pedigreeRelationshipToParticipant: {
    label: 'relationship to the participant',
    options: PEDIGREE_RELATIONSHIP_TO_PARTICIPANT_OPTIONS,
  },
};

/**
 * True when a variable's options are exactly the canonical set's values
 * (order-independent). Labels are localized participant copy the interview
 * never branches on, so a protocol may word them in any language.
 */
export const optionsMatchInterfaceOwnedSet = (
  variableOptions: readonly { value: unknown }[] | undefined,
  canonical: readonly InterfaceOwnedOption[],
): boolean => {
  if (!variableOptions || variableOptions.length !== canonical.length) {
    return false;
  }
  return canonical.every((expected) =>
    variableOptions.some((option) => option.value === expected.value),
  );
};
