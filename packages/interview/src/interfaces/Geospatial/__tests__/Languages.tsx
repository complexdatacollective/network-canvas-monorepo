import type { ReactNode } from 'react';

import type { LocalizationDeclaration } from '@codaco/protocol-validation';

import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';

const PROTOCOL_LOCALES: LocalizationDeclaration = {
  defaultLocale: 'en',
  locales: ['en', 'hu', 'pt-BR', 'zh-Hans', 'sw'],
};

// The protocol language (the participant's stated preference) and interface
// language (the Shell's) the wrapped hook runs in. Read at render, so a test
// changes them and re-renders.
const current = { protocol: 'en', interface: 'en' };

export const setLanguages = (protocol: string, interfaceLocale = 'en') => {
  current.protocol = protocol;
  current.interface = interfaceLocale;
};

export function Languages({ children }: { children: ReactNode }) {
  return (
    <InterviewI18nProvider requestedLocale={current.interface}>
      <TestProtocolLocalization
        localization={PROTOCOL_LOCALES}
        locale={current.protocol}
      >
        {children}
      </TestProtocolLocalization>
    </InterviewI18nProvider>
  );
}
