import { type ReactNode } from 'react';
import { Callout } from '~/components/Callout';

type TipBoxProps = {
  children: ReactNode;
  danger: boolean;
};

const TipBox = ({ children, danger }: TipBoxProps) => {
  return (
    <Callout
      title={danger ? 'Danger' : 'Tip'}
      type={danger ? 'warning' : 'info'}
    >
      {children}
    </Callout>
  );
};

export default TipBox;
