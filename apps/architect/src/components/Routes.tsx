import { lazy, Suspense, useState } from 'react';
import { Route, Switch } from 'wouter';

import Home from '~/components/Home/Home';
import ProtocolLoadingOverlay from '~/components/Home/ProtocolLoadingOverlay';
import { ActionToolbarProvider } from '~/components/ProjectNav/ActionToolbar';
import ProtocolRouteGuard from '~/components/ProtocolRouteGuard';
import {
  getLoadedProtocolRoutes,
  loadProtocolRoutes,
} from '~/components/protocolRoutesLoader';
import RouteFocus from '~/components/RouteFocus';

// The start screen is all a first visit needs, so the protocol editor loads on
// demand. main.tsx preloads it once the start screen is up, so by the time a
// protocol is opened it is normally already here; until it is, the protocol
// loading overlay the start screen shows while opening one stays up.
const LazyProtocolRoutes = lazy(loadProtocolRoutes);

const ProtocolRoutes = () => {
  // Decided once per mount, so a re-render never swaps the component type and
  // remounts the editor. When the editor is already here — the start-up wait
  // or the background preload fetched it — render it directly: even an
  // already-settled lazy component suspends on its first render, which would
  // flash the loading overlay (and, at start-up, dismiss the boot screen over
  // it instead of over the editor).
  const [LoadedProtocolRoutes] = useState(getLoadedProtocolRoutes);
  if (LoadedProtocolRoutes) return <LoadedProtocolRoutes />;
  return (
    <Suspense fallback={<ProtocolLoadingOverlay open />}>
      <LazyProtocolRoutes />
    </Suspense>
  );
};

// Every `/protocol` route is wrapped by ProtocolRouteGuard, which sends a tab
// with no protocol home and tells every page whether this tab may edit the
// protocol. It wraps the whole Switch rather than each route so a route added
// below (or in ProtocolRoutes) is covered without having to remember to opt in.
//
// Every route below owns a `data-route-focus-target` heading for RouteFocus to
// land on.
const Routes = () => {
  return (
    <ActionToolbarProvider>
      <RouteFocus />
      <ProtocolRouteGuard>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/protocol/*?">
            <ProtocolRoutes />
          </Route>
        </Switch>
      </ProtocolRouteGuard>
    </ActionToolbarProvider>
  );
};

export default Routes;
