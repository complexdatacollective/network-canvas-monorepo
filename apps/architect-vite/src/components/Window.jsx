import cx from "classnames";
import PropTypes from "prop-types";
import Stackable from "~/components/Stackable";
import { getCSSVariableAsNumber } from "~/lib/legacy-ui/utils/CSSVariables";

// TODO: This is so confusingly named. Was 'Window', but we also had `window` and there were collisions with vite globals.
const WindowFrame = ({ show, title, children, leftControls, rightControls, className }) => {
	if (!show) {
		return null;
	}

	const dialogZIndex = getCSSVariableAsNumber("--z-dialog");

	return createPortal(
		<Stackable stackKey>
			{({ stackIndex }) => (
				<div
					className={cx("window", className)}
					style={{
						zIndex: dialogZIndex + stackIndex,
					}}
					onClick={(e) => e.stopPropagation()}
				>
					<div className="window__container">
						{title && (
							<div className="window__heading stage-heading stage-heading--inline stage-heading--collapsed">
								<div className="stage-editor">
									<h2>{title}</h2>
								</div>
							</div>
						)}
						<div className="window__main">
							<div className="window__content">{children}</div>
						</div>
						<div className="window__controls">
							{leftControls && <div className="window__controls-left">{leftControls}</div>}
							{rightControls && <div className="window__controls-right">{rightControls}</div>}
						</div>
					</div>
				</div>
			)}
		</Stackable>,
		document.body,
	);
};

WindowFrame.propTypes = {
	children: PropTypes.node,
	className: PropTypes.string,
	leftControls: PropTypes.arrayOf(PropTypes.node),
	rightControls: PropTypes.arrayOf(PropTypes.node),
	show: PropTypes.bool,
	title: PropTypes.string,
};

WindowFrame.defaultProps = {
	children: null,
	className: null,
	leftControls: [],
	rightControls: [],
	show: true,
	title: null,
};

export default WindowFrame;
