import { defineMessages } from '@codaco/app-i18n/messages';

export const proxyMessages = defineMessages({
  copyServerActionRefused: {
    id: 'fresco.proxy.copyServerActionRefused',
    defaultMessage: 'This route does not accept Server Action requests.',
    description:
      'Refusal shown when a request carries a Server Action (Next-Action) header aimed at a public participant or infrastructure route.',
  },
});
