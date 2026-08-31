import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import { createRoot } from 'react-dom/client';

import { registerPwaBuildLease } from '@codaco/fresco-ui/appUpdate/applyFreshLoadServiceWorkerUpdate';

import { AppErrorBoundary } from './components/Errors';
import { PreviewHost } from './components/PreviewHost/PreviewHost';

registerPwaBuildLease(__PWA_BUILD_ID__);

const root = document.getElementById('root') as Element;

createRoot(root).render(
  <AppErrorBoundary>
    <PreviewHost />
  </AppErrorBoundary>,
);
