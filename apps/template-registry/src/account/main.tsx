import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

import { AccountApp } from './AccountApp.tsx';

const element = document.getElementById('root');
if (!element) throw new Error('REGISTRY_ACCOUNT_ROOT_MISSING');
createRoot(element).render(
  <StrictMode>
    <AppI18nProvider
      locale="en"
      locales={[{ locale: 'en', label: 'English', direction: 'ltr' }]}
    >
      <DialogProvider>
        <AccountApp />
      </DialogProvider>
    </AppI18nProvider>
  </StrictMode>,
);
