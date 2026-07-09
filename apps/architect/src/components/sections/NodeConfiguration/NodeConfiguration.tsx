import { useEffect } from 'react';
import { compose } from 'react-recompose';
import { connect } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import EditableAttributesList from '~/components/EditableAttributesList/EditableAttributesList';
import { Row, Section, Subsection } from '~/components/EditorLayout';
import withCreateVariableHandlers from '~/components/enhancers/withCreateVariableHandler';
import withDisabledSubjectRequired from '~/components/enhancers/withDisabledSubjectRequired';
import withSubject from '~/components/enhancers/withSubject';
import { ValidatedField } from '~/components/Form';
import IssueAnchor from '~/components/IssueAnchor';
import NewVariableWindow, {
  type Entity,
  useNewVariableWindowState,
} from '~/components/NewVariableWindow';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import type { RootState } from '~/ducks/modules/root';
import { getVariableOptionsForSubject } from '~/selectors/codebook';

import VariablePicker from '../../Form/Fields/VariablePicker/VariablePicker';
import withComposerFormHandlers from '../Form/withComposerFormHandlers';
import { getLayoutVariablesForSubject } from '../SociogramPrompts/selectors';

type LayoutVariableOption = {
  isUsed?: boolean;
  label: string;
  type: string;
  value: string;
};

type CategoricalVariableOption = {
  isUsed?: boolean;
  label: string;
  type?: string;
  value: string;
};

type TextVariableOption = {
  isUsed?: boolean;
  label: string;
  type?: string;
  value: string;
};

export type NodeConfigurationProps = {
  entity: 'node' | 'edge' | 'ego';
  type: string | null;
  form: string;
  disabled?: boolean;
  disabledMessage?: string;
  handleCreateVariable: (
    value: string,
    variableType: string,
    fieldName: string,
  ) => void;
  handleChangeFields: (fields: Array<Record<string, unknown>>) => void;
  layoutVariablesForSubject: LayoutVariableOption[];
  categoricalVariablesForSubject: CategoricalVariableOption[];
  quickAddOptionsForSubject: TextVariableOption[];
};

