import { get } from 'es-toolkit/compat';
import { useMemo, useState } from 'react';

import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import {
  PEDIGREE_DEFAULT_GENDER_IDENTITIES,
  type PedigreeDefaultGenderIdentityValue,
  type VariableOption,
} from '@codaco/protocol-validation';

import GenderIdentityWordsSummaryField from '../../../fields/GenderIdentityWordsSummaryField.tsx';
import SlotVariableField from '../../../fields/SlotVariableField.tsx';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import { variablesForSubject } from '../../../protocol-context.ts';
import BuilderSection, {
  type SectionCapability,
} from '../../../sections/BuilderSection.tsx';
import StageManagedOptionsEditor from '../../../sections/StageManagedOptionsEditor.tsx';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import {
  genderWordsRowChoice,
  termsFromRowChoices,
  wordsFor,
} from './genderWords.ts';
import { familyPedigreeMessages as messages } from './pedigreeMessages.ts';
import {
  defaultWordsFor,
  genderTermsFromDefaults,
  NODE_CONFIGURATION_PATHS,
  usePedigreeDraftBindings,
} from './pedigreeSlots.ts';

/**
 * Switching the question off removes the whole `genderIdentity` object: the
 * schema accepts a pedigree with none, but not one holding only the words, or
 * only the attribute.
 */
const GENDER_IDENTITY_CAPABILITY: SectionCapability = Object.freeze({
  fields: [NODE_CONFIGURATION_PATHS.genderIdentity],
  confirmClear: {
    title: messages.genderIdentityClearTitle,
    description: messages.genderIdentityClearDescription,
    confirmLabel: messages.genderIdentityClearConfirm,
  },
});

/**
 * The mapping the field starts from: what the stage already holds, else none.
 * An `initialValue` replaces what the form would otherwise seed from the
 * document, so the saved mapping has to be handed back to it.
 */
const startingTerms = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? (value as unknown[]).filter(
        (term): term is Record<string, unknown> =>
          typeof term === 'object' && term !== null && !Array.isArray(term),
      )
    : [];

/** Whether the attribute's options carry exactly these values, in order. */
const sameValues = (
  options: readonly VariableOption[],
  values: readonly VariableOption['value'][],
): boolean =>
  options.length === values.length &&
  options.every((option, index) => option.value === values[index]);

/** The suggested label of each option a new gender identity attribute starts with. */
const DEFAULT_GENDER_OPTION_LABELS: Record<
  PedigreeDefaultGenderIdentityValue,
  MessageDescriptor
> = {
  woman: messages.genderOptionWoman,
  man: messages.genderOptionMan,
  nonBinary: messages.genderOptionNonBinary,
  differentIdentity: messages.genderOptionDifferentIdentity,
  unknown: messages.genderOptionUnknown,
  preferNotToSay: messages.genderOptionPreferNotToSay,
};

/**
 * Whether the participant is asked about gender identity, and if so which
 * attribute holds the answer and which kinship words each option takes. A
 * subsection of the person attributes, which it is mounted inside once the
 * person type is chosen.
 *
 * Optional like every capability, but on for a stage being created: the
 * researcher then binds an attribute as they do for the name, and the stage
 * cannot be saved until they have (or switch the question off). A stage that
 * already exists opens with the question off unless it holds the attribute, and
 * opening it never adds one. Off, no question is asked and relatives are
 * described by their sex assigned at birth. On, the researcher binds a
 * categorical attribute and chooses the words each of its options takes.
 *
 * The attribute's OPTIONS are managed by this stage rather than by the
 * codebook: the words are chosen for those options, so they can only be edited
 * from here, and read-only everywhere else. Both are edited in one dialog
 * (`Edit options`), the words on each option's own row, and the stage shows
 * what each option takes read-only beside the button. The dialog writes the
 * options to the codebook, and the words, for every option it saved, into
 * this stage's draft.
 */
