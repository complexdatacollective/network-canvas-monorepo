import { DirectionProvider } from '@base-ui/react/direction-provider';
import type { ReactNode } from 'react';

import { AppI18nProvider } from '@codaco/app-i18n/react';

const participantLocales = [
  { locale: 'en', label: 'English', direction: 'ltr' },
] as const;

// Schema 8 has no protocol locale and the runtime's system copy is English.
// #1313 owns its localized system catalogs; schema-9 delivery owns the protocol
// locale and per-string lang/dir. Keep both independent of the host preference.
export function ParticipantLanguageBoundary({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AppI18nProvider
      locale="en"
      locales={participantLocales}
      manageDocument={false}
    >
      <DirectionProvider direction="ltr">
        <div
          lang="en"
          dir="ltr"
          data-testid="participant-language-boundary"
          className="flex size-full min-h-0 min-w-0 flex-1"
        >
          {children}
        </div>
      </DirectionProvider>
    </AppI18nProvider>
  );
}
