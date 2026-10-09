import { Suspense, useMemo } from 'react';

import type { CatalogMessages } from '@codaco/app-i18n/locales';
import {
  createAppIntl,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl, useLocaleCatalog } from '@codaco/app-i18n/react';
import { architectCatalogSource } from '~/locales/catalogs';

// Shell owns its catalog and can select a language independently of Architect.
// Resolve a host-specific message against the Architect catalog explicitly
// while subscribing to the Shell locale, including in an already-open dialog.
export function ShellLanguageMessage({
  message,
}: {
  message: MessageDescriptor;
}) {
  const { locale } = useAppIntl();
  // Usually the Shell renders Architect's own language, which startup already
  // loaded. When it does not, that language's Architect catalog loads here.
  // Keyed by locale so a switch suspends rather than keep the previous
  // language: the sentence is blank for that moment instead of being the one
  // thing in the dialog that has not changed language.
  return (
    <Suspense fallback={null}>
      <ShellLanguageMessageText
        key={locale}
        locale={locale}
        message={message}
      />
    </Suspense>
  );
}

// `useLocaleCatalog` may suspend, and must be the last hook in this
// component. React can replay a suspended render once the catalog has loaded;
// the replay then skips the suspending call, which is what would have told
// React this is a first render, so a hook after it is taken for an update and
// fails ("Update hook called on initial render"). Anything that needs a hook
// renders below, once the catalog is in hand.
function ShellLanguageMessageText({
  locale,
  message,
}: {
  locale: string;
  message: MessageDescriptor;
}) {
  const catalog = useLocaleCatalog(architectCatalogSource, locale);
  return (
    <CatalogMessage
      locale={catalog.locale}
      messages={catalog.messages}
      message={message}
    />
  );
}

function CatalogMessage({
  locale,
  messages,
  message,
}: {
  locale: string;
  messages: CatalogMessages;
  message: MessageDescriptor;
}) {
  const intl = useMemo(
    () => createAppIntl({ locale, messages }),
    [locale, messages],
  );
  return intl.formatMessage(message);
}
