'use client';

import { Languages } from 'lucide-react';
import { useEffect, useEffectEvent } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useLocaleLoadFailure } from '@codaco/app-i18n/react';

import { useToast } from './Toast';

const messages = defineMessages({
  title: {
    id: 'frescoUi.localeLoadFailure.title',
    defaultMessage: 'Couldn’t load {language}',
    description:
      'Title of a notice shown when the interface language the user chose could not be downloaded. {language} is the name of that language, written in that language (for example "Español").',
  },
  reloadDescription: {
    id: 'frescoUi.localeLoadFailure.reloadDescription',
    defaultMessage:
      'Showing {current} instead. Check your connection, then reload to try again.',
    description:
      'Body of the notice that the chosen interface language could not be downloaded, shown with a Reload button. {current} is the name of the language on screen instead, written in that language.',
  },
  description: {
    id: 'frescoUi.localeLoadFailure.description',
    defaultMessage: 'Showing {current} instead.',
    description:
      'Body of the notice that the chosen interface language could not be downloaded, where reloading is not offered, such as during an interview. {current} is the name of the language on screen instead, written in that language.',
  },
  reload: {
    id: 'frescoUi.localeLoadFailure.reload',
    defaultMessage: 'Reload',
    description:
      'Button on the notice that the chosen interface language could not be downloaded. Reloads the page, which tries the download again.',
  },
});

type LocaleLoadFailureToastProps = {
  /**
   * Offers a Reload button that calls this. Omit it where a reload would cost
   * more than the language, such as during an interview.
   */
  onReload?: () => void;
  /** Called once for each failure shown, for error reporting. */
  onFailure?: (error: unknown, locale: string) => void;
};

/**
 * Tells the user that the language they chose could not be downloaded and
 * which language is on screen instead, for as long as that lasts. It renders
 * nothing itself: it shows a toast that stays until it is dismissed or the
 * language arrives, so it needs a `Toast.Provider` and `Toaster` above it, and
 * an `AppI18nProvider` whose host passes `useLocaleCatalog`'s `failure` as
 * `loadFailure`.
 */
export default function LocaleLoadFailureToast({
  onReload,
  onFailure,
}: LocaleLoadFailureToastProps) {
  const failure = useLocaleLoadFailure();
  const { add, close } = useToast();

  const show = useEffectEvent((shown: NonNullable<typeof failure>) => {
    onFailure?.(shown.error, shown.locale.locale);
    return add({
      title: (
        <AppMessage
          message={messages.title}
          values={{ language: shown.locale.label }}
        />
      ),
      description: (
        <AppMessage
          message={
            onReload === undefined
              ? messages.description
              : messages.reloadDescription
          }
          values={{ current: shown.shown.label }}
        />
      ),
      icon: <Languages className="size-5" aria-hidden />,
      timeout: 0,
      onCancel: onReload,
      cancelLabel: <AppMessage message={messages.reload} />,
    });
  });
  const dismiss = useEffectEvent((id: string) => close(id));

  useEffect(() => {
    if (failure === undefined) return;
    const id = show(failure);
    return () => dismiss(id);
  }, [failure]);

  return null;
}
