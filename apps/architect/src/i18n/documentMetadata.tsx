import { useLayoutEffect } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { getArchitectIntl } from './imperative';
import { architectLocales } from './locales';

const messages = defineMessages({
  previewTitle: {
    id: 'architect.document.previewTitle',
    defaultMessage: 'Architect Preview',
    description:
      'Browser tab title for the separate interview preview window. Architect is the product name.',
  },
});

function updateDocument(intl: IntlShape, preview: boolean) {
  document.documentElement.lang = intl.locale;
  document.documentElement.dir =
    architectLocales.find((entry) => entry.locale === intl.locale)?.direction ??
    'ltr';
  document.title = preview
    ? intl.formatMessage(messages.previewTitle)
    : 'Architect';
  const loaderMessage = document.getElementById('boot-loader-message');
  if (loaderMessage) {
    loaderMessage.textContent = intl.formatMessage(commonMessages.loading);
  }
}

/** Set researcher metadata before startup storage and service-worker awaits. */
export function initializeArchitectDocument(preview = false) {
  updateDocument(getArchitectIntl(), preview);
}

/** Keep the preview tab title reactive without using its participant locale. */
export function PreviewDocumentMetadata() {
  const intl = useAppIntl();
  useLayoutEffect(() => updateDocument(intl, true), [intl]);
  return null;
}
