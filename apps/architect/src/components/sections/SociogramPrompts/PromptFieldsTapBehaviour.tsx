import { useCallback, useState } from 'react';
import { useSelector } from 'react-redux';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { VariableType } from '@codaco/protocol-validation';
import { Row, Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import {
  useCreateVariable,
  useStageFormValue,
} from '~/components/StageEditor/stageFormHooks';
import type { RootState } from '~/ducks/modules/root';

import { VariablePickerControl as VariablePicker } from '../../Form/Fields/VariablePicker/VariablePicker';
import { EntitySelectControl as EntitySelectField } from '../fields/EntitySelectField/EntitySelectField';
import {
  type CurrentFilters,
  getEdgeFilters,
  getHighlightVariablesForSubject,
} from './selectors';
import getEdgeFilteringWarning from './utils';

const TAP_BEHAVIOURS = {
  CREATE_EDGES: 'create edges',
  HIGHLIGHT_ATTRIBUTES: 'highlight attributes',
};

type TapBehaviourProps = {
  entity: 'node' | 'edge' | 'ego';
  type: VariableType;
  /** The row's own pre-edit values, supplied by DialogArrayField's `item` spread. */
  edges?: { create?: string | null };
  highlight?: { variable?: string | null };
};

const TapBehaviour = ({
  entity,
  type,
  edges: initialEdges,
  highlight: initialHighlight,
}: TapBehaviourProps) => {
  // Writes into THIS dialog's own (local) form store — the row-editor form,
  // not the stage.
  const setLocalFieldValue = useFormStore((store) => store.setFieldValue);
  const { createVariable } = useCreateVariable();
  const handleCreateVariable = useCallback(
    async (variableName: string, variableType: VariableType, field: string) => {
      const variable = await createVariable(variableName, variableType);
      if (variable) setLocalFieldValue(field, variable);
    },
    [createVariable, setLocalFieldValue],
  );

  const liveHighlightVariable = useFormValue(['highlight.variable'] as const)[
    'highlight.variable'
  ];
  const highlightVariable =
    typeof liveHighlightVariable === 'string' ? liveHighlightVariable : '';
  const highlightVariablesForSubject = useSelector((state: RootState) =>
    getHighlightVariablesForSubject(state, { type, entity }, highlightVariable),
  );

  const initialState = () => {
    if (initialEdges?.create) return TAP_BEHAVIOURS.CREATE_EDGES;
    if (initialHighlight?.variable) return TAP_BEHAVIOURS.HIGHLIGHT_ATTRIBUTES;
    return null;
  };
  const [tapBehaviour, setTapBehaviour] = useState<string | null>(
    initialState(),
  );

  const handleChangeTapBehaviour = (behaviour: string | number | undefined) => {
    const nextBehaviour = typeof behaviour === 'string' ? behaviour : null;
    setTapBehaviour(nextBehaviour);
    if (nextBehaviour === TAP_BEHAVIOURS.HIGHLIGHT_ATTRIBUTES) {
      // Reset edge creation — unmounting the field already drops it from the
      // dialog's own submitted values, but an explicit clear also resets the
      // dormant slot so re-toggling within the same session starts fresh.
      setLocalFieldValue('edges.create', undefined);
    }
    if (nextBehaviour === TAP_BEHAVIOURS.CREATE_EDGES) {
      // Reset attribute highlighting.
      setLocalFieldValue('highlight.variable', undefined);
    }
  };
  const handleToggleChange = (value: boolean) => {
    if (value) return true;
    setLocalFieldValue('edges.create', undefined);
    setLocalFieldValue('highlight.variable', undefined);
    return true;
  };

  const liveEdgesCreate = useFormValue(['edges.create'] as const)[
    'edges.create'
  ];
  const selectedValue =
    typeof liveEdgesCreate === 'string' ? liveEdgesCreate : '';
  const stageFilter = useStageFormValue<CurrentFilters | undefined>('filter');
  const edgeFilters = getEdgeFilters(stageFilter);
  const showNetworkFilterWarning = getEdgeFilteringWarning(edgeFilters, [
    selectedValue,
  ]);

  return (
    <Section
      group
      title="Interaction Behavior"
      summary={
        <Paragraph>
          Tapping a node on the sociogram can trigger one of two behaviors:
          assigning an attribute to the node, or creating an edge between two
          nodes.
        </Paragraph>
      }
      toggleable
      startExpanded={tapBehaviour !== null}
      handleToggleChange={handleToggleChange}
      layout="vertical"
    >
      <Row>
        <RadioGroupField
          onChange={handleChangeTapBehaviour}
          value={tapBehaviour ?? undefined}
          options={[
            {
              value: TAP_BEHAVIOURS.CREATE_EDGES,
              label:
                '**Edge Creation**\n\nClicking or tapping a node will allow the participant to create an edge.',
            },
            {
              value: TAP_BEHAVIOURS.HIGHLIGHT_ATTRIBUTES,
              label:
                '**Attribute Toggling**\n\nClicking or tapping a node will toggle a boolean variable to true or false.',
            },
          ]}
        />
      </Row>
      {tapBehaviour && (
        <Row>
          {tapBehaviour === TAP_BEHAVIOURS.HIGHLIGHT_ATTRIBUTES && (
            <ArchitectField
              name="highlight.variable"
              label="Boolean Attribute to Toggle"
              component={VariablePicker}
              validation={{ required: true }}
              initialValue={initialHighlight?.variable ?? undefined}
              entity={entity}
              type={type}
              onCreateOption={(value: string) =>
                handleCreateVariable(value, 'boolean', 'highlight.variable')
              }
              options={highlightVariablesForSubject}
            />
          )}
          {tapBehaviour === TAP_BEHAVIOURS.CREATE_EDGES && (
            <>
              {showNetworkFilterWarning && (
                <Alert variant="warning" className="my-7">
                  <AlertTitle>Network filter hides this edge type</AlertTitle>
                  <AlertDescription>
                    Stage level network filtering is enabled, but the edge type
                    you want to create on this prompt is not currently included
                    in the filter. This means that these edges may not be
                    displayed. Either remove the stage-level network filtering,
                    or add these edge types to the filter to resolve this issue.
                  </AlertDescription>
                </Alert>
              )}
              <ArchitectField
                name="edges.create"
                label="Create edges of the following type"
                component={EntitySelectField}
                validation={{ required: true }}
                initialValue={initialEdges?.create ?? undefined}
                entityType="edge"
              />
            </>
          )}
        </Row>
      )}
    </Section>
  );
};
export default TapBehaviour;
