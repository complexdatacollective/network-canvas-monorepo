import { useMemo } from 'react';

import {
  FAMILY_PEDIGREE_SLOTS,
  PEDIGREE_DEFAULT_GENDER_IDENTITIES,
  type PedigreeGenderWords,
  type VariableOption,
} from '@codaco/protocol-validation';

import type { ExclusiveVariableSlotMap } from '../../../codebook/variableRoles.ts';
import {
  type DraftSlotBinding,
  draftExclusiveSlotClaims,
} from '../../../fields/slotVariableWiring.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import type { CodebookSubject } from '../../../protocol-context.ts';
import { useStageSubject } from '../../../sections/useStageSubject.ts';

/**
 * Where the stage keeps each node configuration slot. `genderIdentity` is
 * optional and holds two things: the attribute (`attribute`) and which kinship
 * words each of its options takes (`terms`, not an attribute).
 */
export const NODE_CONFIGURATION_PATHS = Object.freeze({
  nameAttribute: 'nodeConfiguration.nameAttribute',
  genderIdentity: 'nodeConfiguration.genderIdentity',
  genderIdentityAttribute: 'nodeConfiguration.genderIdentity.attribute',
  genderIdentityTerms: 'nodeConfiguration.genderIdentity.terms',
  sexAssignedAtBirthAttribute: 'nodeConfiguration.sexAssignedAtBirthAttribute',
  egoAttribute: 'nodeConfiguration.egoAttribute',
});

export const EDGE_CONFIGURATION_TYPE_PATH = 'edgeConfiguration.type';

/** Where the stage keeps each edge configuration slot. */
export const EDGE_CONFIGURATION_PATHS = Object.freeze({
  kindAttribute: 'edgeConfiguration.kindAttribute',
  gestationalCarrierAttribute: 'edgeConfiguration.gestationalCarrierAttribute',
  currentPartnerAttribute: 'edgeConfiguration.currentPartnerAttribute',
});

/** Where the stage keeps its completeness requirement, and its one slot. */
export const COMPLETENESS_PATH = 'completeness';
export const COMPLETENESS_SCOPE_PATH = 'completeness.scope';
export const COMPLETENESS_ENFORCEMENT_PATH = 'completeness.enforcement';
export const RELATIVES_NOT_RECORDED_PATH =
  'completeness.relativesNotRecordedAttribute';

const PERSON_FORM_FIELDS_PATH = 'form.fields';

/** Where the stage keeps its questions about the whole family. */
export const NOMINATION_PROMPTS_PATH = 'nominationPrompts';

/**
 * The claim a nomination prompt's attribute makes in the draft. It is no
 * exclusive slot of the schema: it only lets the exclusive slot pickers refuse
 * an attribute a prompt of this stage already sets, as they refuse one another
 * slot holds.
 */
const NOMINATION_PROMPT_CLAIM = 'familyPedigree.nominationPrompts';

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
 *   partner). A nomination prompt's attribute is judged against these.
 * - `draftWriterMap` holds those claims and also the attribute of each
 *   nomination prompt. An exclusive slot picker is judged against it, because
 *   an exclusive attribute may be written by nothing else, and a nomination
 *   prompt writes its attribute onto people.
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
  draftWriterMap: ExclusiveVariableSlotMap;
  personAttributeVariables: readonly string[];
  validatedPersonVariables: readonly string[];
  unvalidatedPersonVariables: readonly string[];
  formFieldVariables: readonly string[];
}> {
  const personSubject = useStageSubject('node') ?? null;
  const relationshipType = useStageValue(EDGE_CONFIGURATION_TYPE_PATH);
  const name = asVariableId(
    useStageValue(NODE_CONFIGURATION_PATHS.nameAttribute),
  );
  const gender = asVariableId(
    useStageValue(NODE_CONFIGURATION_PATHS.genderIdentityAttribute),
  );
  const sex = asVariableId(
    useStageValue(NODE_CONFIGURATION_PATHS.sexAssignedAtBirthAttribute),
  );
  const ego = asVariableId(
    useStageValue(NODE_CONFIGURATION_PATHS.egoAttribute),
  );
  const relativesNotRecorded = asVariableId(
    useStageValue(RELATIVES_NOT_RECORDED_PATH),
  );
  const kind = useStageValue(EDGE_CONFIGURATION_PATHS.kindAttribute);
  const carrier = useStageValue(
    EDGE_CONFIGURATION_PATHS.gestationalCarrierAttribute,
  );
  const partner = useStageValue(
    EDGE_CONFIGURATION_PATHS.currentPartnerAttribute,
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

  const slotBindings = useMemo<readonly DraftSlotBinding[]>(
    () => [
      {
        subject: personSubject,
        slot: FAMILY_PEDIGREE_SLOTS.egoAttribute,
        variableId: ego,
      },
      {
        subject: personSubject,
        slot: FAMILY_PEDIGREE_SLOTS.relativesNotRecordedAttribute,
        variableId: relativesNotRecorded,
      },
      {
        subject: relationshipSubject,
        slot: FAMILY_PEDIGREE_SLOTS.relationshipKindAttribute,
        variableId: kind,
      },
      {
        subject: relationshipSubject,
        slot: FAMILY_PEDIGREE_SLOTS.gestationalCarrierAttribute,
        variableId: carrier,
      },
      {
        subject: relationshipSubject,
        slot: FAMILY_PEDIGREE_SLOTS.currentPartnerAttribute,
        variableId: partner,
      },
    ],
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

  const draftSlotMap = useMemo(
    () => draftExclusiveSlotClaims(slotBindings),
    [slotBindings],
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
            .map((row) => row.attribute)
            .filter(
              (variable): variable is string =>
                typeof variable === 'string' && variable !== '',
            )
        : [],
    [nominationRows],
  );

  // The slots come last, so an attribute both a prompt and a slot name is
  // reported as the slot's, which is the more exact refusal.
  const draftWriterMap = useMemo(
    () =>
      draftExclusiveSlotClaims([
        ...nominationVariables.map((variableId): DraftSlotBinding => ({
          subject: personSubject,
          slot: NOMINATION_PROMPT_CLAIM,
          variableId,
        })),
        ...slotBindings,
      ]),
    [nominationVariables, personSubject, slotBindings],
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
    draftWriterMap,
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
  options.map(({ value }) => ({ value, words: defaultWordsFor(value) }));

/**
 * The words the interface's default with this value takes, or neutral words
 * for a value none of the defaults has.
 */
export const defaultWordsFor = (
  value: VariableOption['value'],
): PedigreeGenderWords =>
  PEDIGREE_DEFAULT_GENDER_IDENTITIES.find(
    (candidate) => candidate.value === value,
  )?.words ?? 'neutral';
