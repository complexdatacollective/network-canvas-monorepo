import { Route, Switch } from "wouter";
import Home from "~/components/Home/Home";
import ProjectLayout from "~/components/ProjectNav/ProjectLayout";
import Protocol from "~/components/Protocol";
import { AssetsPage, CodebookPage, ExperimentsPage, StageEditorPage, SummaryPage } from "~/components/pages";

const Routes = () => {
	return (
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
				<SummaryPage />
			</Route>
			<Route path="/protocol/stage/:stageId" component={StageEditorPage} />
			<Route path="/protocol/experiments" component={ExperimentsPage} />

			<Route path="/" component={Home} />
		</Switch>
	);
};

export default Routes;
