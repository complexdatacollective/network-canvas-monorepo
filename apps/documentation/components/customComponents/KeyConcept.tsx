import type { ReactNode } from 'react';

import { Alert, AlertTitle } from '@codaco/fresco-ui/Alert';

type KeyConceptProps = {
  title: string;
  children: ReactNode;
};

const KeyConcept = ({ children, title }: KeyConceptProps) => {
  return (
    <Alert variant="accent" appearance="soft">
      <AlertTitle>{title}</AlertTitle>
      {children}
    </Alert>
  );
};

export default KeyConcept;
