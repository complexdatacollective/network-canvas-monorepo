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
  search?: string;
  unusedOnly?: boolean;
};

const EgoType = ({
  variables = {},
  search = '',
  unusedOnly = false,
}: EgoTypeProps) => {
  const [showAddVariable, setShowAddVariable] = useState(false);

  const variableArray = Object.values(variables);
  const term = search.trim().toLowerCase();
  const filteredVariables = variableArray.filter((variable) => {
    if (unusedOnly && variable.inUse) {
      return false;
    }
    if (term && !variable.name.toLowerCase().includes(term)) {
      return false;
    }
    return true;
  });

  const VariablesTyped =
    Variables as unknown as React.ComponentType<VariablesComponentProps>;

  return (
    <div className="py-(--space-md)">
      <div className="flex justify-end">
        <Button
          color="sea-green"
          size="small"
          onClick={() => setShowAddVariable(true)}
        >
          Add variable
        </Button>
      </div>
      {filteredVariables.length > 0 ? (
        <VariablesTyped variables={filteredVariables} entity="ego" />
      ) : (
        <p className="text-muted-foreground mt-(--space-md)">
          {variableArray.length === 0
            ? 'No ego variables yet.'
            : 'No ego variables match the current filter.'}
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

// Props passed in by the parent; `variables` is injected by `connect`.
type EgoOwnProps = {
  search?: string;
  unusedOnly?: boolean;
};

export default compose<EgoTypeProps, EgoOwnProps>(connect(mapStateToProps))(
  EgoType,
);
