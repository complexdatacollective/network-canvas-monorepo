import type { ComponentProps } from 'react';
import { useState } from 'react';
import { compose } from 'react-recompose';
import { connect } from 'react-redux';

import NewVariableWindow from '~/components/NewVariableWindow/NewVariableWindow';
import type { RootState } from '~/ducks/store';
import { Button } from '~/lib/legacy-ui/components';

import { getEntityProperties } from './helpers';
import Variables from './Variables';

type UsageItem = {
  label: string;
  id?: string;
};

type Variable = {
  id: string;
  name: string;
  component: string;
  inUse: boolean;
  usage: UsageItem[];
  usageString?: string;
};

type VariablesComponentProps = {
  variables: Variable[];
  entity: string;
};

type EgoTypeProps = {
  variables?: Record<string, Variable>;
};

const EgoType = ({ variables = {} }: EgoTypeProps) => {
  const [showAddVariable, setShowAddVariable] = useState(false);

  const variableArray = Object.values(variables);
  const VariablesTyped =
    Variables as unknown as React.ComponentType<VariablesComponentProps>;

  return (
    <div className="py-(--space-md)">
      <div className="flex items-center gap-(--space-md)">
        <h3 className="my-0">Variables:</h3>
        <Button
          color="sea-green"
          size="small"
          onClick={() => setShowAddVariable(true)}
        >
          Add variable
        </Button>
      </div>
      {variableArray.length > 0 ? (
        <VariablesTyped variables={variableArray} entity="ego" />
      ) : (
        <p className="text-muted-foreground mt-(--space-md)">
          No ego variables yet.
        </p>
      )}
      <NewVariableWindow
        show={showAddVariable}
        entity="ego"
        type=""
        onComplete={() => setShowAddVariable(false)}
        onCancel={() => setShowAddVariable(false)}
      />
    </div>
  );
};

const mapStateToProps = (state: RootState) => {
  const entityProperties = getEntityProperties(state, { entity: 'ego' });
  return entityProperties;
};

export default compose<ComponentProps<typeof EgoType>, typeof EgoType>(
  connect(mapStateToProps),
)(EgoType);
