import { motion } from "motion/react";
import { Route, Switch } from "wouter";
import Home from "~/components/Home/Home";
import { AssetsPage, CodebookPage, StageEditorPage, SummaryPage, TypeEditorPage } from "~/components/pages";
import Protocol from "~/components/Protocol";

const appVariants = {
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
		<motion.div className="app" variants={appVariants} initial="hide" animate="show">
			<Switch>
				{/* Protocol sub-routes */}
				<Route path="/protocol/assets" component={AssetsPage} />
				<Route path="/protocol/codebook" component={CodebookPage} />
				<Route path="/protocol/codebook/:entity/:type" component={TypeEditorPage} />
				<Route path="/protocol/summary" component={SummaryPage} />
				<Route path="/protocol/stage/:stageId" component={StageEditorPage} />

				{/* Protocol overview routes */}
				<Route path="/protocol" component={Protocol} />

				{/* Home route */}
				<Route path="/" component={Home} />
			</Switch>
		</motion.div>
	);
};

export default Routes;
