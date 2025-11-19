import { Route, Switch } from "wouter";
import Home from "~/components/Home/Home";
import Protocol from "~/components/Protocol";
import { AssetsPage, CodebookPage, StageEditorPage, SummaryPage } from "~/components/pages";

const Routes = () => {
	return (
		<Switch>
			<Route path="/protocol" component={Protocol} />
			<Route path="/protocol/assets" component={AssetsPage} />
			<Route path="/protocol/codebook" component={CodebookPage} />
			<Route path="/protocol/summary" component={SummaryPage} />
			<Route path="/protocol/stage/:stageId" component={StageEditorPage} />

			<Route path="/" component={Home} />
		</Switch>
	);
};

export default Routes;
