'use client';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';

const messages = defineMessages({
  onThisPage: {
    id: 'fresco.settings.SettingsNavigation.onThisPage',
    defaultMessage: 'On this page',
    description:
      'Researcher-facing settings / SettingsNavigation: On this page',
  },
});

export type SettingsSection = {
  id: string;
  title: string;
  variant?: 'default' | 'destructive';
};

type SettingsNavigationProps = {
  sections: SettingsSection[];
  className?: string;
};

function handleSmoothScroll(
  e: React.MouseEvent<HTMLAnchorElement>,
  id: string,
) {
  e.preventDefault();
  const element = document.getElementById(id);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Update URL hash without jumping
    window.history.pushState(null, '', `#${id}`);
  }
}

export default function SettingsNavigation({
  sections,
  className,
}: SettingsNavigationProps) {
  const intl = useAppIntl();

  return (
    <Surface
      as="nav"
      spacing="sm"
      className={cx(
        'tablet-landscape:block sticky top-28 hidden h-fit shrink grow-0',
        className,
      )}
      noContainer
    >
      {/* margin="none" applies m-0! (important), so spacing must use padding */}
      <Heading level="h4" variant="all-caps" margin="none" className="pb-3">
        {intl.formatMessage(messages.onThisPage)}
      </Heading>
      <ul className="space-y-0.5">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              onClick={(e) => handleSmoothScroll(e, section.id)}
              className={cx(
                'block rounded-sm px-3 py-1.5 text-sm transition-colors',
                'hover:bg-surface-1',
                section.variant === 'destructive' && 'text-destructive',
              )}
            >
              {section.title}
            </a>
          </li>
        ))}
      </ul>
    </Surface>
  );
}
