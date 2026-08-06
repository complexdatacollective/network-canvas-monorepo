import { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';

import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import ArchitectField from '~/components/Form/ArchitectField';
import { useCreateVariable } from '~/components/StageEditor/stageFormHooks';
import type { RootState } from '~/ducks/modules/root';

import Row from '../../EditorLayout/Row';
import Section from '../../EditorLayout/Section';
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

  // These three toggle sections gate their own fields' mounting, so a
  // reactive read of the field (`useFormValue`) can never see a value until
  // AFTER the section is already expanded — a chicken-and-egg problem for
  // `startExpanded`. Use the row's own pre-edit prop values instead, which
  // only need to answer "does a configured value already exist" once, on
  // mount; the toggle switch owns everything after that.
  const hasGroupVariable = !!groupVariable;
  const hasDisplayEdges = !!edges?.display && edges.display.length > 0;
  const hasHighlightVariables = !!highlight && highlight.length > 0;

  const handleToggleGroupVariable = useCallback(
    (open: boolean) => {
      if (!open) setLocalFieldValue('groupVariable', undefined);
      return true;
    },
    [setLocalFieldValue],
  );
  const handleToggleDisplayEdges = useCallback(
    (open: boolean) => {
      // The registered leaf is `edges.display` — `edges` itself is never a
      // field (the store is a flat, exact-string-keyed map with no
      // hierarchy), so clearing `edges` would no-op and the real leaf's
      // dormant value would resurrect on remount.
      if (!open) setLocalFieldValue('edges.display', undefined);
      return true;
    },
    [setLocalFieldValue],
  );
  const handleToggleHighlightVariables = useCallback(
    (open: boolean) => {
      if (!open) setLocalFieldValue('highlight', undefined);
      return true;
    },
    [setLocalFieldValue],
  );

  const handleCreateLayoutVariable = useCallback(
    async (name: string) => {
      const variable = await createVariable(name, 'layout');
      if (variable) setLocalFieldValue('layoutVariable', variable);
    },
    [createVariable, setLocalFieldValue],
  );

  return (
    <>
      <Section
        title="Preset Label"
        summary={
          <Paragraph>
            The preset label will used to quickly identify the preset from
            within the narrative interface. It will be visible to the
            participant.
          </Paragraph>
        }
        layout="vertical"
      >
        <Row>
          <ArchitectField
            name="label"
            label="Preset label"
            labelHidden
            component={InputField}
            validation={{ required: true }}
            initialValue={label ?? ''}
            placeholder="Enter a label for the preset..."
          />
        </Row>
      </Section>
      <Section
        layout="vertical"
        title="Layout Variable"
        summary={
          <Paragraph>
            Select a variable to use to position the nodes for this preset.
          </Paragraph>
        }
      >
        <Row>
          <ArchitectField
            name="layoutVariable"
            label="Layout variable"
            labelHidden
            component={VariablePicker}
            validation={{ required: true }}
            initialValue={layoutVariable}
            entity={entity}
            type={type}
            options={layoutVariablesForSubject}
            onCreateOption={handleCreateLayoutVariable}
          />
        </Row>
      </Section>
      <Section
        title="Group Variable"
        summary={
          <Paragraph>
            Select a categorical variable which will be used to draw convex
            hulls around nodes.
          </Paragraph>
        }
        toggleable
        disabled={groupVariablesForSubject.length === 0}
        startExpanded={hasGroupVariable && groupVariablesForSubject.length > 0}
        handleToggleChange={handleToggleGroupVariable}
        layout="vertical"
      >
        <Row>
          <Paragraph>
            This feature will draw a semi-transparent convex hull for each
            categorical value of the variable you select. If a node&apos;s
            attributes include this categorical value, the hull will be expanded
            to include the node. If a node has multiple values for this
            categorical variable, it will appear in multiple overlapping hulls.
          </Paragraph>
          <ArchitectField
            name="groupVariable"
            label="Select a categorical variable for grouping"
            component={VariablePicker}
            initialValue={groupVariable ?? undefined}
            entity={entity}
            type={type}
            options={groupVariablesForSubject}
            disallowCreation
          />
        </Row>
      </Section>
      <Section
        title="Display Edges"
        toggleable
        startExpanded={hasDisplayEdges && edgesForSubject.length > 0}
        handleToggleChange={handleToggleDisplayEdges}
        disabled={edgesForSubject.length === 0}
        summary={
          <Paragraph>
            Select one or more edge types to display on this narrative preset.
          </Paragraph>
        }
        layout="vertical"
      >
        <Row>
          <ArchitectField
            name="edges.display"
            component={CheckboxGroupField}
            label="Edge types"
            initialValue={edges?.display ?? []}
            options={edgesForSubject}
          />
        </Row>
      </Section>
      <Section
        title="Highlight Node Attributes"
        summary={
          <Paragraph>
            Select one or more boolean variables below. Nodes whose value is
            &quot;true&quot; for this variable will be highlighted when this
            preset is active.
          </Paragraph>
        }
        toggleable
        startExpanded={
          hasHighlightVariables && highlightVariablesForSubject.length > 0
        }
        disabled={highlightVariablesForSubject.length === 0}
        handleToggleChange={handleToggleHighlightVariables}
        layout="vertical"
      >
        <Row>
          <ArchitectField
            name="highlight"
            component={CheckboxGroupField}
            label="Select one or more boolean variables"
            initialValue={highlight ?? []}
            options={highlightVariablesForSubject}
          />
        </Row>
      </Section>
    </>
  );
};

export default PresetFields;
