import { useCallback, useState } from 'react';
import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
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
import { type MessageConfig, formatConfig } from '~/i18n/formatConfig';

import { VariablePickerControl as VariablePicker } from '../../Form/Fields/VariablePicker/VariablePicker';
import { EntitySelectControl as EntitySelectField } from '../fields/EntitySelectField/EntitySelectField';
import { HiddenFieldValue } from '../Form/withFieldsHandlers';
import {
  type CurrentFilters,
  getEdgeFilters,
  getHighlightVariablesForSubject,
} from './selectors';
import getEdgeFilteringWarning from './utils';
const configMessages = defineMessages({
  edgeCreation: {
    id: 'architect.sections.sociogramPrompts.promptFieldsTapBehaviour.config.edgeCreation',
    defaultMessage: 'Edge creation',
    description:
      'Presentation label or description in components/sections/SociogramPrompts/PromptFieldsTapBehaviour.tsx. Identifiers are not translated.',
  },
  clickingOrTappingANodeAllows: {
    id: 'architect.sections.sociogramPrompts.promptFieldsTapBehaviour.config.clickingOrTappingANodeAllows',
    defaultMessage:
      'Clicking or tapping a node allows the participant to create an edge.',
    description:
      'Presentation label or description in components/sections/SociogramPrompts/PromptFieldsTapBehaviour.tsx. Identifiers are not translated.',
  },
  attributeToggling: {
    id: 'architect.sections.sociogramPrompts.promptFieldsTapBehaviour.config.attributeToggling',
    defaultMessage: 'Attribute toggling',
    description:
      'Presentation label or description in components/sections/SociogramPrompts/PromptFieldsTapBehaviour.tsx. Identifiers are not translated.',
  },
  clickingOrTappingANodeToggles: {
    id: 'architect.sections.sociogramPrompts.promptFieldsTapBehaviour.config.clickingOrTappingANodeToggles',
    defaultMessage:
      'Clicking or tapping a node toggles a boolean attribute between true and false.',
    description:
      'Presentation label or description in components/sections/SociogramPrompts/PromptFieldsTapBehaviour.tsx. Identifiers are not translated.',
  },
});
const messages = defineMessages({
  nodeInteraction: {
    id: 'architect.sections.sociogramPrompts.promptFieldsTapBehaviour.nodeInteraction',
    defaultMessage: 'Node interaction',
    description:
      'The title text in components / sections / SociogramPrompts / PromptFieldsTapBehaviour.',
  },
  chooseWhetherTappingANodeToggles: {
    id: 'architect.sections.sociogramPrompts.promptFieldsTapBehaviour.chooseWhetherTappingANodeToggles',
    defaultMessage:
      'Choose whether tapping a node toggles an attribute or creates an edge.',
    description:
      'The description text in components / sections / SociogramPrompts / PromptFieldsTapBehaviour.',
  },
  interactionType: {
    id: 'architect.sections.sociogramPrompts.promptFieldsTapBehaviour.interactionType',
    defaultMessage: 'Interaction type',
    description:
      'The label text in components / sections / SociogramPrompts / PromptFieldsTapBehaviour.',
  },
  booleanAttribute: {
    id: 'architect.sections.sociogramPrompts.promptFieldsTapBehaviour.booleanAttribute',
    defaultMessage: 'Boolean attribute',
    description:
      'The label text in components / sections / SociogramPrompts / PromptFieldsTapBehaviour.',
  },
  selectTheAttributeToggledWhenA: {
    id: 'architect.sections.sociogramPrompts.promptFieldsTapBehaviour.selectTheAttributeToggledWhenA',
    defaultMessage:
      'Select the attribute toggled when a participant taps a node.',
    description:
      'The hint text in components / sections / SociogramPrompts / PromptFieldsTapBehaviour.',
  },
  networkFilterHidesThisEdgeType: {
    id: 'architect.sections.sociogramPrompts.promptFieldsTapBehaviour.networkFilterHidesThisEdgeType',
    defaultMessage: 'Network filter hides this edge type',
    description:
      'Visible text in components / sections / SociogramPrompts / PromptFieldsTapBehaviour.',
  },
  stageLevelNetworkFilteringIsEnabled: {
    id: 'architect.sections.sociogramPrompts.promptFieldsTapBehaviour.stageLevelNetworkFilteringIsEnabled',
    defaultMessage:
      'Stage level network filtering is enabled, but the edge type you want to create on this prompt is not currently included in the filter. This means that these edges may not be displayed. Either remove the stage-level network filtering, or add these edge types to the filter to resolve this issue.',
    description:
      'Visible text in components / sections / SociogramPrompts / PromptFieldsTapBehaviour.',
  },
  createdEdgeType: {
    id: 'architect.sections.sociogramPrompts.promptFieldsTapBehaviour.createdEdgeType',
    defaultMessage: 'Created edge type',
    description:
      'The label text in components / sections / SociogramPrompts / PromptFieldsTapBehaviour.',
  },
});

const TAP_BEHAVIOURS = {
  CREATE_EDGES: 'create edges',
  HIGHLIGHT_ATTRIBUTES: 'highlight attributes',
};

const TAP_BEHAVIOUR_OPTIONS: MessageConfig<RichSelectOption>[] = [
  {
    value: TAP_BEHAVIOURS.CREATE_EDGES,
    label: configMessages.edgeCreation,
    description: configMessages.clickingOrTappingANodeAllows,
  },
  {
    value: TAP_BEHAVIOURS.HIGHLIGHT_ATTRIBUTES,
    label: configMessages.attributeToggling,
    description: configMessages.clickingOrTappingANodeToggles,
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
  const intl = useAppIntl();
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
      title={intl.formatMessage(messages.nodeInteraction)}
      description={intl.formatMessage(
        messages.chooseWhetherTappingANodeToggles,
      )}
      toggleable
      defaultOpen={tapBehaviour !== null}
      onOpenChange={handleOpenChange}
    >
      <UnconnectedField
        name="interaction-type"
        label={intl.formatMessage(messages.interactionType)}
        component={RichSelectGroupField}
        onChange={handleChangeTapBehaviour}
        value={tapBehaviour ?? undefined}
        options={formatConfig(TAP_BEHAVIOUR_OPTIONS, intl)}
      />
      {tapBehaviour === TAP_BEHAVIOURS.HIGHLIGHT_ATTRIBUTES && (
        <HiddenFieldValue name={ALLOW_HIGHLIGHTING_FIELD} initialValue />
      )}
      {tapBehaviour === TAP_BEHAVIOURS.HIGHLIGHT_ATTRIBUTES && (
        <ArchitectField
          name="highlight.variable"
          label={intl.formatMessage(messages.booleanAttribute)}
          hint={intl.formatMessage(messages.selectTheAttributeToggledWhenA)}
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
            <AlertTitle>
              {intl.formatMessage(messages.networkFilterHidesThisEdgeType)}
            </AlertTitle>
            <AlertDescription>
              {intl.formatMessage(messages.stageLevelNetworkFilteringIsEnabled)}
            </AlertDescription>
          </Alert>
        )}
      {tapBehaviour === TAP_BEHAVIOURS.CREATE_EDGES && (
        <ArchitectField
          name="edges.create"
          label={intl.formatMessage(messages.createdEdgeType)}
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
