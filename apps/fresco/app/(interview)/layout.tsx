import { type Metadata } from 'next';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';
import EndSessionRecording from '~/app/(interview)/_components/EndSessionRecording';

export const metadata: Metadata = {
  title: 'Network Canvas Fresco - Interview',
  description: 'Interview',
};

function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppI18nProvider
      locale="en"
      locales={[{ locale: 'en', label: 'English', direction: 'ltr' }]}
      manageDocument={false}
    >
      <ThemedRegion
        lang="en"
        dir="ltr"
        theme="interview"
        className="flex h-screen max-h-screen flex-col"
      >
        <EndSessionRecording />
        {children}
      </ThemedRegion>
    </AppI18nProvider>
  );
}

export default RootLayout;
