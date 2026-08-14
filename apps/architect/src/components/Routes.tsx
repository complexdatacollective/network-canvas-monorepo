import { Route, Switch } from 'wouter';

import Home from '~/components/Home/Home';
import {
  AssetsPage,
  CodebookPage,
  ExperimentsPage,
  StageEditorPage,
  SummaryPage,
} from '~/components/pages';
import ProjectLayout from '~/components/ProjectNav/ProjectLayout';
import Protocol from '~/components/Protocol';
import ProtocolRouteGuard from '~/components/ProtocolRouteGuard';

// Every `/protocol` route is wrapped by ProtocolRouteGuard, which decides
// whether this tab may edit the protocol at all before any editor mounts. It
// wraps the whole Switch rather than each route so a route added below is
// covered without having to remember to opt in.
const Routes = () => {
  return (
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
  );
};

export default Routes;
