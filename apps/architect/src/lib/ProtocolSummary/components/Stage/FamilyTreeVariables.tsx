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

  const rows = [
    relationshipTypeVariable && [
      intl.formatMessage(summaryMessages.relationshipType),
      <Variable key="rel-type" id={relationshipTypeVariable} />,
    ],
    relationshipToEgoVariable && [
      intl.formatMessage(summaryMessages.relationshipToEgo),
      <Variable key="rel-ego" id={relationshipToEgoVariable} />,
    ],
    egoSexVariable && [
      intl.formatMessage(summaryMessages.egoSexAttribute),
      <Variable key="ego-sex" id={egoSexVariable} />,
    ],
    nodeSexVariable && [
      intl.formatMessage(summaryMessages.nodeSexAttribute),
      <Variable key="node-sex" id={nodeSexVariable} />,
    ],
    nodeIsEgoVariable && [
      intl.formatMessage(summaryMessages.nodeIsEgo),
      <Variable key="is-ego" id={nodeIsEgoVariable} />,
    ],
  ].filter(Boolean) as [string, React.ReactNode][];

  return <MiniTable rotated rows={rows} />;
};

export default FamilyTreeVariables;
