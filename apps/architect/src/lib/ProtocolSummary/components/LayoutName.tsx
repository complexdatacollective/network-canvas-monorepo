import { useContext } from 'react';

import SummaryContext from './SummaryContext';

type LayoutNameProps = {
  id: string;
};

/**
 * A layout of the codebook, printed by its name. A layout the codebook no
 * longer has is printed by its id, so the row still says what the stage
 * stored.
 */
const LayoutName = ({ id }: LayoutNameProps) => {
  const { protocol } = useContext(SummaryContext);
  return <bdi>{protocol.codebook.layouts?.[id]?.name ?? id}</bdi>;
};

export default LayoutName;
