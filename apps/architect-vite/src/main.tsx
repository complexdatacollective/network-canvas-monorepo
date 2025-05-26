import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import ViewManager from './components/ViewManager/ViewManager'
import { store } from './ducks/store'
import './styles/main.scss'

createRoot(document.getElementById('root') as Element).render(
  <StrictMode>
          <Provider store={store}>
            {/* <PersistGate loading={null} persistor={persistor}> */}
              <ViewManager />
            {/* </PersistGate> */}
          </Provider>
  </StrictMode>,
)
