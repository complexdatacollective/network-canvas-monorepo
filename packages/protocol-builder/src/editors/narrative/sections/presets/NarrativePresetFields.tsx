import { type ComponentType, useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Section from '@codaco/fresco-ui/Section';

import VariablePickerField from '../../../../fields/VariablePickerField.tsx';
import type {
  RowEditorProps,
  RowPreviewProps,
} from '../../../../form/rowDialog.tsx';
import { canvasMessages } from '../../../../sections/canvas/canvasMessages.ts';
import {
  BOOLEAN_TYPES,
  CATEGORICAL_TYPES,
  LAYOUT_TYPE,
  LAYOUT_TYPES,
  useEdgeTypeChoices,
  useVariableChoices,
} from '../../../../sections/canvas/codebookChoices.ts';
import OptionalTickList from '../../../../sections/canvas/OptionalTickList.tsx';
import {
  asIdList,
  asNestedIdList,
  asText,
  useStableIdList,
} from '../../../../sections/canvas/rowValues.ts';
import { useLostReferences } from '../../../../sections/canvas/useLostReferences.ts';
import { useCreateAttributeForSlot } from '../../../../sections/create-variable/useCreateAttributeForSlot.ts';
import { useStageSubject } from '../../../../sections/useStageSubject.ts';
import { narrativePresetMessages as messages } from './narrativePresetMessages.ts';

const LABEL_FIELD = 'label';
const LAYOUT_VARIABLE_FIELD = 'layoutVariable';
const GROUP_VARIABLE_FIELD = 'groupVariable';
const DISPLAY_EDGES_FIELD = 'edges.display';
const HIGHLIGHT_FIELD = 'highlight';

/** The picker takes an open prop bag from the field wrapper. */
const VariablePicker = VariablePickerField as ComponentType<
  Record<string, unknown>
>;

/** A tick list's choices, in the shape the control registers with. */
type TickChoice = Readonly<{ value: string; label: string }>;

/**
 * One saved way of looking at the network.
 *
 * A preset is a whole picture the researcher switches to while the participant
 * talks: where the nodes sit, which of them are outlined together, which
 * connections are drawn, and which stand out. Every part of it names a
 * codebook attribute or an edge type, all read live from the protocol here, so
 * a collaborator's change to the codebook changes what this dialog offers
 * without the dialog asking for it.
 *
 * No writer class is claimed on any of the three attribute controls, and that
 * is what a preset IS. The narrative runtime restores positions from the
 * layout attribute with `persist: false` and passes no drag handler, reads the
 * grouping attribute to draw hulls, and reads the highlight attributes to
 * highlight nodes; there is no path on which it stores a value under any of
 * them.
 * Classed as a writer, the exclusivity rule would drop exactly the attributes
 * a narrative stage exists to look at — the boolean an alter form collects,
 * the categorical a form asks about.
 */
export function NarrativePresetFields({ item }: RowEditorProps) {
  const intl = useAppIntl();
  const subject = useStageSubject('node');
  // Writes reach THIS dialog's form, not the stage's: a preset is the
  // researcher's unsaved row until they save it.
  const setRowValue = useFormStore((store) => store.setFieldValue);
  const { createProps, editor } = useCreateAttributeForSlot({
    subject,
    variableType: LAYOUT_TYPE,
    title: intl.formatMessage(messages.presetCreateLayoutLabel),
    onCreated: (variableId) => setRowValue(LAYOUT_VARIABLE_FIELD, variableId),
  });
  const edgeChoicesOffered = useEdgeTypeChoices();

  const committedLayout = asText(item[LAYOUT_VARIABLE_FIELD]);
  const committedGroup = asText(item[GROUP_VARIABLE_FIELD]);
  // Held as the same arrays while their contents do not change: a field's
  // starting value is part of its registration, and a new array every render
  // re-registers the field — which supersedes the validation a submit is
  // running and silently refuses the save.
  const committedDisplay = useStableIdList(
    asNestedIdList(item.edges, 'display'),
  );
  const committedHighlight = useStableIdList(asIdList(item[HIGHLIGHT_FIELD]));

  const layoutOptions = useVariableChoices({
    subject,
    types: LAYOUT_TYPES,
    ...(committedLayout === undefined ? {} : { currentValue: committedLayout }),
  });
  const groupOptions = useVariableChoices({
    subject,
    types: CATEGORICAL_TYPES,
    ...(committedGroup === undefined ? {} : { currentValue: committedGroup }),
  });
  const highlightOptions = useVariableChoices({
    subject,
    types: BOOLEAN_TYPES,
    ...(committedHighlight === undefined
      ? {}
      : { currentValue: committedHighlight }),
  });

  /**
   * What this preset NAMES on the two tick lists, read from the field rather
   * than from the committed row.
   *
   * Both lists render their boxes from the codebook, so a reference a
   * collaborator deletes simply stops being a box while its id stays in the
   * value: the control writes the whole list back on any tick, so the dangling
   * id survives every gesture and the only way out is deleting the preset. The
   * field starts from the committed value and carries every tick since, so an
   * id ticked here a moment before the deletion is covered by the same read.
   * See `useLostReferences`.
   */
  const live = useFormValue([DISPLAY_EDGES_FIELD, HIGHLIGHT_FIELD] as const);
  const displayedEdges = useMemo(
    () => asIdList(live[DISPLAY_EDGES_FIELD]) ?? [],
    [live],
  );
  const highlightedAttributes = useMemo(
    () => asIdList(live[HIGHLIGHT_FIELD]) ?? [],
    [live],
  );

  const knownEdgeTypes = useMemo(
    () => new Set(edgeChoicesOffered.map((option) => option.value)),
    [edgeChoicesOffered],
  );
  const lostEdgeTypes = useLostReferences(displayedEdges, knownEdgeTypes);

  /**
   * Judged against what the list OFFERS rather than against the codebook, so
   * an attribute retyped away from true-or-false is recoverable too. It is
   * still in the codebook and still cannot be a highlight, and read against
   * the codebook alone it would be neither offered nor restored — a tick
   * nothing could untick. Which of the two it is, is not something this list
   * can tell, so it says the one thing that is true of both.
   */
  const knownHighlights = useMemo(
    () => new Set(highlightOptions.map((option) => option.value)),
    [highlightOptions],
  );
  const lostHighlights = useLostReferences(
    highlightedAttributes,
    knownHighlights,
  );

  const edgeChoices = useMemo<TickChoice[]>(
    () => [
      ...edgeChoicesOffered.map(({ value, label }) => ({ value, label })),
      ...lostEdgeTypes.map((id) => ({
        value: id,
        label: intl.formatMessage(canvasMessages.missingEdgeType, {
          edgeTypeId: id,
        }),
      })),
    ],
    [edgeChoicesOffered, intl, lostEdgeTypes],
  );
  const highlightChoices = useMemo<TickChoice[]>(
    () => [
      ...highlightOptions.map(({ value, label }) => ({ value, label })),
      ...lostHighlights.map((id) => ({
        value: id,
        label: intl.formatMessage(
          messages.presetUnavailableHighlightAttribute,
          { attributeId: id },
        ),
      })),
    ],
    [highlightOptions, intl, lostHighlights],
  );

  return (
    <>
      <Section title={intl.formatMessage(messages.presetIdentityTitle)}>
        <Field<typeof InputField>
          name={LABEL_FIELD}
          label={intl.formatMessage(messages.presetNameLabel)}
          hint={intl.formatMessage(messages.presetNameHint)}
          component={InputField}
          placeholder={intl.formatMessage(messages.presetNamePlaceholder)}
          initialValue={asText(item[LABEL_FIELD]) ?? ''}
          required={intl.formatMessage(messages.presetNameRequired)}
        />
      </Section>

      <Section title={intl.formatMessage(messages.presetPositionsTitle)}>
        <Field<typeof VariablePicker>
          name={LAYOUT_VARIABLE_FIELD}
          label={intl.formatMessage(messages.presetLayoutLabel)}
          hint={intl.formatMessage(messages.presetLayoutHint)}
          component={VariablePicker}
          options={layoutOptions}
          emptyMessage={intl.formatMessage(messages.presetLayoutEmpty)}
          initialValue={committedLayout}
          required={intl.formatMessage(messages.presetLayoutRequired)}
          {...createProps}
        />
        {editor}
      </Section>

      <Section
        title={intl.formatMessage(messages.presetGroupingTitle)}
        description={intl.formatMessage(messages.presetGroupingDescription)}
      >
        <Field<typeof VariablePicker>
          name={GROUP_VARIABLE_FIELD}
          label={intl.formatMessage(messages.presetGroupLabel)}
          hint={intl.formatMessage(messages.presetGroupHint)}
          component={VariablePicker}
          options={groupOptions}
          emptyMessage={intl.formatMessage(messages.presetGroupEmpty)}
          initialValue={committedGroup}
        />
      </Section>

      <Section
        title={intl.formatMessage(messages.presetConnectionsTitle)}
        description={intl.formatMessage(messages.presetConnectionsDescription)}
      >
        <Field<typeof OptionalTickList>
          name={DISPLAY_EDGES_FIELD}
          label={intl.formatMessage(messages.presetDisplayEdgesLabel)}
          hint={intl.formatMessage(messages.presetDisplayEdgesHint)}
          component={OptionalTickList}
          options={edgeChoices}
          initialValue={committedDisplay}
        />
      </Section>

      <Section
        title={intl.formatMessage(messages.presetHighlightTitle)}
        description={intl.formatMessage(messages.presetHighlightDescription)}
      >
        <Field<typeof OptionalTickList>
          name={HIGHLIGHT_FIELD}
          label={intl.formatMessage(messages.presetHighlightLabel)}
          component={OptionalTickList}
          options={highlightChoices}
          initialValue={committedHighlight}
        />
      </Section>
    </>
  );
}

/** How one preset reads in the list when its dialog is closed. */
export function NarrativePresetPreview({ item }: RowPreviewProps) {
  const intl = useAppIntl();
  const label = asText(item[LABEL_FIELD]);
  return (
    <span className="py-2">
      {label ?? intl.formatMessage(messages.presetUnnamedPreview)}
    </span>
  );
}
