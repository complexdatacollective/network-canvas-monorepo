import { get } from 'es-toolkit/compat';
import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import RichSelectGroupField, {
  type RichSelectOption,
} from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import {
  FAMILY_PEDIGREE_SLOTS,
  PEDIGREE_COMPLETENESS_SCOPES,
  type PedigreeCompletenessScope,
} from '@codaco/protocol-validation';

import SlotVariableField from '../../../fields/SlotVariableField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import BuilderSection, {
  type SectionCapability,
} from '../../../sections/BuilderSection.tsx';
import { familyPedigreeMessages as messages } from './pedigreeMessages.ts';
import {
  COMPLETENESS_ENFORCEMENT_PATH,
  COMPLETENESS_PATH,
  COMPLETENESS_SCOPE_PATH,
  RELATIVES_NOT_RECORDED_PATH,
  usePedigreeDraftBindings,
} from './pedigreeSlots.ts';

/**
 * Switching the requirement off removes the whole `completeness` object: the
 * schema accepts a pedigree with none, but not one holding only some of it.
 */
const COMPLETENESS_CAPABILITY: SectionCapability = Object.freeze({
  fields: [COMPLETENESS_PATH],
  confirmClear: {
    title: messages.completenessClearTitle,
    description: messages.completenessClearDescription,
    confirmLabel: messages.completenessClearConfirm,
  },
});

/** What a researcher gets on switching the requirement on. */
const DEFAULT_SCOPE: PedigreeCompletenessScope = 'parents';
const DEFAULT_ENFORCEMENT = 'required';

/**
 * The field's starting value: what the stage already holds, else the default.
 * `initialValue` replaces what the form would otherwise seed from the
 * document, so a default given alone would overwrite a saved choice.
 */
const startingValue = (
  committedFields: Parameters<typeof get>[0],
  path: string,
  fallback: string,
): string => {
  const committed: unknown = get(committedFields, path);
  return typeof committed === 'string' ? committed : fallback;
};

/**
 * How much of the family a participant must record before continuing, and
 * where the interface keeps their "no siblings", "no children" and "don't
 * know" answers.
 *
 * Optional like every capability: absent, the participant continues with
 * whatever family they have drawn. The scopes are cumulative, so they are
 * offered from the least to the most demanding.
 */
export default function CompletenessSection() {
  const intl = useAppIntl();
  const { committedFields } = useStageEditorForm();
  const { personSubject, draftWriterMap, validatedPersonVariables } =
    usePedigreeDraftBindings();
  const waiting = personSubject === null;

  const scopeLabels: Record<PedigreeCompletenessScope, RichSelectOption> =
    useMemo(
      () => ({
        parents: {
          value: 'parents',
          label: intl.formatMessage(messages.completenessScopeParents),
          description: intl.formatMessage(
            messages.completenessScopeParentsDescription,
          ),
        },
        firstDegree: {
          value: 'firstDegree',
          label: intl.formatMessage(messages.completenessScopeFirstDegree),
          description: intl.formatMessage(
            messages.completenessScopeFirstDegreeDescription,
          ),
        },
        grandparents: {
          value: 'grandparents',
          label: intl.formatMessage(messages.completenessScopeGrandparents),
          description: intl.formatMessage(
            messages.completenessScopeGrandparentsDescription,
          ),
        },
        secondDegree: {
          value: 'secondDegree',
          label: intl.formatMessage(messages.completenessScopeSecondDegree),
          description: intl.formatMessage(
            messages.completenessScopeSecondDegreeDescription,
          ),
        },
        thirdDegree: {
          value: 'thirdDegree',
          label: intl.formatMessage(messages.completenessScopeThirdDegree),
          description: intl.formatMessage(
            messages.completenessScopeThirdDegreeDescription,
          ),
        },
      }),
      [intl],
    );
  const scopeOptions = useMemo(
    () => PEDIGREE_COMPLETENESS_SCOPES.map((scope) => scopeLabels[scope]),
    [scopeLabels],
  );

  const enforcementOptions = useMemo<RichSelectOption[]>(
    () => [
      {
        value: 'required',
        label: intl.formatMessage(messages.completenessEnforcementRequired),
        description: intl.formatMessage(
          messages.completenessEnforcementRequiredDescription,
        ),
      },
      {
        value: 'recommended',
        label: intl.formatMessage(messages.completenessEnforcementRecommended),
        description: intl.formatMessage(
          messages.completenessEnforcementRecommendedDescription,
        ),
      },
    ],
    [intl],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(messages.completenessTitle)}
      description={intl.formatMessage(
        waiting
          ? messages.completenessWaiting
          : messages.completenessDescription,
      )}
      disabled={waiting}
      capability={COMPLETENESS_CAPABILITY}
    >
      {!waiting && (
        <>
          <Field<typeof RichSelectGroupField>
            name={COMPLETENESS_SCOPE_PATH}
            component={RichSelectGroupField}
            label={intl.formatMessage(messages.completenessScopeLabel)}
            hint={intl.formatMessage(messages.completenessScopeHint)}
            options={scopeOptions}
            orientation="vertical"
            initialValue={startingValue(
              committedFields,
              COMPLETENESS_SCOPE_PATH,
              DEFAULT_SCOPE,
            )}
            required={REQUIRED}
          />
          <Field<typeof RichSelectGroupField>
            name={COMPLETENESS_ENFORCEMENT_PATH}
            component={RichSelectGroupField}
            label={intl.formatMessage(messages.completenessEnforcementLabel)}
            options={enforcementOptions}
            orientation="vertical"
            initialValue={startingValue(
              committedFields,
              COMPLETENESS_ENFORCEMENT_PATH,
              DEFAULT_ENFORCEMENT,
            )}
            required={REQUIRED}
          />
          <SlotVariableField
            name={RELATIVES_NOT_RECORDED_PATH}
            label={messages.relativesNotRecordedLabel}
            hint={messages.relativesNotRecordedHint}
            createLabel={messages.relativesNotRecordedCreateLabel}
            subject={personSubject}
            variableType="categorical"
            writerClass="unvalidated"
            ownSlot={FAMILY_PEDIGREE_SLOTS.relativesNotRecordedAttribute}
            ownedOptions="pedigreeRelativesNotRecorded"
            draftConflicting={validatedPersonVariables}
            draftSlotMap={draftWriterMap}
          />
        </>
      )}
    </BuilderSection>
  );
}
