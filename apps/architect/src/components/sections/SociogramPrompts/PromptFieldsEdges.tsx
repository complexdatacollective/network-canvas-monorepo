import { union } from 'es-toolkit/compat';
import { useEffect, useMemo, type ComponentType } from 'react';
import { useSelector } from 'react-redux';
import type { FormAction } from 'redux-form';
import { change, Field, formValueSelector } from 'redux-form';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import { FrescoReduxField } from '~/components/Form';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/modules/root';

import { getEdgeFilters, getEdgesForSubject } from './selectors';
import getEdgeFilteringWarning from './utils';

const FrescoCheckboxGroupField = CheckboxGroupField as ComponentType<
  Record<string, unknown>
>;

type Option = {
  value: string;
  label: string;
  type?: string;
  color?: string;
};
type DisplayEdgesProps = {
  form: string;
  entity: string;
  type: string;
};
const DisplayEdges = ({ form }: DisplayEdgesProps) => {
  const dispatch = useAppDispatch();
  // Fix 1: Use the already memoized selector directly
  const edgesForSubject = useSelector(getEdgesForSubject);
  // Fix 2: Memoize form selectors
  const formSelector = useMemo(() => formValueSelector(form), [form]);
  const createEdge = useSelector((state: RootState) =>
    formSelector(state, 'edges.create'),
  ) as string | undefined;
  const displayEdges = useSelector((state: RootState) =>
    formSelector(state, 'edges.display'),
  ) as string[] | null | undefined;
  // Fix 3: Memoize the mapped array
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: fix inifinite loop
  useEffect(() => {
    const displayEdgesWithCreatedEdge = union(displayEdges ?? [], [createEdge]);
    dispatch(
      change(
        form,
        'edges.display',
        displayEdgesWithCreatedEdge,
      ) as unknown as FormAction,
    );
  }, [createEdge, dispatch, form]);
  const edgeFilters = useSelector((state: RootState) => getEdgeFilters(state));
  const shouldShowNetworkFilterWarning = getEdgeFilteringWarning(
    edgeFilters,
    displayEdges || [],
  );
  return (
    <Section
      title="Display Edges"
      summary={
        <Paragraph>
          You can display one or more edge types on this prompt. Where two nodes
          are connected by multiple edge types, only one of those edge types
          will be displayed.
        </Paragraph>
      }
      toggleable
      startExpanded={!!displayEdges}
      disabled={edgesForSubject.length === 0}
      handleToggleChange={(value: boolean) => {
        // Disallow closing when there is a disabled edge option
        if (!value && hasDisabledEdgeOption) {
          return false;
        }
        if (value) {
          return true;
        }
        // Reset edge creation
        dispatch(change(form, 'edges.display', null) as unknown as FormAction);
        return true;
      }}
      layout="vertical"
    >
      <Row>
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
              The edge type being created must always be displayed. This edge
              type is shown in italics below, and cannot be deselected.
            </AlertDescription>
          </Alert>
        )}
        <Field
          name="edges.display"
          component={FrescoReduxField}
          fieldComponent={FrescoCheckboxGroupField}
          options={displayEdgesOptions}
          label="Display edges of the following type(s)"
        />
      </Row>
    </Section>
  );
};
export default DisplayEdges;
