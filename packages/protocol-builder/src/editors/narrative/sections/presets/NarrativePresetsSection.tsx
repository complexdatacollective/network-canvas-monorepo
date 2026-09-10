import { useMemo } from 'react';

import { createMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import ArrayField from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import { withoutAbsentValues } from '../../../../form/absentValues.ts';
import {
  RowDialog,
  RowList,
  RowListItem,
  rowId,
  rowTemplate,
  type RowListConfig,
  type RowValues,
} from '../../../../form/rowDialog.tsx';
import BuilderSection from '../../../../sections/BuilderSection.tsx';
import { useStageSubject } from '../../../../sections/useStageSubject.ts';
import {
  NarrativePresetFields,
  NarrativePresetPreview,
} from './NarrativePresetFields.tsx';
import { narrativePresetMessages as messages } from './narrativePresetMessages.ts';

const PRESETS_FIELD = 'presets';

/**
 * Encoded rather than formatted, because the rule below is registered with the
 * form store rather than rendered here. The refusal is decoded in the reader's
 * own language where it is shown.
 */
const AT_LEAST_ONE_PRESET = createMessageError(messages.presetsAtLeastOne);

/**
 * The rule that can actually refuse a save.
 *
 * The whole list is one field value, so this is where a rule about the list
 * itself belongs — a row cannot refuse anything, and the protocol schema's own
 * "Too small: expected array to have >=1 items" arrives against a path rather
 * than against the section the researcher is looking at.
 */
const presetsValidation = {
  custom: messageRuleValidation([
    (value: unknown) =>
      Array.isArray(value) && value.length > 0
        ? undefined
        : AT_LEAST_ONE_PRESET,
  ]),
};

/**
 * The ways of looking at the network this stage offers.
 *
 * The stage's `presets` and nothing else. Every preset describes the stage's
 * own subject — which of its attributes position the nodes, group them and
 * make them stand out — so there is nothing to build until a node type is
 * chosen, and the section says so rather than offering pickers with nothing in
 * them.
 *
 * Not the shared `PromptsSection`, which is the same shape: a narrative stage
 * asks the participant nothing. Its presets are pictures the researcher
 * switches between while the participant talks, they live at `presets` rather
 * than at `prompts`, and every sentence about them is about a view rather than
 * about a question.
 */
export default function NarrativePresetsSection() {
  const intl = useAppIntl();
  const subject = useStageSubject('node');
  const waiting = subject === undefined;

  const rowList = useMemo<RowListConfig>(
    () => ({
      Preview: NarrativePresetPreview,
      Editor: NarrativePresetFields,
      addTitle: messages.presetsAddTitle,
      editTitle: messages.presetsEditTitle,
      formId: 'narrative-preset-editor',
      name: PRESETS_FIELD,
      normalize: (row) => withoutAbsentValues(row) as RowValues,
    }),
    [],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(messages.presetsTitle)}
      description={intl.formatMessage(
        waiting
          ? messages.presetsWaitingDescription
          : messages.presetsDescription,
      )}
      disabled={waiting}
    >
      <RowList config={rowList}>
        <Field<typeof ArrayField<RowValues>>
          name={PRESETS_FIELD}
          label={intl.formatMessage(messages.presetsFieldLabel)}
          hint={intl.formatMessage(messages.presetsFieldHint)}
          component={ArrayField}
          getId={rowId}
          addButtonLabel={intl.formatMessage(messages.presetsAddLabel)}
          itemLabel={messages.presetNoun}
          emptyStateMessage={intl.formatMessage(messages.presetsEmptyState)}
          itemComponent={RowListItem}
          editorComponent={RowDialog}
          itemTemplate={rowTemplate()}
          sortable
          {...presetsValidation}
        />
      </RowList>
    </BuilderSection>
  );
}
