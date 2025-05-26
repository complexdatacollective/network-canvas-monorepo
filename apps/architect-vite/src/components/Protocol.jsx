import cx from "classnames";
import { motion, useElementScroll } from "framer-motion";
import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { connect } from "react-redux";
import Overview from "~/src/components/Overview";
import ProtocolControlBar from "~/src/components/ProtocolControlBar";
import Timeline from "~/src/components/Timeline";
import { actionCreators as dialogActions } from "~/src/ducks/modules/dialogs";
import { selectors as statusSelectors } from "~/src/ducks/modules/ui/status";
import { actionLocks as protocolsLocks } from "~/src/ducks/modules/userActions";
import { getHasUnsavedChanges } from "~/src/selectors/session";

const Protocol = ({ isLoading, hasProtocol }) => {
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

Protocol.propTypes = {
	isLoading: PropTypes.bool,
	hasProtocol: PropTypes.bool,
};

Protocol.defaultProps = {
	isLoading: false,
	hasProtocol: false,
};

const mapStateToProps = (state) => {
	const activeProtocol = state.session.filePath;

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
