import './analytics';
import { Toast } from '@base-ui/react/toast';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import { AppErrorBoundary } from './components/Errors';
import { WelcomeToaster } from './components/Home/WelcomeToaster';
import AppView from './components/ViewManager/views/App';
import { store } from './ducks/store';

const root = document.getElementById('root') as Element;

createRoot(root).render(
  <AppErrorBoundary>
    <Provider store={store}>
      <Toast.Provider>
        <AppView />
        <WelcomeToaster />
      </Toast.Provider>
    </Provider>
  </AppErrorBoundary>,
);
