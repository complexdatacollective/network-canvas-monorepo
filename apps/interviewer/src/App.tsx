import { AnimatePresence, motion } from 'motion/react';
import { Route, Switch, useLocation } from 'wouter';

import { BackgroundLights } from '@codaco/art';
import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';

import { ErrorBoundary } from './components/AppErrorBoundary';
import { AppUpdateProvider } from './components/AppUpdate/AppUpdateProvider';
import { AuthGate } from './components/AuthGate';
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

  // The interview route paints its own opaque background across the viewport
  // (see Interview.tsx), so the animated backdrop is never visible during a
  // session. Unmount it there to stop its requestAnimationFrame loop — an
  // interview can run uninterrupted for a long time, and animating a backdrop
  // nobody can see is pure battery drain.
  const showBackgroundLights = !location.startsWith('/interview/');

  return (
    <ThemedRegion theme="interview" className="isolate h-full">
      {/* Bare, dependency-free outer boundary: catches crashes in AppProviders
          construction itself (before AnalyticsProvider exists) and always shows
          the fallback. The analytics-reporting boundary lives inside
          AppProviders, within AnalyticsProvider, so it can actually report. */}
      <ErrorBoundary>
        <AppProviders>
          <AppUpdateProvider>
            <AnimatePresence>
              {showBackgroundLights && (
                <motion.div
                  key="background-lights"
                  className="fixed inset-0 -z-10"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.8 }}
                  exit={{ opacity: 0, transition: { duration: 0.5 } }}
                  transition={{ duration: 2 }}
                >
                  <BackgroundLights
                    large={0}
                    medium={4}
                    small={0}
                    blendMode="color-dodge"
                    speedFactor={30}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <AuthGate>
              <AnimatePresence mode="wait">
                <motion.div
                  key={pageKeyFor(location)}
                  variants={pageWrapperVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  // Fill the inset #root so the route's full-screen surfaces can
                  // size to the available space with `h-full` rather than the raw
                  // viewport (`h-dvh`). The body is padded by the top safe-area
                  // inset; a viewport-tall child would overflow that inset and
                  // make the whole page scroll (the iPad-portrait overflow bug).
                  className="h-full"
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
                        if (
                          params.view !== undefined &&
                          params.view !== 'data'
                        ) {
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
          </AppUpdateProvider>
        </AppProviders>
      </ErrorBoundary>
    </ThemedRegion>
  );
}
