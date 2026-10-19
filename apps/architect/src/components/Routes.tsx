import { lazy, Suspense } from 'react';
import { Route, Switch } from 'wouter';

import Home from '~/components/Home/Home';
import ProtocolLoadingOverlay from '~/components/Home/ProtocolLoadingOverlay';
import { ActionToolbarProvider } from '~/components/ProjectNav/ActionToolbar';
import ProtocolRouteGuard from '~/components/ProtocolRouteGuard';
import { loadProtocolRoutes } from '~/components/protocolRoutesLoader';
import RouteFocus from '~/components/RouteFocus';

// The start screen is all a first visit needs, so the protocol editor loads on
// demand. main.tsx preloads it once the start screen is up, so by the time a
// protocol is opened it is normally already here; until it is, the protocol
// loading overlay the start screen shows while opening one stays up.
const ProtocolRoutes = lazy(loadProtocolRoutes);

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
            <Suspense fallback={<ProtocolLoadingOverlay open />}>
              <ProtocolRoutes />
            </Suspense>
          </Route>
        </Switch>
      </ProtocolRouteGuard>
    </ActionToolbarProvider>
  );
};

export default Routes;
