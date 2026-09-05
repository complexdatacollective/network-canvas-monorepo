import type { ReactNode } from 'react';

import { AppErrorBoundary } from '~/components/Errors';

import { ArchitectI18nProvider } from './ArchitectI18nProvider';

/** Recovery remains available even when the locale provider cannot initialize. */
export function ArchitectI18nRoot({ children }: { children: ReactNode }) {
  return (
    <AppErrorBoundary manageDocumentLocale>
      <ArchitectI18nProvider>
        <AppErrorBoundary>{children}</AppErrorBoundary>
      </ArchitectI18nProvider>
    </AppErrorBoundary>
  );
}
