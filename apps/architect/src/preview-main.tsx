import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import { createRoot } from 'react-dom/client';

import { applyFreshLoadServiceWorkerUpdate } from '@codaco/fresco-ui/appUpdate/applyFreshLoadServiceWorkerUpdate';
import { registerPwaBuildLease } from '@codaco/fresco-ui/appUpdate/registerPwaBuildLease';

import { AppErrorBoundary } from './components/Errors';
import { PreviewHost } from './components/PreviewHost/PreviewHost';

registerPwaBuildLease(__PWA_BUILD_ID__);

async function startPreview(): Promise<void> {
  // A preview navigation can receive the newest NetworkOnly HTML from an older
  // controlling worker. Complete the same pre-render handoff as the main app so
  // deferred preview chunks and offline fallbacks belong to that new shell.
  // Explicit no-reload mode keeps the popup on its original navigation.
  await applyFreshLoadServiceWorkerUpdate({ reload: false });

  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Root container #root not found');
  }

  createRoot(root).render(
    <AppErrorBoundary>
      <PreviewHost />
    </AppErrorBoundary>,
  );
}

void startPreview();
