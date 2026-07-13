'use client';

// Client component: the Lightbulb icon component is passed to the client-only
// Alert, so it must not cross a Server→Client boundary as a function prop.

import { Lightbulb } from 'lucide-react';
import type { ReactNode } from 'react';

import { Alert, AlertTitle } from '@codaco/fresco-ui/Alert';

type KeyConceptProps = {
  title: string;
  children: ReactNode;
};

const KeyConcept = ({ children, title }: KeyConceptProps) => {
  return (
    <Alert variant="accent" appearance="soft" icon={Lightbulb}>
      <AlertTitle>{title}</AlertTitle>
      {children}
    </Alert>
  );
};

export default KeyConcept;
