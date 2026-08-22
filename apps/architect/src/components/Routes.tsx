import { Route, Switch } from 'wouter';

import Home from '~/components/Home/Home';
import {
  AssetsPage,
  CodebookPage,
  ExperimentsPage,
  StageEditorPage,
  SummaryPage,
} from '~/components/pages';
import { ActionToolbarProvider } from '~/components/ProjectNav/ActionToolbar';
import ProjectLayout from '~/components/ProjectNav/ProjectLayout';
import Protocol from '~/components/Protocol';
import ProtocolRouteGuard from '~/components/ProtocolRouteGuard';
import RouteFocus from '~/components/RouteFocus';

// Every `/protocol` route is wrapped by ProtocolRouteGuard, which decides
// whether this tab may edit the protocol at all before any editor mounts. It
// wraps the whole Switch rather than each route so a route added below is
// covered without having to remember to opt in.
//
// RouteFocus sits OUTSIDE the guard so it covers the read-only view the guard
// substitutes for the editor as well — that substitution is a destination too.
// Every route below owns a `data-route-focus-target` heading for it to land on.
const Routes = () => {
  return (
    <ActionToolbarProvider>
      <RouteFocus />
      <ProtocolRouteGuard>
        <Switch>
          <Route path="/protocol">
            <ProjectLayout>
              <Protocol />
            </ProjectLayout>
          </Route>
          <Route path="/protocol/assets">
            <ProjectLayout>
              <AssetsPage />
            </ProjectLayout>
          </Route>
          <Route path="/protocol/codebook">
            <ProjectLayout>
              <CodebookPage />
            </ProjectLayout>
          </Route>
          <Route path="/protocol/summary">
            <ProjectLayout>
              <SummaryPage />
            </ProjectLayout>
          </Route>
          <Route path="/protocol/stage/:stageId" component={StageEditorPage} />
          <Route path="/protocol/experiments" component={ExperimentsPage} />

          <Route path="/" component={Home} />
        </Switch>
      </ProtocolRouteGuard>
    </ActionToolbarProvider>
  );
};

export default Routes;
