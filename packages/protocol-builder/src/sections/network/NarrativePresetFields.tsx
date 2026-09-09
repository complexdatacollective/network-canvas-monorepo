import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Section from '@codaco/fresco-ui/Section';

import { VariablePickerControl } from '../../fields/VariablePicker.tsx';
import type { RowEditorProps, RowPreviewProps } from '../rowRenderers.tsx';
import { OptionalCheckboxGroupField } from './canvasFields.tsx';
import {
  BOOLEAN_TYPES,
  CATEGORICAL_TYPES,
  LAYOUT_TYPES,
  useEdgeTypeOptions,
  useStageSubject,
  useVariableOptions,
} from './codebookOptions.ts';
import CreateVariableAction from './CreateVariableAction.tsx';
import { useLostEdgeTypes } from './lostEdgeTypes.ts';
import { networkCanvasMessages } from './networkCanvasMessages.ts';
import {
  asIdList,
  asNestedIdList,
  asText,
  checkboxOptions,
  useStableIdList,
} from './rowValues.ts';

const LABEL_FIELD = 'label';
const LAYOUT_VARIABLE_FIELD = 'layoutVariable';
const GROUP_VARIABLE_FIELD = 'groupVariable';
const DISPLAY_EDGES_FIELD = 'edges.display';
const HIGHLIGHT_FIELD = 'highlight';

/**
 * One saved way of looking at the network.
 *
 * A preset is a whole visualisation the researcher can switch to during the
 * interview: where the nodes sit, which of them are outlined together, which
 * connections are drawn, and which nodes stand out. Every part of it names a
 * codebook attribute or an edge type, and all of those come from the editor's
 * own protocol context — so a preset naming an attribute a collaborator has
 * since deleted says so, in the picker, rather than quietly emptying itself.
 */
