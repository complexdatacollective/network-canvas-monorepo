import { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Section from '@codaco/fresco-ui/Section';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import ArchitectField from '~/components/Form/ArchitectField';
import { useCreateVariable } from '~/components/StageEditor/stageFormHooks';
import type { RootState } from '~/ducks/modules/root';

import { VariablePickerControl as VariablePicker } from '../../Form/Fields/VariablePicker/VariablePicker';
import { getEdgesForSubject, getNarrativeVariables } from './selectors';
const messages = defineMessages({
  presetIdentity: {
    id: 'architect.sections.narrativePresets.presetFields.presetIdentity',
    defaultMessage: 'Preset identity',
    description:
      'The title text in components / sections / NarrativePresets / PresetFields.',
  },
  presetLabel: {
    id: 'architect.sections.narrativePresets.presetFields.presetLabel',
    defaultMessage: 'Preset label',
    description:
      'The label text in components / sections / NarrativePresets / PresetFields.',
  },
  thePresetLabelWillUsedTo: {
    id: 'architect.sections.narrativePresets.presetFields.thePresetLabelWillUsedTo',
    defaultMessage:
      'The preset label will used to quickly identify the preset from within the narrative interface. It will be visible to the participant.',
    description:
      'Visible text in components / sections / NarrativePresets / PresetFields.',
  },
  enterALabelForThePreset: {
    id: 'architect.sections.narrativePresets.presetFields.enterALabelForThePreset',
    defaultMessage: 'Enter a label for the preset...',
    description:
      'The placeholder text in components / sections / NarrativePresets / PresetFields.',
  },
  nodeLayout: {
    id: 'architect.sections.narrativePresets.presetFields.nodeLayout',
    defaultMessage: 'Node layout',
    description:
      'The title text in components / sections / NarrativePresets / PresetFields.',
  },
  layoutAttribute: {
    id: 'architect.sections.narrativePresets.presetFields.layoutAttribute',
    defaultMessage: 'Layout attribute',
    description:
      'The label text in components / sections / NarrativePresets / PresetFields.',
  },
  selectAnAttributeToUseTo: {
    id: 'architect.sections.narrativePresets.presetFields.selectAnAttributeToUseTo',
    defaultMessage:
      'Select an attribute to use to position the nodes for this preset.',
    description:
      'Visible text in components / sections / NarrativePresets / PresetFields.',
  },
  nodeGrouping: {
    id: 'architect.sections.narrativePresets.presetFields.nodeGrouping',
    defaultMessage: 'Node grouping',
    description:
      'The title text in components / sections / NarrativePresets / PresetFields.',
  },
  drawConvexHullsAroundNodesThat: {
    id: 'architect.sections.narrativePresets.presetFields.drawConvexHullsAroundNodesThat',
    defaultMessage:
      'Draw convex hulls around nodes that share a categorical attribute.',
    description:
      'The description text in components / sections / NarrativePresets / PresetFields.',
  },
  groupingAttribute: {
    id: 'architect.sections.narrativePresets.presetFields.groupingAttribute',
    defaultMessage: 'Grouping attribute',
    description:
      'The label text in components / sections / NarrativePresets / PresetFields.',
  },
  theSelectedValuesDrawSemiTransparentConvex: {
    id: 'architect.sections.narrativePresets.presetFields.theSelectedValuesDrawSemiTransparentConvex',
    defaultMessage:
      'The selected values draw semi-transparent convex hulls around matching nodes; nodes with multiple values appear in overlapping hulls.',
    description:
      'Visible text in components / sections / NarrativePresets / PresetFields.',
  },
  displayedEdges: {
    id: 'architect.sections.narrativePresets.presetFields.displayedEdges',
    defaultMessage: 'Displayed edges',
    description:
      'The title text in components / sections / NarrativePresets / PresetFields.',
  },
  selectTheEdgeTypesShownIn: {
    id: 'architect.sections.narrativePresets.presetFields.selectTheEdgeTypesShownIn',
    defaultMessage: 'Select the edge types shown in this visualization preset.',
    description:
      'The description text in components / sections / NarrativePresets / PresetFields.',
  },
  edgeTypes: {
    id: 'architect.sections.narrativePresets.presetFields.edgeTypes',
    defaultMessage: 'Edge types',
    description:
      'The label text in components / sections / NarrativePresets / PresetFields.',
  },
  nodeHighlighting: {
    id: 'architect.sections.narrativePresets.presetFields.nodeHighlighting',
    defaultMessage: 'Node highlighting',
    description:
      'The title text in components / sections / NarrativePresets / PresetFields.',
  },
  highlightNodesWhoseSelectedBooleanAttributes: {
    id: 'architect.sections.narrativePresets.presetFields.highlightNodesWhoseSelectedBooleanAttributes',
    defaultMessage:
      'Highlight nodes whose selected boolean attributes are true.',
    description:
      'The description text in components / sections / NarrativePresets / PresetFields.',
  },
  highlightAttributes: {
    id: 'architect.sections.narrativePresets.presetFields.highlightAttributes',
    defaultMessage: 'Highlight attributes',
    description:
      'The label text in components / sections / NarrativePresets / PresetFields.',
  },
});

type PresetFieldsProps = {
  entity: 'node' | 'edge' | 'ego';
  type: string;
  /** The row's own pre-edit values, supplied by DialogArrayField's `item` spread. */
  label?: string;
  layoutVariable?: string;
  groupVariable?: string | null;
  edges?: { display?: string[] } | null;
  highlight?: string[] | null;
};

const PresetFields = ({
  entity,
  type,
  label,
  layoutVariable,
  groupVariable,
  edges,
  highlight,
}: PresetFieldsProps) => {
  const intl = useAppIntl();
  const subject = useMemo(() => ({ entity, type }), [entity, type]);
  const {
    layoutVariablesForSubject,
    highlightVariablesForSubject,
    groupVariablesForSubject,
  } = useSelector((state: RootState) => getNarrativeVariables(state, subject));
  const edgesForSubject = useSelector(getEdgesForSubject);

  // Writes into THIS dialog's own (local) form store — the row-editor form,
  // not the stage. `useCreateVariable`'s own field write-back targets the
  // stage form, so its `field` argument is unusable here.
  const setLocalFieldValue = useFormStore((store) => store.setFieldValue);
  const { createVariable } = useCreateVariable();

  // These three toggle sections gate their own fields' mounting. Use the row's
  // pre-edit values to choose their initial open state; the uncontrolled
  // section owns every later toggle.
  const hasGroupVariable = !!groupVariable;
  const hasDisplayEdges = !!edges?.display && edges.display.length > 0;
  const hasHighlightVariables = !!highlight && highlight.length > 0;

  const handleCreateLayoutVariable = useCallback(
    async (name: string) => {
      const variable = await createVariable(name, 'layout');
      if (variable) setLocalFieldValue('layoutVariable', variable);
    },
    [createVariable, setLocalFieldValue],
  );

  return (
    <>
      <Section title={intl.formatMessage(messages.presetIdentity)}>
        <ArchitectField
          name="label"
          label={intl.formatMessage(messages.presetLabel)}
          hint={
            <Paragraph>
              {intl.formatMessage(messages.thePresetLabelWillUsedTo)}
            </Paragraph>
          }
          component={InputField}
          validation={{ required: true }}
          initialValue={label ?? ''}
          placeholder={intl.formatMessage(messages.enterALabelForThePreset)}
        />
      </Section>
      <Section title={intl.formatMessage(messages.nodeLayout)}>
        <ArchitectField
          name="layoutVariable"
          label={intl.formatMessage(messages.layoutAttribute)}
          hint={
            <Paragraph>
              {intl.formatMessage(messages.selectAnAttributeToUseTo)}
            </Paragraph>
          }
          component={VariablePicker}
          validation={{ required: true }}
          initialValue={layoutVariable}
          entity={entity}
          type={type}
          options={layoutVariablesForSubject}
          onCreateOption={handleCreateLayoutVariable}
        />
      </Section>
      <Section
        title={intl.formatMessage(messages.nodeGrouping)}
        description={intl.formatMessage(
          messages.drawConvexHullsAroundNodesThat,
        )}
        toggleable
        disabled={groupVariablesForSubject.length === 0}
        defaultOpen={hasGroupVariable && groupVariablesForSubject.length > 0}
      >
        <ArchitectField
          name="groupVariable"
          label={intl.formatMessage(messages.groupingAttribute)}
          hint={
            <Paragraph>
              {intl.formatMessage(
                messages.theSelectedValuesDrawSemiTransparentConvex,
              )}
            </Paragraph>
          }
          component={VariablePicker}
          initialValue={groupVariable ?? undefined}
          entity={entity}
          type={type}
          options={groupVariablesForSubject}
          disallowCreation
        />
      </Section>
      <Section
        title={intl.formatMessage(messages.displayedEdges)}
        description={intl.formatMessage(messages.selectTheEdgeTypesShownIn)}
        toggleable
        defaultOpen={hasDisplayEdges && edgesForSubject.length > 0}
        disabled={edgesForSubject.length === 0}
      >
        <ArchitectField
          name="edges.display"
          component={CheckboxGroupField}
          label={intl.formatMessage(messages.edgeTypes)}
          initialValue={edges?.display ?? []}
          options={edgesForSubject}
        />
      </Section>
      <Section
        title={intl.formatMessage(messages.nodeHighlighting)}
        description={intl.formatMessage(
          messages.highlightNodesWhoseSelectedBooleanAttributes,
        )}
        toggleable
        defaultOpen={
          hasHighlightVariables && highlightVariablesForSubject.length > 0
        }
        disabled={highlightVariablesForSubject.length === 0}
      >
        <ArchitectField
          name="highlight"
          component={CheckboxGroupField}
          label={intl.formatMessage(messages.highlightAttributes)}
          initialValue={highlight ?? []}
          options={highlightVariablesForSubject}
        />
      </Section>
    </>
  );
};

export default PresetFields;
