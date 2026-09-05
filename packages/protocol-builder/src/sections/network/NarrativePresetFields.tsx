import { useMemo } from 'react';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
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

  const layoutOptions = useVariableOptions({
    subject,
    types: LAYOUT_TYPES,
    writerClass: 'unvalidated',
    ...(committedLayout === undefined ? {} : { currentValue: committedLayout }),
  });
  const groupOptions = useVariableOptions({
    subject,
    types: CATEGORICAL_TYPES,
    writerClass: 'unvalidated',
    ...(committedGroup === undefined ? {} : { currentValue: committedGroup }),
  });
  const highlightOptions = useVariableOptions({
    subject,
    types: BOOLEAN_TYPES,
    writerClass: 'unvalidated',
    ...(committedHighlight === undefined
      ? {}
      : { currentValue: committedHighlight }),
  });

  const edgeChoices = useMemo(
    () => checkboxOptions(edgeOptions),
    [edgeOptions],
  );
  const highlightChoices = useMemo(
    () => checkboxOptions(highlightOptions),
    [highlightOptions],
  );

  return (
    <>
      <Section
        title="Preset identity"
        description="Name this way of looking at the network."
      >
        <Field
          name={LABEL_FIELD}
          label="Preset name"
          hint="Shown to the participant when they switch between presets, so name it in their words."
          component={InputField}
          placeholder="Enter a name for this preset..."
          initialValue={asText(item[LABEL_FIELD]) ?? ''}
          required="Give this preset a name."
        />
      </Section>

      <Section
        title="Node positions"
        description="Where this preset puts each node on the canvas."
      >
        <Field
          name={LAYOUT_VARIABLE_FIELD}
          label="Position attribute"
          hint="The attribute that stores each node's position. Presets sharing an attribute share their positions."
          component={VariablePickerControl}
          options={layoutOptions}
          emptyMessage="This type has no position attributes yet. Create one to lay this preset out."
          initialValue={committedLayout}
          required="Choose the attribute this preset positions nodes with."
        />
        <CreateVariableAction
          subject={subject}
          variableType="layout"
          label="Create a new position attribute"
          description="Create an attribute to store node positions, and use it for this preset"
          onCreated={(variableId) =>
            setRowValue(LAYOUT_VARIABLE_FIELD, variableId)
          }
        />
      </Section>

      <Section
        title="Node grouping"
        description="Draw a shaded outline around the nodes that share a value."
      >
        <Field
          name={GROUP_VARIABLE_FIELD}
          label="Grouping attribute"
          hint="Nodes sharing a value of this attribute are outlined together. A node with several values appears in several overlapping outlines."
          component={VariablePickerControl}
          options={groupOptions}
          emptyMessage="This type has no attributes with a fixed set of values, so there is nothing to group by."
          initialValue={committedGroup}
        />
      </Section>

      <Section
        title="Connections"
        description="The kinds of connection this preset draws between nodes."
      >
        <Field
          name={DISPLAY_EDGES_FIELD}
          label="Connection types shown"
          hint="Leave every type unticked to show no connections at all."
          component={OptionalCheckboxGroupField}
          options={edgeChoices}
          initialValue={committedDisplay}
        />
      </Section>

      <Section
        title="Highlighted nodes"
        description="Make some nodes stand out from the rest."
      >
        <Field
          name={HIGHLIGHT_FIELD}
          label="Highlight attributes"
          hint="A node is highlighted while any of these attributes is true of it."
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
  const label = asText(item[LABEL_FIELD]);
  return (
    <span className="py-2">
      {label === undefined || label === '' ? 'Unnamed preset' : label}
    </span>
  );
}
