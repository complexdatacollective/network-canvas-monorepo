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
    <summary className="my-5 rounded-lg bg-card">
      <CardContent className="p-6">
        {children}
        <Heading variant={'h4-all-caps'}>Duration:</Heading>
        <Paragraph className="flex items-center gap-2" margin="none">
          <Clock className="h-5 w-5 shrink-0" /> {completion_time}
        </Paragraph>
      </CardContent>
    </summary>
  );
};

export const SummarySection = ({ children }: { children: ReactNode }) => {
  return (
    <>
      <Heading variant={'h4-all-caps'}>Summary:</Heading>
      {children}
    </>
  );
};

export const PrerequisitesSection = ({ children }: { children: ReactNode }) => {
  return (
    <>
      <Heading variant={'h4-all-caps'}>Prerequisites:</Heading>
      {children}
    </>
  );
};
