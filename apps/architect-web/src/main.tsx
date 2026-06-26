import './analytics';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import { AppErrorBoundary } from './components/Errors';
import AppView from './components/ViewManager/views/App';
import { store } from './ducks/store';
import { preloadTimelineImages } from './images/timeline';
import { warmBundledTemplateAssets } from './templates/warmBundledAssets';

const root = document.getElementById('root') as Element;

createRoot(root).render(
  <AppErrorBoundary>
    <Provider store={store}>
      <AppView />
    </Provider>
  </AppErrorBoundary>,
);

// During idle time, fetch stage thumbnails so they are already cached when the
// timeline or stage editor first renders, and warm the service-worker cache with
// the bundled template/Sample assets so those protocols can be installed offline.
const warmCaches = () => {
  preloadTimelineImages();
  void warmBundledTemplateAssets();
};

if ('requestIdleCallback' in window) {
  window.requestIdleCallback(warmCaches);
} else {
  setTimeout(warmCaches, 1000);
}