export default function GenderIdentitySection() {
  const intl = useAppIntl();
  const { committedFields, creation, storeApi } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const { personSubject, draftSlotMap, validatedPersonVariables } =
    usePedigreeDraftBindings();

  // What a new gender identity attribute starts with. The words each of those
  // options takes are chosen beside it in the same dialog, and staged on the
  // terms field when it saves; that field may not be mounted until the new
  // attribute reaches the codebook, and the form holds a value written to a
  // field that is not yet there until it mounts.
  const seedOptions = useMemo(
    () =>
      PEDIGREE_DEFAULT_GENDER_IDENTITIES.map(({ value }) => ({
        value,
        label: intl.formatMessage(DEFAULT_GENDER_OPTION_LABELS[value]),
      })),
    [intl],
  );

  const genderVariableId = useStageValue(
    NODE_CONFIGURATION_PATHS.genderIdentityAttribute,
  );
  const genderVariable =
    personSubject === null || typeof genderVariableId !== 'string'
      ? undefined
      : variablesForSubject(protocolContext, personSubject)[genderVariableId];
  const genderOptions =
    genderVariable?.type === 'categorical' ? genderVariable.options : undefined;
  const committedTerms = startingTerms(
    get(committedFields, NODE_CONFIGURATION_PATHS.genderIdentityTerms),
  );
  const draftTerms = useStageValue(
    NODE_CONFIGURATION_PATHS.genderIdentityTerms,
  );

  // The option values the options dialog last saved, until the codebook holds
  // exactly those: the mapping it wrote names them, and the summary must not
  // drop an entry for an option the codebook has simply not caught up with.
  const [savedOptionValues, setSavedOptionValues] = useState<
    readonly VariableOption['value'][] | null
  >(null);
  const codebookCaughtUp =
    savedOptionValues !== null &&
    genderOptions !== undefined &&
    sameValues(genderOptions, savedOptionValues);
  if (codebookCaughtUp) setSavedOptionValues(null);

  // A new attribute's options start on the words their default takes; the
  // options of a bound one on the words this stage gives them.
  const createWords = useMemo(
    () => ({
      optionRowChoice: genderWordsRowChoice(intl, defaultWordsFor),
      typeFixed: true,
    }),
    [intl],
  );
  const editWords = {
    optionRowChoice: genderWordsRowChoice(intl, (value) =>
      wordsFor(draftTerms, value),
    ),
    typeFixed: true,
  };

  return (
    <BuilderSection
      title={intl.formatMessage(messages.genderIdentityTitle)}
      description={intl.formatMessage(messages.genderIdentityDescription)}
      capability={GENDER_IDENTITY_CAPABILITY}
      startOn={creation !== undefined}
    >
      {personSubject !== null && (
        <>
          <SlotVariableField
            name={NODE_CONFIGURATION_PATHS.genderIdentityAttribute}
            label={messages.genderIdentityLabel}
            hint={messages.genderIdentityHint}
            createLabel={messages.genderIdentityCreateLabel}
            subject={personSubject}
            variableType="categorical"
            writerClass="unvalidated"
            seedOptions={seedOptions}
            editorOptions={createWords}
            onCreated={(_variableId, optionRowChoices) =>
              storeApi
                .getState()
                .setFieldValue(
                  NODE_CONFIGURATION_PATHS.genderIdentityTerms,
                  optionRowChoices === undefined
                    ? genderTermsFromDefaults(seedOptions)
                    : termsFromRowChoices(optionRowChoices),
                )
            }
            onBound={(variableId) => {
              // An existing attribute arrives with no mapping: prefill it from
              // the defaults by value, so options named for one of them keep
              // that meaning and the researcher edits the rest.
              const bound = variablesForSubject(protocolContext, personSubject)[
                variableId
              ];
              if (bound?.type !== 'categorical') return;
              storeApi
                .getState()
                .setFieldValue(
                  NODE_CONFIGURATION_PATHS.genderIdentityTerms,
                  genderTermsFromDefaults(bound.options),
                );
            }}
            draftConflicting={validatedPersonVariables}
            draftSlotMap={draftSlotMap}
          />
          {genderOptions !== undefined &&
            typeof genderVariableId === 'string' && (
              <>
                <StageManagedOptionsEditor
                  subject={personSubject}
                  variableId={genderVariableId}
                  allowedVariableTypes={['categorical']}
                  hint={intl.formatMessage(messages.genderOptionsEditHint)}
                  buttonLabel={intl.formatMessage(messages.genderOptionsEdit)}
                  dialogTitle={intl.formatMessage(
                    messages.genderOptionsEditTitle,
                  )}
                  editorOptions={editWords}
                  onSaved={(optionRowChoices) => {
                    if (optionRowChoices === undefined) return;
                    setSavedOptionValues(
                      optionRowChoices.map(({ value }) => value),
                    );
                    storeApi
                      .getState()
                      .setFieldValue(
                        NODE_CONFIGURATION_PATHS.genderIdentityTerms,
                        termsFromRowChoices(optionRowChoices),
                      );
                  }}
                >
                  <Field<typeof GenderIdentityWordsSummaryField>
                    name={NODE_CONFIGURATION_PATHS.genderIdentityTerms}
                    component={GenderIdentityWordsSummaryField}
                    label={intl.formatMessage(messages.genderTermsLabel)}
                    hint={intl.formatMessage(messages.genderTermsHint)}
                    tableLabel={intl.formatMessage(messages.genderTermsLabel)}
                    options={genderOptions}
                    initialValue={committedTerms}
                    reconcile={savedOptionValues === null}
                    className="w-full"
                  />
                </StageManagedOptionsEditor>
              </>
            )}
        </>
      )}
    </BuilderSection>
  );
}
