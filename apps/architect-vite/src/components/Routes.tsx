import { Route, Switch } from "wouter";
import Home from "~/components/Home/Home";
import { AssetsPage, CodebookPage, StageEditorPage, SummaryPage, TypeEditorPage } from "~/components/pages";
import Protocol from "~/components/Protocol";

const _appVariants = {
	show: {
		opacity: 1,
		transition: {
			when: "beforeChildren",
		},
	},
	hide: {
		opacity: 0,
	},
};

const Routes = () => {
	return (
		<Switch>
			<Route path="/protocol" component={Protocol} />
			<Route path="/protocol/assets" component={AssetsPage} />
			<Route path="/protocol/codebook" component={CodebookPage} />
			<Route path="/protocol/codebook/:entity/:type" component={TypeEditorPage} />
			<Route path="/protocol/summary" component={SummaryPage} />
			<Route path="/protocol/stage/:stageId" component={StageEditorPage} />

			<Route path="/" component={Home} />
		</Switch>
	);
};

export default Routes;
