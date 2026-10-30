import { Redirect, Route, Switch } from 'wouter';

import AssetsPage from '~/components/pages/AssetsPage';
import CodebookPage from '~/components/pages/CodebookPage';
import LocalizationPage from '~/components/pages/LocalizationPage';
import StageEditorPage from '~/components/pages/StageEditorPage';
import SummaryPage from '~/components/pages/SummaryPage';
import ProjectLayout from '~/components/ProjectNav/ProjectLayout';
import Protocol from '~/components/Protocol';

// The protocol editor: every `/protocol` page. Routes loads this module lazily
// (see protocolRoutesLoader), so none of the editor is in the code the start
// screen waits for.
const ProtocolRoutes = () => (
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
    {/* An editor address with no page here (a removed page such as
        /protocol/experiments, or an old bookmark) would leave the editor
        blank, so open the protocol's main page instead. */}
    <Redirect to="/protocol" replace />
  </Switch>
);

export default ProtocolRoutes;
