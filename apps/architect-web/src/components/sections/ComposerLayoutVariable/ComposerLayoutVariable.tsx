import type { ComponentProps } from 'react';
import { compose } from 'react-recompose';
import { connect } from 'react-redux';
import { formValueSelector } from 'redux-form';

import { Row, Section } from '~/components/EditorLayout';
import withCreateVariableHandlers from '~/components/enhancers/withCreateVariableHandler';
import withSubject from '~/components/enhancers/withSubject';
import { ValidatedField } from '~/components/Form';
import IssueAnchor from '~/components/IssueAnchor';
import type { RootState } from '~/ducks/modules/root';

import VariablePicker from '../../Form/Fields/VariablePicker/VariablePicker';
import { getLayoutVariablesForSubject } from '../SociogramPrompts/selectors';

type LayoutVariableOption = {
  isUsed?: boolean;
  label: string;
  type: string;
  value: string;
};

type ComposerLayoutVariableProps = {
  entity: string;
  type: string;
  handleCreateVariable: (
    value: string,
    variableType: string,
    fieldName: string,
  ) => void;
  layoutVariablesForSubject: LayoutVariableOption[];
};

const ComposerLayoutVariable = ({
  entity,
  type,
  handleCreateVariable,
  layoutVariablesForSubject,
}: ComposerLayoutVariableProps) => {
  return (
    <Section
      title="Node positions"
      summary={
        <p>
          This variable stores the position of each node on the canvas. Choosing
          the same variable across stages preserves node positions as the
          participant moves between tasks.
        </p>
      }
      group
      layout="vertical"
    >
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
    </Section>
  );
};

type OwnProps = {
  entity: 'node' | 'edge' | 'ego';
  type: string;
  form: string;
};

const withLayoutOptions = connect(
  (state: RootState, { entity, type }: OwnProps) => ({
    layoutVariablesForSubject: getLayoutVariablesForSubject(state, {
      entity,
      type,
    }),
    layoutVariable: formValueSelector('edit-stage')(state, 'layoutVariable'),
  }),
);

export default compose<
  ComponentProps<typeof ComposerLayoutVariable>,
  typeof ComposerLayoutVariable
>(
  withSubject,
  withLayoutOptions,
  withCreateVariableHandlers,
)(ComposerLayoutVariable);
