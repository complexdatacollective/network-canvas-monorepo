import { useCallback, useState } from 'react';
import { useSelector } from 'react-redux';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import RichSelectGroupField, {
  type RichSelectOption,
} from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Section from '@codaco/fresco-ui/Section';
import type { VariableType } from '@codaco/protocol-validation';
import ArchitectField from '~/components/Form/ArchitectField';
import {
  useCreateVariable,
  useStageFormValue,
} from '~/components/StageEditor/stageFormHooks';
import type { RootState } from '~/ducks/modules/root';

import { VariablePickerControl as VariablePicker } from '../../Form/Fields/VariablePicker/VariablePicker';
import { EntitySelectControl as EntitySelectField } from '../fields/EntitySelectField/EntitySelectField';
import { HiddenFieldValue } from '../Form/withFieldsHandlers';
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

const TAP_BEHAVIOUR_OPTIONS: RichSelectOption[] = [
  {
    value: TAP_BEHAVIOURS.CREATE_EDGES,
    label: 'Edge creation',
    description:
      'Clicking or tapping a node allows the participant to create an edge.',
  },
  {
    value: TAP_BEHAVIOURS.HIGHLIGHT_ATTRIBUTES,
    label: 'Attribute toggling',
    description:
      'Clicking or tapping a node toggles a boolean attribute between true and false.',
  },
];

/**
 * `highlight.allowHighlighting` is what the interview runtime gates the
 * tap-to-toggle branch on (`Sociogram.tsx`), and the protocol schema pairs it
 * with `highlight.variable`: enabled requires the variable, and the variable
 * without the flag is an accepted but inert prompt. Nothing renders a control
 * for it, so it is registered as a value-only field for as long as attribute
 * toggling is the selected behaviour — otherwise the dialog's submitted
 * `highlight` object (which REPLACES the committed one wholesale, see
 * `DialogArrayField`'s `mergeEditedRow`) would carry only the variable.
 */
const ALLOW_HIGHLIGHTING_FIELD = 'highlight.allowHighlighting';

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

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setTapBehaviour(null);
    return true;
  };

  // Turning highlighting off writes `false` rather than just dropping the
  // variable: the committed flag survives a save that never mentions it
  // (`mergeEditedRow` keeps whatever the row already had), which would leave
  // an enabled highlight with no variable — a prompt the schema rejects.
  // Written unconditionally, which is also what every canonical sociogram
  // prompt records (`highlight: {allowHighlighting: false}` on the
  // layout-only and edge-creation prompts of the sample protocol).
  const disableHighlighting = () =>
    setLocalFieldValue(ALLOW_HIGHLIGHTING_FIELD, false);

  const handleChangeTapBehaviour = (
    behaviour: string | number | (string | number)[] | undefined,
  ) => {
    const nextBehaviour = typeof behaviour === 'string' ? behaviour : null;
    setTapBehaviour(nextBehaviour);
    if (nextBehaviour === TAP_BEHAVIOURS.HIGHLIGHT_ATTRIBUTES) {
      // Reset edge creation — unmounting the field already drops it from the
      // dialog's own submitted values, but an explicit clear also resets the
      // dormant slot so re-toggling within the same session starts fresh.
      setLocalFieldValue('edges.create', undefined);
      // Re-selecting this behaviour has to overwrite the `false` a previous
      // switch parked, which the field would otherwise adopt on registration
      // in preference to its own initial value.
      setLocalFieldValue(ALLOW_HIGHLIGHTING_FIELD, true);
    }
    if (nextBehaviour === TAP_BEHAVIOURS.CREATE_EDGES) {
      // Reset attribute highlighting.
      setLocalFieldValue('highlight.variable', undefined);
      disableHighlighting();
    }
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
      title="Node interaction"
      description="Choose whether tapping a node toggles an attribute or creates an edge."
      toggleable
      defaultOpen={tapBehaviour !== null}
      onOpenChange={handleOpenChange}
    >
      <UnconnectedField
        name="interaction-type"
        label="Interaction type"
        component={RichSelectGroupField}
        onChange={handleChangeTapBehaviour}
        value={tapBehaviour ?? undefined}
        options={TAP_BEHAVIOUR_OPTIONS}
      />
      {tapBehaviour === TAP_BEHAVIOURS.HIGHLIGHT_ATTRIBUTES && (
        <HiddenFieldValue name={ALLOW_HIGHLIGHTING_FIELD} initialValue />
      )}
      {tapBehaviour === TAP_BEHAVIOURS.HIGHLIGHT_ATTRIBUTES && (
        <ArchitectField
          name="highlight.variable"
          label="Boolean attribute"
          hint="Select the attribute toggled when a participant taps a node."
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
      {tapBehaviour === TAP_BEHAVIOURS.CREATE_EDGES &&
        showNetworkFilterWarning && (
          <Alert variant="warning" className="my-7">
            <AlertTitle>Network filter hides this edge type</AlertTitle>
            <AlertDescription>
              Stage level network filtering is enabled, but the edge type you
              want to create on this prompt is not currently included in the
              filter. This means that these edges may not be displayed. Either
              remove the stage-level network filtering, or add these edge types
              to the filter to resolve this issue.
            </AlertDescription>
          </Alert>
        )}
      {tapBehaviour === TAP_BEHAVIOURS.CREATE_EDGES && (
        <ArchitectField
          name="edges.create"
          label="Created edge type"
          component={EntitySelectField}
          validation={{ required: true }}
          initialValue={initialEdges?.create ?? undefined}
          entityType="edge"
        />
      )}
    </Section>
  );
};
export default TapBehaviour;
