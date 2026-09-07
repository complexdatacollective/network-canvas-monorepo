import { useState } from 'react';
import { compose } from 'react-recompose';
import { connect } from 'react-redux';

import { type IntlShape, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import NewVariableWindow from '~/components/NewVariableWindow/NewVariableWindow';
import type { RootState } from '~/ducks/store';

import { getEntityProperties } from './helpers';
import Variables from './Variables';
const messages = defineMessages({
  addAttribute: {
    id: 'architect.codebook.egoType.addAttribute',
    defaultMessage: 'Add attribute',
    description: 'Visible text in components / Codebook / EgoType.',
  },
  noEgoAttributesYet: {
    id: 'architect.codebook.egoType.noEgoAttributesYet',
    defaultMessage: 'No ego attributes yet.',
    description: 'Visible text in components / Codebook / EgoType.',
  },
  noEgoAttributesMatchTheCurrent: {
    id: 'architect.codebook.egoType.noEgoAttributesMatchTheCurrent',
    defaultMessage: 'No ego attributes match the current filter.',
    description: 'Visible text in components / Codebook / EgoType.',
  },
});

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
  const intl = useAppIntl();
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
    <div className="py-5">
      <div className="flex justify-end">
        <Button
          color="primary"
          size="sm"
          onClick={() => setShowAddVariable(true)}
        >
          {intl.formatMessage(messages.addAttribute)}
        </Button>
      </div>
      {filteredVariables.length > 0 ? (
        <VariablesTyped variables={filteredVariables} entity="ego" />
      ) : (
        <Paragraph className="mt-5 text-current/70">
          {variableArray.length === 0
            ? intl.formatMessage(messages.noEgoAttributesYet)
            : intl.formatMessage(messages.noEgoAttributesMatchTheCurrent)}
        </Paragraph>
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
const mapStateToProps = (state: RootState, { intl }: { intl: IntlShape }) => {
  const entityProperties = getEntityProperties(state, { entity: 'ego' }, intl);
  return entityProperties;
};
// Props passed in by the parent; `variables` is injected by `connect`.
type EgoOwnProps = {
  search?: string;
  unusedOnly?: boolean;
};
const ConnectedEgoType = compose<
  EgoTypeProps,
  EgoOwnProps & { intl: IntlShape }
>(connect(mapStateToProps))(EgoType);

export default function LocalizedEgoType(props: EgoOwnProps) {
  const intl = useAppIntl();
  return <ConnectedEgoType {...props} intl={intl} />;
}
