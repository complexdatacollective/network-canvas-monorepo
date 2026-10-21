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
import ReturnToArchitect9 from '~/components/ReturnToArchitect9';
import RouteFocus from '~/components/RouteFocus';
import SketchImport from '~/components/SketchImport/SketchImport';
import { IS_SUBPATH_BUILD } from '~/utils/appBase';

// Every `/protocol` route is wrapped by ProtocolRouteGuard, which sends a tab
// with no protocol home and tells every page whether this tab may edit the
// protocol. It wraps the whole Switch rather than each route so a route added
// below is covered without having to remember to opt in.
//
// Every route below owns a `data-route-focus-target` heading for RouteFocus to
// land on, except a sub-path build's start screen, which only ever leaves.
//
// Architect 8 served inside Architect 9 is the protocol editor alone, so its
// start screen returns to Architect 9's, and none of Home (the library,
// templates, Open file) is in that build: vite.config.ts leaves it out.
const StartScreen = IS_SUBPATH_BUILD ? ReturnToArchitect9 : Home;

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

          <Route path="/import-from-sketch" component={SketchImport} />

          <Route path="/" component={StartScreen} />
        </Switch>
      </ProtocolRouteGuard>
    </ActionToolbarProvider>
  );
};

export default Routes;
