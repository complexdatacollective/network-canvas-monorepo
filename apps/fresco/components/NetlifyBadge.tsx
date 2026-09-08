'use client';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { env } from '~/env';

const messages = defineMessages({
  deploysByNetlify: {
    id: 'fresco.NetlifyBadge.deploysByNetlify',
    defaultMessage: 'Deploys by Netlify',
    description: 'Researcher-facing NetlifyBadge: Deploys by Netlify',
  },
});

export default function NetlifyBadge() {
  const intl = useAppIntl();

  if (!env.SANDBOX_MODE) {
    return null;
  }

  return (
    <footer className="flex justify-center py-4">
      <a
        href="https://www.netlify.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          src="https://www.netlify.com/assets/badges/netlify-badge-color-accent.svg"
          alt={intl.formatMessage(messages.deploysByNetlify)}
        />
      </a>
    </footer>
  );
}
