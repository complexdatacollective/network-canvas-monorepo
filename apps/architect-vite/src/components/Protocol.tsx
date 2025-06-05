import cx from "classnames";
import { motion, useElementScroll } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { connect } from "react-redux";
import Overview from "~/components/Overview";
import ProtocolControlBar from "~/components/ProtocolControlBar";
import Timeline from "~/components/Timeline";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import { selectors as statusSelectors } from "~/ducks/modules/ui/status";
import { actionLocks as protocolsLocks } from "~/ducks/modules/userActions";
import { getHasUnsavedChanges, getProtocol } from "~/selectors/protocol";

type ProtocolProps = {
	isLoading?: boolean;
	hasProtocol?: boolean;
};

const Protocol = ({ isLoading = false, hasProtocol = false }: ProtocolProps) => {
	const sceneClasses = cx("scene", { "scene--protocol": hasProtocol }, { "scene--loading": isLoading });

	const variants = {
		show: {
			opacity: 1,
			transition: {
				duration: 0.5,
			},
		},
		hide: {
			opacity: 0,
		},
	};

	const ref = useRef(null);
	const { scrollY } = useElementScroll(ref);
	const [scrollOffset, setScrollOffset] = useState(0);

	useEffect(() => {
		scrollY.onChange((value) => setScrollOffset(value));
	}, [scrollY]);

	return (
		<motion.div className={sceneClasses} variants={variants}>
			<div className="scene__protocol" ref={ref}>
				<Overview scrollOffset={scrollOffset} />
				<Timeline show={hasProtocol} />
			</div>
			<ProtocolControlBar show={hasProtocol} />
		</motion.div>
	);
};


const mapStateToProps = (state) => {
	const activeProtocol = getProtocol(state);

	return {
		hasUnsavedChanges: getHasUnsavedChanges(state),
		protocolPath: activeProtocol,
		hasProtocol: !!activeProtocol,
		isLoading: statusSelectors.getIsBusy(state, protocolsLocks.loading),
	};
};

const mapDispatchToProps = {
	openDialog: dialogActions.openDialog,
};

const withStore = connect(mapStateToProps, mapDispatchToProps);

export default withStore(Protocol);
