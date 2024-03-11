import { Card, CardContent } from '~/components/ui/card';
import { type ReactNode } from 'react';

type KeyConceptProps = {
  title: string;
  children: ReactNode;
};

const KeyConcept = ({ children, title }: KeyConceptProps) => {
  return (
    <Card className="my-2">
      <span className="mt-2 block text-center uppercase">{title}</span>
      <CardContent>
        <div className="text-sm leading-5">{children}</div>
      </CardContent>
    </Card>
  );
};

export default KeyConcept;