export const NodeConfigurationComponent = ({
  entity,
  type,
  form,
  disabled = false,
  disabledMessage,
  handleCreateVariable,
  handleChangeFields,
  layoutVariablesForSubject,
  categoricalVariablesForSubject,
  quickAddOptionsForSubject,
}: NodeConfigurationProps) => {
  const dispatch = useAppDispatch();

  const rawAutomaticLayout = useAppSelector((state) =>
    formValueSelector(form)(state, 'behaviours.automaticLayout'),
  );
  const automaticLayout =
    typeof rawAutomaticLayout === 'boolean' ? rawAutomaticLayout : true;

  // Selecting a node type resets subject-dependent fields, setting `behaviours`
  // to null (NodeType.handleResetStage) — and redux-form's formValueSelector
  // returns `null` (not undefined) for a path under a null parent. Re-seed the
  // template default (on) whenever the value is not a real boolean, so the
  // default survives the reset and an unset field never renders as off.
  useEffect(() => {
    if (typeof rawAutomaticLayout !== 'boolean') {
      dispatch(change(form, 'behaviours.automaticLayout', true));
    }
  }, [rawAutomaticLayout, dispatch, form]);

  const newVariableWindowInitialProps = {
    entity: (entity === 'ego' ? 'node' : entity) as Entity,
    type: type ?? '',
    initialValues: { name: '', type: 'categorical' },
  };

  const handleCreatedGroupVariable = (...args: unknown[]) => {
    const [id] = args;
    if (typeof id !== 'string') {
      return;
    }
    dispatch(change(form, 'convexHullVariable', id));
  };

  const [newVariableWindowProps, openNewVariableWindow] =
    useNewVariableWindowState(
      newVariableWindowInitialProps,
      handleCreatedGroupVariable,
    );

  return (
    <Section
      title="Node Configuration"
      summary={
        <p>
          Configure the variable mappings, layout behaviour, group hulls, and
          the attributes collected for each node.
        </p>
      }
      disabled={disabled}
      disabledMessage={disabledMessage}
      layout="horizontal"
    >
      <Subsection
        title="Quick add variable"
        summary="The variable populated by the inline quick-add field when a node is added from the toolbar — typically a name or label."
      >
        <Row>
          <IssueAnchor fieldName="quickAdd" description="Quick Add Variable" />
          <ValidatedField
            name="quickAdd"
            component={VariablePicker}
            validation={{ required: true }}
            componentProps={{
              label: 'Create or select a variable for the quick-add form',
              type,
              entity,
              options: quickAddOptionsForSubject,
              onCreateOption: (value: string) =>
                handleCreateVariable(value, 'text', 'quickAdd'),
            }}
          />
        </Row>
      </Subsection>

      <Subsection
        title="Node positions"
        summary="Stores each node's position on the canvas. Reusing the same variable across stages preserves positions as the participant moves between tasks."
      >
        <Row>
          <IssueAnchor
            fieldName="layoutVariable"
            description="Layout Variable"
          />
          <ValidatedField
            name="layoutVariable"
            component={VariablePicker}
            validation={{ required: true }}
            componentProps={{
              label: 'Create or select a variable to store node coordinates',
              type,
              entity,
              options: layoutVariablesForSubject,
              onCreateOption: (value: string) =>
                handleCreateVariable(value, 'layout', 'layoutVariable'),
            }}
          />
        </Row>
      </Subsection>

      <Subsection
        title="Automatic layout"
        summary="When on, nodes are arranged by a force-directed layout. Participants can toggle this during the interview; this sets the starting state."
      >
        <Row>
          <IssueAnchor
            fieldName="behaviours.automaticLayout"
            description="Default automatic layout"
          />
          <div className="flex flex-row items-center gap-5">
            <ToggleField
              title="Start with automatic layout switched on"
              value={automaticLayout}
              onChange={(checked) =>
                dispatch(change(form, 'behaviours.automaticLayout', checked))
              }
            />
            <span>Start with automatic layout switched on</span>
          </div>
        </Row>
      </Subsection>

      <Subsection
        title="Group hulls"
        summary="Draw shaded outlines around groups of nodes that share a value of a categorical variable. Choose (or create) the variable whose values participants can group nodes into — by tapping nodes with the Groups tool, or by lasso-selecting several at once."
      >
        <Row>
          <IssueAnchor
            fieldName="convexHullVariable"
            description="Group hull variable"
          />
          <ValidatedField
            name="convexHullVariable"
            component={VariablePicker}
            validation={{}}
            componentProps={{
              label: 'Create or select a categorical variable for grouping',
              type,
              entity,
              options: categoricalVariablesForSubject,
              onCreateOption: (name: string) =>
                openNewVariableWindow(
                  { initialValues: { name, type: 'categorical' } },
                  { field: 'convexHullVariable' },
                ),
            }}
          />
        </Row>
      </Subsection>

      <Subsection
        title="Editable attributes"
        summary="The attributes shown in the side panel when a node is selected, so they can be edited during the interview. Each attribute pairs a variable with the input control used to collect it."
      >
        <EditableAttributesList
          fieldName="nodeForm.fields"
          entity={entity === 'ego' ? 'node' : entity}
          type={type}
          form={form}
          editFormName="node-attr-edit"
          title="Edit attribute"
          handleChangeFields={handleChangeFields}
        />
      </Subsection>

      <NewVariableWindow
        // eslint-disable-next-line react/jsx-props-no-spreading
        {...newVariableWindowProps}
      />
    </Section>
  );
};

type OwnProps = {
  entity: 'node' | 'edge' | 'ego';
  type: string | null;
  form: string;
};

const withLayoutOptions = connect(
  (state: RootState, { entity, type }: OwnProps) => ({
    layoutVariablesForSubject: type
      ? getLayoutVariablesForSubject(state, { entity, type })
      : [],
  }),
);

const withCategoricalOptions = connect(
  (state: RootState, { entity, type }: OwnProps) => ({
    categoricalVariablesForSubject: type
      ? getVariableOptionsForSubject(state, { entity, type }).filter(
          ({ type: variableType }) => variableType === 'categorical',
        )
      : [],
  }),
);

const withQuickAddOptions = connect(
  (state: RootState, { entity, type }: OwnProps) => ({
    quickAddOptionsForSubject: type
      ? getVariableOptionsForSubject(state, { entity, type }).filter(
          ({ type: variableType }) => variableType === 'text',
        )
      : [],
  }),
);

export default compose<NodeConfigurationProps, StageEditorSectionProps>(
  withSubject,
  withCreateVariableHandlers,
  withComposerFormHandlers,
  withDisabledSubjectRequired,
  withLayoutOptions,
  withCategoricalOptions,
  withQuickAddOptions,
)(NodeConfigurationComponent);
