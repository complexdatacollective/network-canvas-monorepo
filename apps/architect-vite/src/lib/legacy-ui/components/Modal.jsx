import { AnimatePresence, motion } from "motion/react";
import PropTypes from "prop-types";
import { Component } from "react";
import { getCSSVariableAsNumber } from "../utils/CSSVariables";
import Drop from "./Transitions/Drop";
import window from "./window";

class Modal extends Component {
	render() {
		const { children, show, zIndex, onBlur } = this.props;

		const style = zIndex ? { zIndex } : null;

		const handleBlur = (event) => {
			if (event.target !== event.currentTarget) {
				return;
			}
			onBlur(event);
		};

		const variants = {
			visible: {
				opacity: 1,
				transition: {
					duration: getCSSVariableAsNumber("--animation-duration-fast"),
				},
			},
			hidden: {
				opacity: 0,
			},
		};

		return (
			<AnimatePresence>
				{show && (
					<motion.div
						className="modal"
						style={style}
						variants={variants}
						initial="hidden"
						animate="visible"
						exit="hidden"
					>
						<div className="modal__background" />
						<div className="modal__content" onClick={handleBlur}>
							<Drop>{children}</Drop>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		);
	}
}

Modal.propTypes = {
	show: PropTypes.bool,
	children: PropTypes.element,
	zIndex: PropTypes.number,
	onBlur: PropTypes.func,
};

Modal.defaultProps = {
	show: false,
	zIndex: null,
	children: null,
	onBlur: () => {},
};

export { Modal };

export default window(Modal);
