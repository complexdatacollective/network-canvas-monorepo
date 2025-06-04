import { Spinner } from "@codaco/legacy-ui/components";
import { AnimatePresence, motion } from "motion/react";
import { connect } from "react-redux";
import { selectors as statusSelectors } from "~/ducks/modules/ui/status";
import { actionLocks as protocolsLocks } from "~/ducks/modules/userActions";

const variants = {
	hidden: { opacity: 0, transition: { delay: 0.5, duration: 0.5 } },
	visible: { opacity: 1, transition: { delay: 0.5 } },
};

type LoadingProps = {
	isLoading: boolean;
};

const Loading = ({ isLoading }: LoadingProps) => (
	<AnimatePresence>
		{isLoading && (
			<motion.div
				className="scene__loading"
				style={{
					width: "100%",
					height: "100%",
					position: "absolute",
					top: 0,
					left: 0,
					zIndex: "var(--z-dialog)",
					display: "flex",
					justifyContent: "center",
					alignItems: "center",
					backgroundColor: "rgba(255, 255, 255, 1)",
				}}
				initial="hidden"
				animate="visible"
				exit="hidden"
				variants={variants}
			>
				<Spinner />
			</motion.div>
		)}
	</AnimatePresence>
);

type RootState = {
	[key: string]: any;
};

const mapStateToProps = (state: RootState) => ({
	isLoading: statusSelectors.getIsBusy(state, protocolsLocks.loading),
});

const withState = connect(mapStateToProps);

export default withState(Loading);
