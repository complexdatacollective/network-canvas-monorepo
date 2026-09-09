import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
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
