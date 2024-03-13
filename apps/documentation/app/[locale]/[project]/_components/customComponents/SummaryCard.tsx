import { Heading, Paragraph } from '@codaco/ui';
import { Clock } from 'lucide-react';
import { type ReactNode } from 'react';

export const SummaryCard = ({
  completionTime,
  children,
}: {
  children: ReactNode;
  completionTime: string;
}) => {
  return (
    <summary className="my-5 rounded-lg bg-card p-6">
      {children}
      <Heading variant={'h4-all-caps'}>Duration:</Heading>
      <Paragraph className="flex items-center gap-2" margin="none">
        <Clock className="h-5 w-5 shrink-0" /> {completionTime}
      </Paragraph>
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
