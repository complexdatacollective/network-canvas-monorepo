import { useContext } from 'react';

import type { SkipLogicDestination } from '@codaco/protocol-validation';
import { getSkipLogicDestinationLabel } from '~/utils/skipLogicDestination';

import MiniTable from '../MiniTable';
import Rules from '../Rules';
import SummaryContext from '../SummaryContext';

type FilterType = {
  join?: string;
  rules: Array<{ type: string; options: Record<string, unknown> }>;
};

type SkipLogicProps = {
  skipLogic: Record<string, unknown>;
};

const SkipLogic = ({ skipLogic }: SkipLogicProps) => {
  const { protocol } = useContext(SummaryContext);

  if (!skipLogic) {
    return null;
  }

  const { filter, action, destination } = skipLogic as {
    filter?: FilterType;
    action?: string;
    destination?: SkipLogicDestination;
  };

  return (
    <MiniTable
      rotated
      wide
      rows={[
        ['Action', action],
        [
          'Destination',
          getSkipLogicDestinationLabel(protocol.stages ?? [], destination),
        ],
        ['Rules', filter ? <Rules key="rules" filter={filter} /> : null],
      ]}
    />
  );
};

export default SkipLogic;
