import { Clock } from 'lucide-react';
import type { ReactNode } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

export const SummaryCard = ({
  duration,
  children,
}: {
  children: ReactNode;
  duration: string;
}) => {
  return (
    <div className="border-outline bg-accent text-accent-contrast my-8 rounded border p-6 text-base [--link:var(--accent-contrast)]">
      {children}
      <Heading level="h4" variant="all-caps">
        Duration:
      </Heading>
      <Paragraph className="flex items-center gap-2" margin="none">
        <Clock className="h-5 w-5 shrink-0" /> {duration}
      </Paragraph>
    </div>
  );
};

export const SummarySection = ({ children }: { children: ReactNode }) => {
  return (
    <>
      <Heading level="h4" variant="all-caps">
        Summary:
      </Heading>
      {children}
    </>
  );
};

export const PrerequisitesSection = ({ children }: { children: ReactNode }) => {
  return (
    <>
      <Heading level="h4" variant="all-caps">
        Prerequisites:
      </Heading>
      {children}
    </>
  );
};
