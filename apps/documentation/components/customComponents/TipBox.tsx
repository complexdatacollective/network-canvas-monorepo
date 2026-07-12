import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Alert, AlertTitle } from '@codaco/fresco-ui/Alert';

export type TipBoxProps = {
  children: ReactNode;
  danger: boolean;
};

const TipBox = ({ children, danger = false }: TipBoxProps) => {
  const t = useTranslations('TipBox');
  const type = danger ? 'warning' : 'info';

  return (
    <Alert variant={type}>
      <AlertTitle>{t(type)}</AlertTitle>
      {children}
    </Alert>
  );
};

export default TipBox;
