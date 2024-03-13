import { Heading, Paragraph } from '@codaco/ui';
import { Clock } from 'lucide-react';
import { type ReactNode } from 'react';
import { Card, CardContent } from '~/components/ui/card';

export const SummaryCard = ({
  completion_time,
  children,
}: {
  children: ReactNode;
  completion_time: string;
}) => {
  return (
    <Card className="mt-10 bg-card">
      <CardContent className="flex flex-col gap-4 p-4">
        {children}
        <div>
          <Heading variant={'h4-all-caps'}>Duration:</Heading>
          <div className="flex items-center gap-1.5">
            <Clock className="h-5 w-5 shrink-0" />
            <Paragraph>{completion_time}</Paragraph>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const SummarySection = ({ children }: { children: ReactNode }) => {
  return (
    <div>
      <Heading variant={'h4-all-caps'}>Summary:</Heading>
      {children}
    </div>
  );
};

export const PrerequisitesSection = ({ children }: { children: ReactNode }) => {
  return (
    <div>
      <Heading variant={'h4-all-caps'}>Prerequisites:</Heading>
      {children}
    </div>
  );
};
