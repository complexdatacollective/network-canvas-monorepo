import type { ReactNode } from 'react';

import { LanguageNamingProvider } from '@codaco/protocol-builder/localization/LanguageNaming';

import { useLanguageName } from './useLanguageName';

/**
 * Has every builder field Architect mounts name the protocol's languages in
 * Architect's own language, as the rest of Architect does.
 */
export function ArchitectLanguageNaming({ children }: { children: ReactNode }) {
  const languageName = useLanguageName();
  return (
    <LanguageNamingProvider name={languageName}>
      {children}
    </LanguageNamingProvider>
  );
}
