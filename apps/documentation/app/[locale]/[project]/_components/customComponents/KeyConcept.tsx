import { Card, CardContent } from '@/components/ui/card';
import { type ReactNode } from 'react';

type KeyConceptProps = {
  title: string;
  children: ReactNode;
};

const KeyConcept = ({ children, title }: KeyConceptProps) => {
  return (
    <Card className="my-2 bg-violet-500">
      <span className="mt-2 block text-center uppercase text-white">
        {title}
      </span>
      <CardContent>
        <div className="text-sm leading-5 text-white">{children}</div>
      </CardContent>
    </Card>
  );
};

export default KeyConcept;
