import { isEqual, union } from 'es-toolkit/compat';
import { useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';

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
      title="Displayed edges"
      description="Choose the edge types shown on this prompt."
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
          <AlertTitle>Network filter hides configured edge types</AlertTitle>
          <AlertDescription>
            Stage level network filtering is enabled, but one or more of the
            edge types you have configured to display on this prompt are not
            currently included in the filter. This means that these edges may
            not be displayed. Either remove the stage-level network filtering,
            or add these edge types to the filter to resolve this issue.
          </AlertDescription>
        </Alert>
      )}
      {hasDisabledEdgeOption && (
        <Alert variant="info" className="my-7">
          <AlertDescription>
            The edge type being created must always be displayed. This edge type
            is shown in italics below, and cannot be deselected.
          </AlertDescription>
        </Alert>
      )}
      <ArchitectField
        name="edges.display"
        component={CheckboxGroupField}
        options={displayEdgesOptions}
        label="Edge types"
        initialValue={initialEdges?.display ?? EMPTY_DISPLAY_EDGES}
      />
    </Section>
  );
};
export default DisplayEdges;
