import './analytics';
import { Toast } from '@base-ui/react/toast';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import { Toaster } from '@codaco/fresco-ui/Toast';

import { AppErrorBoundary } from './components/Errors';
import AppView from './components/ViewManager/views/App';
import { store } from './ducks/store';

const root = document.getElementById('root') as Element;

createRoot(root).render(
  <AppErrorBoundary>
    <Provider store={store}>
      <Toast.Provider limit={7}>
        <AppView />
        <Toaster />
      </Toast.Provider>
    </Provider>
  </AppErrorBoundary>,
);
