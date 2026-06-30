import { compose } from 'react-recompose';
import { connect } from 'react-redux';
import { Field, FormSection } from 'redux-form';

import EditableAttributesList from '~/components/EditableAttributesList/EditableAttributesList';
import { Row, Section } from '~/components/EditorLayout';
import withCreateVariableHandlers from '~/components/enhancers/withCreateVariableHandler';
import withDisabledSubjectRequired from '~/components/enhancers/withDisabledSubjectRequired';
import withSubject from '~/components/enhancers/withSubject';
import { ValidatedField } from '~/components/Form';
import { Toggle } from '~/components/Form/Fields';
import CheckboxGroup from '~/components/Form/Fields/CheckboxGroup';
import IssueAnchor from '~/components/IssueAnchor';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
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
}: NodeConfigurationProps) => (
  <Section
    title="Node Configuration"
    summary={
      <p>
        Configure the node type, variable mappings, layout behaviour, group
        hulls, and the attributes collected for each node.
      </p>
    }
    disabled={disabled}
    disabledMessage={disabledMessage}
    layout="horizontal"
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

    <Row>
      <IssueAnchor fieldName="layoutVariable" description="Layout Variable" />
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

    <FormSection name="behaviours">
      <Row>
        <IssueAnchor
          fieldName="behaviours.automaticLayout"
          description="Default automatic layout"
        />
        <Field
          name="automaticLayout"
          label="Start with automatic layout switched on"
          component={Toggle}
        />
      </Row>
    </FormSection>

    <Row>
      <Field
        name="convexHulls"
        component={CheckboxGroup}
        label="Select one or more categorical variables"
        placeholder="&mdash; Toggle a variable to draw a hull &mdash;"
        options={categoricalVariablesForSubject}
      />
    </Row>

    <EditableAttributesList
      fieldName="nodeForm.fields"
      entity={entity === 'ego' ? 'node' : entity}
      type={type}
      form={form}
      editFormName="node-attr-edit"
      title="Edit attribute"
      handleChangeFields={handleChangeFields}
    />
  </Section>
);

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
