import { motion } from "motion/react";
import LaunchPad from "./LaunchPad";
import WelcomeHeader from "./WelcomeHeader";

const variants = {
	show: {
		opacity: 1,
		transition: {
			duration: 0.5,
			when: "beforeChildren",
			staggerChildren: 0.2,
		},
	},
	hide: {
		opacity: 0,
	},
};

const Home = () => {
	// useProtocolLoader();
	return (
		<div className="home scrollable">
			<motion.div className="home__container" variants={variants} key="start-screen">
				<WelcomeHeader />
				<LaunchPad />
			</motion.div>
		</div>
	);
};

export default Home;
