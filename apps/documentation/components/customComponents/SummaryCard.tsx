import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('SummaryCard');
  return (
    <div className="border-outline bg-accent text-accent-contrast my-8 rounded border p-6 text-base [--link:var(--accent-contrast)]">
      {children}
      <Heading level="h4" variant="all-caps">
        {t('duration')}
      </Heading>
      <Paragraph className="flex items-center gap-2" margin="none">
        <Clock className="h-5 w-5 shrink-0" aria-hidden /> {duration}
      </Paragraph>
    </div>
  );
};

export const SummarySection = ({ children }: { children: ReactNode }) => {
  const t = useTranslations('SummaryCard');
  return (
    <>
      <Heading level="h4" variant="all-caps">
        {t('summary')}
      </Heading>
      {children}
    </>
  );
};

export const PrerequisitesSection = ({ children }: { children: ReactNode }) => {
  const t = useTranslations('SummaryCard');
  return (
    <>
      <Heading level="h4" variant="all-caps">
        {t('prerequisites')}
      </Heading>
      {children}
    </>
  );
};
