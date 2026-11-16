import { type ReactNode, useLayoutEffect } from 'react';

import type { LocalizationDeclaration } from '@codaco/protocol-validation';

import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';

const PROTOCOL_LOCALES: LocalizationDeclaration = {
  defaultLocale: 'en',
  locales: ['en', 'hu', 'pt-BR', 'zh-Hans', 'sw'],
};

// The protocol language (the participant's stated preference) the wrapped
// hook runs in. Read at render, so a test changes it and re-renders.
const current = { protocol: 'en' };

export const setLanguages = (protocol: string) => {
  current.protocol = protocol;
};

/**
 * Called from a layout effect in the wrapper, a parent of the hook under test.
 * That runs after the hook's own layout effects and before any passive effect,
 * so it sees the state the commit leaves for the instant between them.
 */
export const afterHookLayoutEffects: { current: (() => void) | undefined } = {
  current: undefined,
};

export function Languages({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    afterHookLayoutEffects.current?.();
  });
  return (
    <InterviewI18nProvider>
      <TestProtocolLocalization
        localization={PROTOCOL_LOCALES}
        locale={current.protocol}
      >
        {children}
      </TestProtocolLocalization>
    </InterviewI18nProvider>
  );
}
