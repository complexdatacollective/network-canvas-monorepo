import { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';

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
      <Section title="Preset identity">
        <ArchitectField
          name="label"
          label="Preset label"
          hint={
            <Paragraph>
              The preset label will used to quickly identify the preset from
              within the narrative interface. It will be visible to the
              participant.
            </Paragraph>
          }
          component={InputField}
          validation={{ required: true }}
          initialValue={label ?? ''}
          placeholder="Enter a label for the preset..."
        />
      </Section>
      <Section title="Node layout">
        <ArchitectField
          name="layoutVariable"
          label="Layout attribute"
          hint={
            <Paragraph>
              Select an attribute to use to position the nodes for this preset.
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
        title="Node grouping"
        description="Draw convex hulls around nodes that share a categorical attribute."
        toggleable
        disabled={groupVariablesForSubject.length === 0}
        defaultOpen={hasGroupVariable && groupVariablesForSubject.length > 0}
      >
        <ArchitectField
          name="groupVariable"
          label="Grouping attribute"
          hint={
            <Paragraph>
              The selected values draw semi-transparent convex hulls around
              matching nodes; nodes with multiple values appear in overlapping
              hulls.
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
        title="Displayed edges"
        description="Select the edge types shown in this visualization preset."
        toggleable
        defaultOpen={hasDisplayEdges && edgesForSubject.length > 0}
        disabled={edgesForSubject.length === 0}
      >
        <ArchitectField
          name="edges.display"
          component={CheckboxGroupField}
          label="Edge types"
          initialValue={edges?.display ?? []}
          options={edgesForSubject}
        />
      </Section>
      <Section
        title="Node highlighting"
        description="Highlight nodes whose selected boolean attributes are true."
        toggleable
        defaultOpen={
          hasHighlightVariables && highlightVariablesForSubject.length > 0
        }
        disabled={highlightVariablesForSubject.length === 0}
      >
        <ArchitectField
          name="highlight"
          component={CheckboxGroupField}
          label="Highlight attributes"
          initialValue={highlight ?? []}
          options={highlightVariablesForSubject}
        />
      </Section>
    </>
  );
};

export default PresetFields;
