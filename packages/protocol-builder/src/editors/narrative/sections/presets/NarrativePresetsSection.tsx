import { useCallback, useMemo } from 'react';

import { createMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import ArrayField from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';

import { withoutAbsentEntries } from '../../../../form/absentValues.ts';
import {
  RowDialog,
  RowList,
  RowListItem,
  rowId,
  rowTemplate,
  type RowListConfig,
  type RowSaveOutcome,
  type RowValues,
} from '../../../../form/rowDialog.tsx';
import BuilderSection from '../../../../sections/BuilderSection.tsx';
import { useStageNodeTypes } from '../../../../sections/useStageSubject.ts';
import {
  collapseNarrativePresetFor,
  expandNarrativePreset,
  highlightAttributeIn,
  highlightAttributeName,
  highlightEntryIdsIn,
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
 * The ways of looking at the network this stage offers.
 *
 * The stage's `presets` and nothing else. Every preset describes the stage's
 * own node types — which of their attributes group the nodes and make them
 * stand out — so there is nothing to build until a node type is chosen, and the section says so rather than offering pickers with nothing in
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
  const types = useStageNodeTypes();
  const waiting = types.length === 0;

  // A single type's attribute picker is required by its own field; on a stage
  // that shows several, each is optional but a highlight must name something.
  const beforeSave = useCallback(
    (row: RowValues): RowSaveOutcome => {
      if (types.length < 2) return { row };
      const [firstType] = types;
      if (firstType === undefined) return { row };
      const fieldErrors = Object.fromEntries(
        highlightEntryIdsIn(row)
          .filter((entryId) =>
            types.every(
              (type) => highlightAttributeIn(row, entryId, type) === undefined,
            ),
          )
          .map((entryId) => [
            highlightAttributeName(entryId, firstType),
            intl.formatMessage(
              messages.presetHighlightAttributeRequiredSeveral,
            ),
          ]),
      );
      return Object.keys(fieldErrors).length === 0
        ? { row }
        : { refused: { fieldErrors } };
    },
    [intl, types],
  );

  const rowList = useMemo<RowListConfig>(() => {
    const collapse = collapseNarrativePresetFor(types);
    return {
      Preview: NarrativePresetPreview,
      Editor: NarrativePresetFields,
      addTitle: messages.presetsAddTitle,
      editTitle: messages.presetsEditTitle,
      formId: 'narrative-preset-editor',
      name: PRESETS_FIELD,
      expand: expandNarrativePreset,
      beforeSave,
      normalize: (row) => withoutAbsentEntries(collapse(row)),
    };
  }, [beforeSave, types]);

  return (
    <BuilderSection
      sectionKey="presets"
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
          required={AT_LEAST_ONE_PRESET}
        />
      </RowList>
    </BuilderSection>
  );
}
