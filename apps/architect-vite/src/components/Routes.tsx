import { motion } from "motion/react";
import { Route, Switch } from "wouter";
import Home from "~/components/Home/Home";
import Loading from "~/components/Loading";
import Protocol from "~/components/Protocol";
import ProtocolSummary from "~/lib/ProtocolSummary/ProtocolSummary";
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
				{/* New route with protocol ID parameter */}
				<Route path="/protocol/:protocolId" component={Protocol}>
					<Route path="/summary" component={ProtocolSummary} />
				</Route>
				{/* Keep legacy route during transition */}
				<Route path="/protocol" component={Protocol}>
					<Route path="/summary" component={ProtocolSummary} />
				</Route>
				<Route path="/" component={Home} />
			</Switch>
			<Screens />
		</motion.div>
	);
};

export default Routes;
