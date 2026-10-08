import { Route, Switch } from 'wouter';

import Home from '~/components/Home/Home';
import {
  AssetsPage,
  CodebookPage,
  StageEditorPage,
  SummaryPage,
} from '~/components/pages';
import LocalizationPage from '~/components/pages/LocalizationPage';
import { ActionToolbarProvider } from '~/components/ProjectNav/ActionToolbar';
import ProjectLayout from '~/components/ProjectNav/ProjectLayout';
import Protocol from '~/components/Protocol';
import ProtocolRouteGuard from '~/components/ProtocolRouteGuard';
import RouteFocus from '~/components/RouteFocus';

// Every `/protocol` route is wrapped by ProtocolRouteGuard, which sends a tab
// with no protocol home and tells every page whether this tab may edit the
// protocol. It wraps the whole Switch rather than each route so a route added
// below is covered without having to remember to opt in.
//
// Every route below owns a `data-route-focus-target` heading for RouteFocus to
// land on.
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
          <Route path="/protocol/localization">
            <ProjectLayout>
              <LocalizationPage />
            </ProjectLayout>
          </Route>
          <Route path="/protocol/summary">
            <ProjectLayout>
              <SummaryPage />
            </ProjectLayout>
          </Route>
          <Route path="/protocol/stage/:stageId" component={StageEditorPage} />

          <Route path="/" component={Home} />
        </Switch>
      </ProtocolRouteGuard>
    </ActionToolbarProvider>
  );
};

export default Routes;
