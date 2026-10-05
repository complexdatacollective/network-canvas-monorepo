import { useMemo } from 'react';

import { FAMILY_PEDIGREE_SLOTS } from '@codaco/protocol-validation';

import type { ExclusiveVariableSlotMap } from '../../../codebook/variableRoles.ts';
import { draftExclusiveSlotClaims } from '../../../fields/slotVariableWiring.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import type { CodebookSubject } from '../../../protocol-context.ts';
import { useStageSubject } from '../../../sections/useStageSubject.ts';

/** Where the stage keeps each person attribute slot. */
export const PERSON_ATTRIBUTE_PATHS = Object.freeze({
  nameVariable: 'personAttributes.nameVariable',
  genderIdentityVariable: 'personAttributes.genderIdentityVariable',
  sexAssignedAtBirthVariable: 'personAttributes.sexAssignedAtBirthVariable',
  egoVariable: 'personAttributes.egoVariable',
});

export const RELATIONSHIP_TYPE_PATH = 'relationship.type';

/** Where the stage keeps each relationship attribute slot. */
export const RELATIONSHIP_ATTRIBUTE_PATHS = Object.freeze({
  kindVariable: 'relationship.kindVariable',
  gestationalCarrierVariable: 'relationship.gestationalCarrierVariable',
  currentPartnerVariable: 'relationship.currentPartnerVariable',
});

/** Where the stage keeps its completeness requirement, and its one slot. */
export const COMPLETENESS_PATH = 'completeness';
export const COMPLETENESS_SCOPE_PATH = 'completeness.scope';
export const COMPLETENESS_ENFORCEMENT_PATH = 'completeness.enforcement';
export const RELATIVES_NOT_RECORDED_PATH =
  'completeness.relativesNotRecordedVariable';

const PERSON_FORM_FIELDS_PATH = 'form.fields';

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
 *   itself: gender identity, sex assigned at birth, the participant marker and
 *   the relatives not recorded.
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
  const relationshipType = useStageValue(RELATIONSHIP_TYPE_PATH);
  const name = asVariableId(useStageValue(PERSON_ATTRIBUTE_PATHS.nameVariable));
  const gender = asVariableId(
    useStageValue(PERSON_ATTRIBUTE_PATHS.genderIdentityVariable),
  );
  const sex = asVariableId(
    useStageValue(PERSON_ATTRIBUTE_PATHS.sexAssignedAtBirthVariable),
  );
  const ego = asVariableId(useStageValue(PERSON_ATTRIBUTE_PATHS.egoVariable));
  const relativesNotRecorded = asVariableId(
    useStageValue(RELATIVES_NOT_RECORDED_PATH),
  );
  const kind = useStageValue(RELATIONSHIP_ATTRIBUTE_PATHS.kindVariable);
  const carrier = useStageValue(
    RELATIONSHIP_ATTRIBUTE_PATHS.gestationalCarrierVariable,
  );
  const partner = useStageValue(
    RELATIONSHIP_ATTRIBUTE_PATHS.currentPartnerVariable,
  );
  const formRows = useStageValue(PERSON_FORM_FIELDS_PATH);

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

  const unvalidatedPersonVariables = useMemo(
    () =>
      [gender, sex, ego, relativesNotRecorded].filter(
        (variable): variable is string => variable !== undefined,
      ),
    [ego, gender, relativesNotRecorded, sex],
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
