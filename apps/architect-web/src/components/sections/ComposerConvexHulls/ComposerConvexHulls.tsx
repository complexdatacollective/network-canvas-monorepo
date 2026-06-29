import { compose } from 'react-recompose';
import { connect } from 'react-redux';
import { Field } from 'redux-form';

import { Row, Section } from '~/components/EditorLayout';
import withSubject from '~/components/enhancers/withSubject';
import CheckboxGroup from '~/components/Form/Fields/CheckboxGroup';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import type { RootState } from '~/ducks/modules/root';
import { getVariableOptionsForSubject } from '~/selectors/codebook';

type CategoricalVariableOption = {
  isUsed?: boolean;
  label: string;
  type?: string;
  value: string;
};

type ComposerConvexHullsProps = {
  categoricalVariablesForSubject: CategoricalVariableOption[];
};

const ComposerConvexHullsComponent = ({
  categoricalVariablesForSubject,
}: ComposerConvexHullsProps) => {
  return (
    <Section
      title="Group Hulls"
      summary={
        <p>
          Select one or more categorical variables below. Nodes that share a
          value for the selected variable will be enclosed by a coloured hull on
          the canvas, grouping them visually.
        </p>
      }
      disabled={categoricalVariablesForSubject.length === 0}
      group
      layout="vertical"
    >
      <Row>
        <Field
          name="convexHulls"
          component={CheckboxGroup}
          label="Select one or more categorical variables"
          placeholder="&mdash; Toggle a variable to draw a hull &mdash;"
          options={categoricalVariablesForSubject}
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

const withCategoricalOptions = connect(
  (state: RootState, { entity, type }: OwnProps) => ({
    categoricalVariablesForSubject: getVariableOptionsForSubject(state, {
      entity,
      type,
    }).filter(({ type: variableType }) => variableType === 'categorical'),
  }),
);

export default compose<ComposerConvexHullsProps, StageEditorSectionProps>(
  withSubject,
  withCategoricalOptions,
)(ComposerConvexHullsComponent);