export function NarrativePresetFields({ item }: RowEditorProps) {
  const intl = useAppIntl();
  const subject = useStageSubject();
  // Writes reach THIS dialog's form, not the stage's: a preset is the
  // researcher's unsaved row until they save it.
  const setRowValue = useFormStore((store) => store.setFieldValue);
  const edgeOptions = useEdgeTypeOptions();

  const committedLayout = asText(item[LAYOUT_VARIABLE_FIELD]);
  const committedGroup = asText(item[GROUP_VARIABLE_FIELD]);
  // Held as the same arrays while their contents do not change: a field's
  // starting value is part of its registration, and a new array every render
  // re-registers the field — which supersedes the validation a submit is
  // running and silently refuses the save.
  const committedHighlight = useStableIdList(asIdList(item[HIGHLIGHT_FIELD]));
  const committedDisplay = useStableIdList(
    asNestedIdList(item.edges, 'display'),
  );

  /**
   * No writer class on any of these three, and that is what a preset IS.
   *
   * A writer class is a claim to WRITE the attribute, and it buys an
   * exclusivity: an unvalidated writer may not share an attribute with a form
   * field, because a value written around the codebook's rules would defeat
   * the validation the form applies. A preset writes nothing. The narrative
   * runtime reads each node's position out of the attribute
   * (`syncFromNodes`), runs its layout with `persist: false` and passes no
   * drag handler, reads the grouping attribute to draw hulls, and reads the
   * highlight attributes to colour nodes; there is no path on which it stores
   * a value under any of them.
   *
   * Classed `unvalidated`, `excludeValidatedUses` dropped exactly the
   * attributes a narrative stage exists to look at: the boolean an alter form
   * collects, the categorical a form asks about. A committed preset hid it —
   * `currentValue` escapes every filter — so the picker looked right on the
   * stage that was already configured and offered nothing usable on a new
   * preset.
   *
   * The interface-owned exclusion `useVariableOptions` always applies is a
   * different rule and stays: an attribute a pedigree slot derives is still
   * offered as a thing to READ where the reference is already stored, and is
   * kept off the list of new picks so a researcher does not build a preset on
   * a value another interface rewrites out from under it.
   */
  const layoutOptions = useVariableOptions({
    subject,
    types: LAYOUT_TYPES,
    ...(committedLayout === undefined ? {} : { currentValue: committedLayout }),
  });
  const groupOptions = useVariableOptions({
    subject,
    types: CATEGORICAL_TYPES,
    ...(committedGroup === undefined ? {} : { currentValue: committedGroup }),
  });
  const highlightOptions = useVariableOptions({
    subject,
    types: BOOLEAN_TYPES,
    ...(committedHighlight === undefined
      ? {}
      : { currentValue: committedHighlight }),
  });

  /**
   * What this preset NAMES on the two tick lists — what it arrived with, and
   * what the researcher is building — rather than the committed value alone.
   *
   * Both lists render from the codebook, so an edge type or a boolean
   * attribute a collaborator deletes simply stops being a choice while its id
   * stays in the value. `CheckboxGroupField` writes the whole list back on any
   * tick, so the dangling id survived every gesture and there was no box to
   * untick it with: the only way out was deleting the whole preset. Read from
   * the committed value alone, an id ticked in this dialog a moment before the
   * deletion would leave the list just as invisibly.
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
    () => new Set(edgeOptions.map((option) => option.value)),
    [edgeOptions],
  );
  const namedEdgeTypes = useMemo(
    () => [...(committedDisplay ?? []), ...displayedEdges],
    [committedDisplay, displayedEdges],
  );
  const lostEdgeTypes = useLostEdgeTypes(namedEdgeTypes, knownEdgeTypes);

  /**
   * Judged against what the list OFFERS rather than against the codebook, so
   * an attribute retyped away from true/false is recoverable too. It is still
   * in the codebook and still cannot be a highlight, and read against the
   * codebook alone it would be neither offered nor restored — a tick nothing
   * could untick. Which of the two it is, is not something this list can tell
   * (the same reason `VariablePicker` says only "not available here"), so it
   * says the one thing that is true of both.
   */
  const knownHighlights = useMemo(
    () => new Set(highlightOptions.map((option) => option.value)),
    [highlightOptions],
  );
  const namedHighlights = useMemo(
    () => [...(committedHighlight ?? []), ...highlightedAttributes],
    [committedHighlight, highlightedAttributes],
  );
  const lostHighlights = useLostEdgeTypes(namedHighlights, knownHighlights);

  const edgeChoices = useMemo(() => {
    const offered = checkboxOptions(edgeOptions);
    if (lostEdgeTypes.length === 0) return offered;
    return [
      ...offered,
      ...lostEdgeTypes.map((id) => ({
        value: id,
        label: intl.formatMessage(networkCanvasMessages.promptMissingEdgeType, {
          edgeTypeId: id,
        }),
      })),
    ];
  }, [edgeOptions, intl, lostEdgeTypes]);
  const highlightChoices = useMemo(() => {
    const offered = checkboxOptions(highlightOptions);
    if (lostHighlights.length === 0) return offered;
    return [
      ...offered,
      ...lostHighlights.map((id) => ({
        value: id,
        label: intl.formatMessage(
          networkCanvasMessages.presetUnavailableHighlightAttribute,
          { attributeId: id },
        ),
      })),
    ];
  }, [highlightOptions, intl, lostHighlights]);

  return (
    <>
      <Section
        title={intl.formatMessage(networkCanvasMessages.presetIdentityTitle)}
        description={intl.formatMessage(
          networkCanvasMessages.presetIdentityDescription,
        )}
      >
        <Field
          name={LABEL_FIELD}
          label={intl.formatMessage(networkCanvasMessages.presetNameLabel)}
          hint={intl.formatMessage(networkCanvasMessages.presetNameHint)}
          component={InputField}
          placeholder={intl.formatMessage(
            networkCanvasMessages.presetNamePlaceholder,
          )}
          initialValue={asText(item[LABEL_FIELD]) ?? ''}
          required={intl.formatMessage(
            networkCanvasMessages.presetNameRequired,
          )}
        />
      </Section>

      <Section
        title={intl.formatMessage(networkCanvasMessages.presetPositionsTitle)}
        description={intl.formatMessage(
          networkCanvasMessages.presetPositionsDescription,
        )}
      >
        <Field
          name={LAYOUT_VARIABLE_FIELD}
          label={intl.formatMessage(networkCanvasMessages.presetLayoutLabel)}
          hint={intl.formatMessage(networkCanvasMessages.presetLayoutHint)}
          component={VariablePickerControl}
          options={layoutOptions}
          emptyMessage={intl.formatMessage(
            networkCanvasMessages.presetLayoutEmpty,
          )}
          initialValue={committedLayout}
          required={intl.formatMessage(
            networkCanvasMessages.presetLayoutRequired,
          )}
        />
        <CreateVariableAction
          subject={subject}
          variableType="layout"
          label={intl.formatMessage(
            networkCanvasMessages.presetCreateLayoutLabel,
          )}
          description={intl.formatMessage(
            networkCanvasMessages.presetCreateLayoutDescription,
          )}
          onCreated={(variableId) =>
            setRowValue(LAYOUT_VARIABLE_FIELD, variableId)
          }
        />
      </Section>

      <Section
        title={intl.formatMessage(networkCanvasMessages.presetGroupingTitle)}
        description={intl.formatMessage(
          networkCanvasMessages.presetGroupingDescription,
        )}
      >
        <Field
          name={GROUP_VARIABLE_FIELD}
          label={intl.formatMessage(networkCanvasMessages.presetGroupLabel)}
          hint={intl.formatMessage(networkCanvasMessages.presetGroupHint)}
          component={VariablePickerControl}
          options={groupOptions}
          emptyMessage={intl.formatMessage(
            networkCanvasMessages.presetGroupEmpty,
          )}
          initialValue={committedGroup}
        />
      </Section>

      <Section
        title={intl.formatMessage(networkCanvasMessages.presetConnectionsTitle)}
        description={intl.formatMessage(
          networkCanvasMessages.presetConnectionsDescription,
        )}
      >
        <Field
          name={DISPLAY_EDGES_FIELD}
          label={intl.formatMessage(
            networkCanvasMessages.presetDisplayEdgesLabel,
          )}
          hint={intl.formatMessage(
            networkCanvasMessages.presetDisplayEdgesHint,
          )}
          component={OptionalCheckboxGroupField}
          options={edgeChoices}
          initialValue={committedDisplay}
        />
      </Section>

      <Section
        title={intl.formatMessage(networkCanvasMessages.presetHighlightTitle)}
        description={intl.formatMessage(
          networkCanvasMessages.presetHighlightDescription,
        )}
      >
        <Field
          name={HIGHLIGHT_FIELD}
          label={intl.formatMessage(networkCanvasMessages.presetHighlightLabel)}
          hint={intl.formatMessage(networkCanvasMessages.presetHighlightHint)}
          component={OptionalCheckboxGroupField}
          options={highlightChoices}
          initialValue={committedHighlight}
        />
      </Section>
    </>
  );
}

/** How one preset reads in the list when its editor is closed. */
export function NarrativePresetPreview({ item }: RowPreviewProps) {
  const intl = useAppIntl();
  const label = asText(item[LABEL_FIELD]);
  return (
    <span className="py-2">
      {label === undefined || label === ''
        ? intl.formatMessage(networkCanvasMessages.presetUnnamedPreview)
        : label}
    </span>
  );
}
