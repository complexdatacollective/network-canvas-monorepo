import type { SVGProps } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

const messages = defineMessages({
  title: {
    id: 'frescoUi.icon.highlighted',
    defaultMessage: 'Highlighted',
    description: 'Accessible name (SVG title) of the highlighted icon.',
  },
});

export default function Icon(props: SVGProps<SVGSVGElement>) {
  const intl = useAppIntl();
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 70" {...props}>
      <title>{intl.formatMessage(messages.title)}</title>
      <circle className="fill-white/20" cx="35" cy="35" r="35" />
      <circle className="fill-platinum-dark" cx="35" cy="35" r="27.5" />
      <path
        className="fill-platinum"
        d="M35 7.5a27.5 27.5 0 0 0-19.45 46.95l38.9-38.9A27.41 27.41 0 0 0 35 7.5z"
      />
      <circle className="fill-node-1-contrast" cx="35" cy="35" r="20" />
      <path
        className="fill-node-1"
        d="M35 15a20 20 0 0 0-14.14 34.14l28.28-28.28A19.94 19.94 0 0 0 35 15z"
      />
    </svg>
  );
}
