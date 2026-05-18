import { motion } from 'motion/react';
import { Route, Switch } from 'wouter';

import { BackgroundBlobs } from '@codaco/art';
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
      <ThemedRegion theme="interview" className="isolate">
        <motion.div
          className="fixed inset-0 -z-10 blur-[10rem]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.8 }}
          transition={{
            duration: 2,
          }}
        >
          <BackgroundBlobs
            large={0}
            medium={4}
            small={0}
            // speedFactor={40}
            // filter="blur(10rem)"
            // compositeOperation="screen"
            compositeOperation="color-dodge"
          />
        </motion.div>
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
