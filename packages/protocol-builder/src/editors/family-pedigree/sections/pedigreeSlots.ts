import { useMemo } from 'react';

import {
  FAMILY_PEDIGREE_SLOTS,
  PEDIGREE_DEFAULT_GENDER_IDENTITIES,
  type PedigreeGenderWords,
  type VariableOption,
} from '@codaco/protocol-validation';

import type { ExclusiveVariableSlotMap } from '../../../codebook/variableRoles.ts';
import { draftExclusiveSlotClaims } from '../../../fields/slotVariableWiring.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import type { CodebookSubject } from '../../../protocol-context.ts';
import { useStageSubject } from '../../../sections/useStageSubject.ts';

/**
 * Where the stage keeps each node configuration slot. `genderIdentity` is
 * optional and holds two things: the attribute (`variable`) and which kinship
 * words each of its options takes (`terms`, not an attribute).
 */
export const NODE_CONFIGURATION_PATHS = Object.freeze({
  nameVariable: 'nodeConfiguration.nameVariable',
  genderIdentity: 'nodeConfiguration.genderIdentity',
  genderIdentityVariable: 'nodeConfiguration.genderIdentity.variable',
  genderIdentityTerms: 'nodeConfiguration.genderIdentity.terms',
  sexAssignedAtBirthVariable: 'nodeConfiguration.sexAssignedAtBirthVariable',
  egoVariable: 'nodeConfiguration.egoVariable',
});

export const EDGE_CONFIGURATION_TYPE_PATH = 'edgeConfiguration.type';

/** Where the stage keeps each edge configuration slot. */
export const EDGE_CONFIGURATION_PATHS = Object.freeze({
  kindVariable: 'edgeConfiguration.kindVariable',
  gestationalCarrierVariable: 'edgeConfiguration.gestationalCarrierVariable',
  currentPartnerVariable: 'edgeConfiguration.currentPartnerVariable',
});

/** Where the stage keeps its completeness requirement, and its one slot. */
export const COMPLETENESS_PATH = 'completeness';
export const COMPLETENESS_SCOPE_PATH = 'completeness.scope';
export const COMPLETENESS_ENFORCEMENT_PATH = 'completeness.enforcement';
export const RELATIVES_NOT_RECORDED_PATH =
  'completeness.relativesNotRecordedVariable';

const PERSON_FORM_FIELDS_PATH = 'form.fields';

/** Where the stage keeps its questions about the whole family. */
export const NOMINATION_PROMPTS_PATH = 'nominationPrompts';

const asVariableId = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Everything the pedigree's pickers need to know about what this stage's own
 * UNSAVED draft has bound, so a binding made a moment ago constrains the other
 * pickers before it is saved.
 *
 * - `draftSlotMap` holds the exclusive slot claims (participant marker,
 *   relatives not recorded, relationship kind, gestational carrier, current
 *   partner).
 * - `validatedPersonVariables` is what the stage collects from the
 *   participant with validation: the name attribute and every additional
 *   person field.
 * - `unvalidatedPersonVariables` is what the interface writes onto people
 *   itself: gender identity, sex assigned at birth, the participant marker, the
 *   relatives not recorded and the attribute each nomination prompt sets.
 */
