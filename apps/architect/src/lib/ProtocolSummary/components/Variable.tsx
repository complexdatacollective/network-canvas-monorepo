import { useContext } from 'react';

import type { VariableType } from '@codaco/protocol-validation';
import { VariablePill } from '~/components/VariablePill';

import DualLink from './DualLink';
import { getVariableMeta, getVariableName } from './helpers';
import SummaryContext from './SummaryContext';

type VariableProps = {
  id: string;
};

const Variable = ({ id }: VariableProps) => {
  const { index } = useContext(SummaryContext);

  if (!id) return null;

  const meta = getVariableMeta(index, id);
  const name = getVariableName(index, id);

  return (
    <DualLink to={`#variable-${id}`}>
      <VariablePill
        interactive={false}
        label={name}
        type={meta.type as VariableType}
        validations={[]}
      />
    </DualLink>
  );
};

export default Variable;
