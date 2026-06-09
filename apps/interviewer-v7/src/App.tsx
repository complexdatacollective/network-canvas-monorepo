import { AnimatePresence, motion } from 'motion/react';
import { Route, Switch, useLocation } from 'wouter';

import { BackgroundBlobs } from '@codaco/art';
import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';

import { AppErrorBoundary } from './components/AppErrorBoundary';
import { AuthGate } from './components/AuthGate';
import { isElectron } from './lib/platform/platform';
import { AppProviders } from './providers/AppProviders';
import { HomeRoute } from './routes/Home';
import { InterviewRoute } from './routes/Interview';
import { NotFoundRoute } from './routes/NotFound';
import { WelcomeRoute } from './routes/Welcome';

const pageWrapperVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { when: 'beforeChildren', duration: 0.4 },
  },
  exit: { opacity: 0, transition: { duration: 0.4, when: 'afterChildren' } },
} as const;

// The Home route serves both Protocols (/) and Data (/data) as in-page views.
// Grouping them under a single page-level key keeps HomeRoute mounted across
// view switches so the within-Home AnimatePresence owns the transition.
function pageKeyFor(location: string): string {
  return location === '/' || location === '/data' ? 'home' : location;
}

export default function App() {
  const [location] = useLocation();

  return (
    <AppProviders>
      <AppErrorBoundary>
        <ThemedRegion theme="interview" className="isolate">
          {isElectron && (
            <div
              aria-hidden
              className="app-drag fixed inset-x-0 top-0 z-50 h-8"
            />
          )}
          <motion.div
            className="fixed inset-0 -z-10 blur-[10rem]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.8 }}
            transition={{ duration: 2 }}
          >
            <BackgroundBlobs
              large={0}
              medium={4}
              small={0}
              compositeOperation="color-dodge"
            />
          </motion.div>
          <AuthGate>
            <AnimatePresence mode="wait">
              <motion.div
                key={pageKeyFor(location)}
                variants={pageWrapperVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <Switch location={location}>
                  <Route path="/welcome" component={WelcomeRoute} />
                  <Route path="/interview/:sessionId">
                    {({ sessionId }) => (
                      <InterviewRoute sessionId={sessionId} />
                    )}
                  </Route>
                  <Route path="/:view?">
                    {(params) => {
                      if (params.view !== undefined && params.view !== 'data') {
                        return <NotFoundRoute />;
                      }
                      return <HomeRoute />;
                    }}
                  </Route>
                  <Route component={NotFoundRoute} />
                </Switch>
              </motion.div>
            </AnimatePresence>
          </AuthGate>
        </ThemedRegion>
      </AppErrorBoundary>
    </AppProviders>
  );
}
