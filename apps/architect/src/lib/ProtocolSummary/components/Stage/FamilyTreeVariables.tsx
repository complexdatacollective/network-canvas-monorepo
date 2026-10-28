import { useAppIntl } from '@codaco/app-i18n/react';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import MiniTable from '../MiniTable';
import Variable from '../Variable';

type FamilyTreeVariablesProps = {
  relationshipTypeVariable?: string;
  relationshipToEgoVariable?: string;
  egoSexVariable?: string;
  nodeSexVariable?: string;
  nodeIsEgoVariable?: string;
};

const FamilyTreeVariables = ({
  relationshipTypeVariable,
  relationshipToEgoVariable,
  egoSexVariable,
  nodeSexVariable,
  nodeIsEgoVariable,
}: FamilyTreeVariablesProps) => {
  const intl = useAppIntl();
  if (
    !relationshipTypeVariable &&
    !relationshipToEgoVariable &&
    !egoSexVariable &&
    !nodeSexVariable &&
    !nodeIsEgoVariable
  ) {
    return null;
  }

  const rows: [string, React.ReactNode][] = [];
  if (relationshipTypeVariable) {
    rows.push([
      intl.formatMessage(summaryMessages.relationshipType),
      <Variable key="rel-type" id={relationshipTypeVariable} />,
    ]);
  }
  if (relationshipToEgoVariable) {
    rows.push([
      intl.formatMessage(summaryMessages.relationshipToEgo),
      <Variable key="rel-ego" id={relationshipToEgoVariable} />,
    ]);
  }
  if (egoSexVariable) {
    rows.push([
      intl.formatMessage(summaryMessages.egoSexAttribute),
      <Variable key="ego-sex" id={egoSexVariable} />,
    ]);
  }
  if (nodeSexVariable) {
    rows.push([
      intl.formatMessage(summaryMessages.nodeSexAttribute),
      <Variable key="node-sex" id={nodeSexVariable} />,
    ]);
  }
  if (nodeIsEgoVariable) {
    rows.push([
      intl.formatMessage(summaryMessages.nodeIsEgo),
      <Variable key="is-ego" id={nodeIsEgoVariable} />,
    ]);
  }

  return <MiniTable rotated rows={rows} />;
};

export default FamilyTreeVariables;
