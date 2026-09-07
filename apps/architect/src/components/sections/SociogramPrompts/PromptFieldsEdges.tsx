import { isEqual, union } from 'es-toolkit/compat';
import { useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Section from '@codaco/fresco-ui/Section';
import ArchitectField from '~/components/Form/ArchitectField';
import { useStageFormValue } from '~/components/StageEditor/stageFormHooks';

import {
  type CurrentFilters,
  getEdgeFilters,
  getEdgesForSubject,
} from './selectors';
import getEdgeFilteringWarning from './utils';
const messages = defineMessages({
  displayedEdges: {
    id: 'architect.sections.sociogramPrompts.promptFieldsEdges.displayedEdges',
    defaultMessage: 'Displayed edges',
    description:
      'The title text in components / sections / SociogramPrompts / PromptFieldsEdges.',
  },
  chooseTheEdgeTypesShownOn: {
    id: 'architect.sections.sociogramPrompts.promptFieldsEdges.chooseTheEdgeTypesShownOn',
    defaultMessage: 'Choose the edge types shown on this prompt.',
    description:
      'The description text in components / sections / SociogramPrompts / PromptFieldsEdges.',
  },
  networkFilterHidesConfiguredEdgeTypes: {
    id: 'architect.sections.sociogramPrompts.promptFieldsEdges.networkFilterHidesConfiguredEdgeTypes',
    defaultMessage: 'Network filter hides configured edge types',
    description:
      'Visible text in components / sections / SociogramPrompts / PromptFieldsEdges.',
  },
  stageLevelNetworkFilteringIsEnabled: {
    id: 'architect.sections.sociogramPrompts.promptFieldsEdges.stageLevelNetworkFilteringIsEnabled',
    defaultMessage:
      'Stage level network filtering is enabled, but one or more of the edge types you have configured to display on this prompt are not currently included in the filter. This means that these edges may not be displayed. Either remove the stage-level network filtering, or add these edge types to the filter to resolve this issue.',
    description:
      'Visible text in components / sections / SociogramPrompts / PromptFieldsEdges.',
  },
  theEdgeTypeBeingCreatedMust: {
    id: 'architect.sections.sociogramPrompts.promptFieldsEdges.theEdgeTypeBeingCreatedMust',
    defaultMessage:
      'The edge type being created must always be displayed. This edge type is shown in italics below, and cannot be deselected.',
    description:
      'Visible text in components / sections / SociogramPrompts / PromptFieldsEdges.',
  },
  edgeTypes: {
    id: 'architect.sections.sociogramPrompts.promptFieldsEdges.edgeTypes',
    defaultMessage: 'Edge types',
    description:
      'The label text in components / sections / SociogramPrompts / PromptFieldsEdges.',
  },
});

type Option = {
  value: string;
  label: string;
  type?: string;
  color?: string;
};

type DisplayEdgesProps = {
  /** The row's own pre-edit values, supplied by DialogArrayField's `item` spread. */
  edges?: { create?: string | null; display?: string[] | null };
};

/** Stable empty list: `initialValue` is a register-effect dependency. */
const EMPTY_DISPLAY_EDGES: string[] = [];

const DisplayEdges = ({ edges: initialEdges }: DisplayEdgesProps) => {
  const intl = useAppIntl();
  const edgesForSubject = useSelector(getEdgesForSubject);
  const setLocalFieldValue = useFormStore((store) => store.setFieldValue);

  const liveValues = useFormValue(['edges.create', 'edges.display'] as const);
  const createEdge =
    typeof liveValues['edges.create'] === 'string'
      ? liveValues['edges.create']
      : undefined;
  const displayEdges = Array.isArray(liveValues['edges.display'])
    ? (liveValues['edges.display'] as string[])
    : undefined;

  const displayEdgesOptions = useMemo(
    () =>
      edgesForSubject.map((edge) => {
        if (edge.value !== createEdge) {
          return edge;
        }
        return {
          ...edge,
          disabled: true,
        };
      }),
    [edgesForSubject, createEdge],
  );
  const hasDisabledEdgeOption = displayEdgesOptions.some(
    (option) =>
      (
        option as Option & {
          disabled?: boolean;
        }
      ).disabled,
  );

  // Observer effect: the edge type being created must always be displayed —
  // keep it included in `edges.display` whenever it changes.
  useEffect(() => {
    if (!createEdge) return;
    const displayEdgesWithCreatedEdge = union(displayEdges ?? [], [createEdge]);
    if (!isEqual(displayEdgesWithCreatedEdge, displayEdges ?? [])) {
      setLocalFieldValue('edges.display', displayEdgesWithCreatedEdge);
    }
  }, [createEdge, displayEdges, setLocalFieldValue]);

  const stageFilter = useStageFormValue<CurrentFilters | undefined>('filter');
  const edgeFilters = getEdgeFilters(stageFilter);
  const shouldShowNetworkFilterWarning = getEdgeFilteringWarning(
    edgeFilters,
    displayEdges ?? [],
  );

  return (
    <Section
      // The shared Section is intentionally uncontrolled. Remount only when
      // edge creation crosses absent/present so its default can auto-open the
      // required display choice without resetting on every edge-type change.
      key={createEdge ? 'with-created-edge' : 'without-created-edge'}
      title={intl.formatMessage(messages.displayedEdges)}
      description={intl.formatMessage(messages.chooseTheEdgeTypesShownOn)}
      toggleable
      defaultOpen={
        !!createEdge ||
        !!initialEdges?.display?.length ||
        !!displayEdges?.length
      }
      disabled={edgesForSubject.length === 0}
      onOpenChange={(nextOpen) => nextOpen || !hasDisabledEdgeOption}
    >
      {shouldShowNetworkFilterWarning && (
        <Alert variant="warning" className="my-7">
          <AlertTitle>
            {intl.formatMessage(messages.networkFilterHidesConfiguredEdgeTypes)}
          </AlertTitle>
          <AlertDescription>
            {intl.formatMessage(messages.stageLevelNetworkFilteringIsEnabled)}
          </AlertDescription>
        </Alert>
      )}
      {hasDisabledEdgeOption && (
        <Alert variant="info" className="my-7">
          <AlertDescription>
            {intl.formatMessage(messages.theEdgeTypeBeingCreatedMust)}
          </AlertDescription>
        </Alert>
      )}
      <ArchitectField
        name="edges.display"
        component={CheckboxGroupField}
        options={displayEdgesOptions}
        label={intl.formatMessage(messages.edgeTypes)}
        initialValue={initialEdges?.display ?? EMPTY_DISPLAY_EDGES}
      />
    </Section>
  );
};
export default DisplayEdges;
