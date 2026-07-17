import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import { createRoot } from 'react-dom/client';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { PortalContainerProvider } from '@codaco/fresco-ui/PortalContainer';

import App from './App';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root container #root not found');
}

createRoot(root).render(
  // PortalContainerProvider outermost so fresco-ui overlays portal into its
  // viewport layer; the `root` (isolation: isolate) wrapper keeps the app's
  // own stacking contexts from competing with that layer.
  <PortalContainerProvider>
    <DialogProvider>
      <div className="root h-full">
        <App />
      </div>
    </DialogProvider>
  </PortalContainerProvider>,
);