export function usePedigreeDraftBindings(): Readonly<{
  personSubject: CodebookSubject | null;
  relationshipSubject: CodebookSubject | null;
  draftSlotMap: ExclusiveVariableSlotMap;
  personAttributeVariables: readonly string[];
  validatedPersonVariables: readonly string[];
  unvalidatedPersonVariables: readonly string[];
  formFieldVariables: readonly string[];
}> {
  const personSubject = useStageSubject('node') ?? null;
  const relationshipType = useStageValue(EDGE_CONFIGURATION_TYPE_PATH);
  const name = asVariableId(
    useStageValue(NODE_CONFIGURATION_PATHS.nameVariable),
  );
  const gender = asVariableId(
    useStageValue(NODE_CONFIGURATION_PATHS.genderIdentityVariable),
  );
  const sex = asVariableId(
    useStageValue(NODE_CONFIGURATION_PATHS.sexAssignedAtBirthVariable),
  );
  const ego = asVariableId(useStageValue(NODE_CONFIGURATION_PATHS.egoVariable));
  const relativesNotRecorded = asVariableId(
    useStageValue(RELATIVES_NOT_RECORDED_PATH),
  );
  const kind = useStageValue(EDGE_CONFIGURATION_PATHS.kindVariable);
  const carrier = useStageValue(
    EDGE_CONFIGURATION_PATHS.gestationalCarrierVariable,
  );
  const partner = useStageValue(
    EDGE_CONFIGURATION_PATHS.currentPartnerVariable,
  );
  const formRows = useStageValue(PERSON_FORM_FIELDS_PATH);
  const nominationRows = useStageValue(NOMINATION_PROMPTS_PATH);

  const relationshipSubject: CodebookSubject | null = useMemo(
    () =>
      typeof relationshipType === 'string' && relationshipType !== ''
        ? { entity: 'edge', type: relationshipType }
        : null,
    [relationshipType],
  );

  const draftSlotMap = useMemo(
    () =>
      draftExclusiveSlotClaims([
        {
          subject: personSubject,
          slot: FAMILY_PEDIGREE_SLOTS.egoVariable,
          variableId: ego,
        },
        {
          subject: personSubject,
          slot: FAMILY_PEDIGREE_SLOTS.relativesNotRecordedVariable,
          variableId: relativesNotRecorded,
        },
        {
          subject: relationshipSubject,
          slot: FAMILY_PEDIGREE_SLOTS.relationshipKindVariable,
          variableId: kind,
        },
        {
          subject: relationshipSubject,
          slot: FAMILY_PEDIGREE_SLOTS.gestationalCarrierVariable,
          variableId: carrier,
        },
        {
          subject: relationshipSubject,
          slot: FAMILY_PEDIGREE_SLOTS.currentPartnerVariable,
          variableId: partner,
        },
      ]),
    [
      carrier,
      ego,
      kind,
      partner,
      personSubject,
      relationshipSubject,
      relativesNotRecorded,
    ],
  );

  const formFieldVariables = useMemo(
    () =>
      Array.isArray(formRows)
        ? formRows
            .filter(isRecord)
            .map((row) => row.variable)
            .filter(
              (variable): variable is string => typeof variable === 'string',
            )
        : [],
    [formRows],
  );

  const nominationVariables = useMemo(
    () =>
      Array.isArray(nominationRows)
        ? nominationRows
            .filter(isRecord)
            .map((row) => row.variable)
            .filter(
              (variable): variable is string =>
                typeof variable === 'string' && variable !== '',
            )
        : [],
    [nominationRows],
  );

  const unvalidatedPersonVariables = useMemo(
    () =>
      [gender, sex, ego, relativesNotRecorded, ...nominationVariables].filter(
        (variable): variable is string => variable !== undefined,
      ),
    [ego, gender, nominationVariables, relativesNotRecorded, sex],
  );

  const personAttributeVariables = useMemo(
    () =>
      name === undefined
        ? unvalidatedPersonVariables
        : [name, ...unvalidatedPersonVariables],
    [name, unvalidatedPersonVariables],
  );

  const validatedPersonVariables = useMemo(
    () =>
      name === undefined ? formFieldVariables : [name, ...formFieldVariables],
    [formFieldVariables, name],
  );

  return {
    personSubject,
    relationshipSubject,
    draftSlotMap,
    personAttributeVariables,
    validatedPersonVariables,
    unvalidatedPersonVariables,
    formFieldVariables,
  };
}

/**
 * The words each option of an existing gender identity attribute starts with:
 * an option whose value is one of the interface's defaults takes that
 * default's words, and every other option takes neutral words. One entry per
 * option, in the attribute's option order.
 */
export const genderTermsFromDefaults = (
  options: readonly VariableOption[],
): { value: VariableOption['value']; words: PedigreeGenderWords }[] =>
  options.map(({ value }) => ({
    value,
    words:
      PEDIGREE_DEFAULT_GENDER_IDENTITIES.find(
        (candidate) => candidate.value === value,
      )?.words ?? 'neutral',
  }));
