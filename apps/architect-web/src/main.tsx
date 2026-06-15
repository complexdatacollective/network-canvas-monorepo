import './analytics';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import { AppErrorBoundary } from './components/Errors';
import AppView from './components/ViewManager/views/App';
import { store } from './ducks/store';
import { preloadTimelineImages } from './images/timeline';

const root = document.getElementById('root') as Element;

createRoot(root).render(
  <AppErrorBoundary>
    <Provider store={store}>
      <AppView />
    </Provider>
  </AppErrorBoundary>,
);

// Fetch stage thumbnails during idle time so they are already cached when the
// timeline or stage editor first renders.
if ('requestIdleCallback' in window) {
  window.requestIdleCallback(preloadTimelineImages);
} else {
  setTimeout(preloadTimelineImages, 1000);
}
