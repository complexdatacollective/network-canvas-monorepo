import { Route, Switch } from 'wouter';

import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';

import { AppShell } from './components/AppShell';
import { AuthGate } from './components/AuthGate';
import { AppProviders } from './providers/AppProviders';
import { HomeRoute } from './routes/Home';
import { InterviewRoute } from './routes/Interview';
import { NotFoundRoute } from './routes/NotFound';
import { ProtocolsRoute } from './routes/Protocols';
import { SessionsRoute } from './routes/Sessions';
import { SettingsRoute } from './routes/Settings';

export default function App() {
  return (
    <AppProviders>
      <ThemedRegion theme="interview">
        <AuthGate>
          <Switch>
            <Route path="/interview/:sessionId">
              {({ sessionId }) => <InterviewRoute sessionId={sessionId} />}
            </Route>
            <Route path="/" component={HomeRoute} />
            <Route>
              <AppShell>
                <Switch>
                  <Route path="/protocols" component={ProtocolsRoute} />
                  <Route path="/sessions" component={SessionsRoute} />
                  <Route path="/settings" component={SettingsRoute} />
                  <Route component={NotFoundRoute} />
                </Switch>
              </AppShell>
            </Route>
          </Switch>
        </AuthGate>
      </ThemedRegion>
    </AppProviders>
  );
}
