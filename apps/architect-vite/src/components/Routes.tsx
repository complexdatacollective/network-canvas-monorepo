import { motion } from "motion/react";
import { Route, Switch } from "wouter";
import Home from "~/components/Home/Home";
import Loading from "~/components/Loading";
import { AssetsPage, CodebookPage, StageEditorPage, SummaryPage } from "~/components/pages";
import Protocol from "~/components/Protocol";
import Screens from "./Screens";

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
			<Loading />
			<Switch>
				{/* Protocol sub-routes */}
				<Route path="/protocol/:protocolId/assets" component={AssetsPage} />
				<Route path="/protocol/:protocolId/codebook" component={CodebookPage} />
				<Route path="/protocol/:protocolId/summary" component={SummaryPage} />
				<Route path="/protocol/:protocolId/stages/:stageId" component={StageEditorPage} />
				
				{/* Protocol overview routes */}
				<Route path="/protocol/:protocolId" component={Protocol} />
				
				{/* Keep legacy route during transition */}
				<Route path="/protocol" component={Protocol} />
				
				{/* Home route */}
				<Route path="/" component={Home} />
			</Switch>
			<Screens />
		</motion.div>
	);
};

export default Routes;
