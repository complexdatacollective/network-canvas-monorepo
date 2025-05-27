import { AnimatePresence, motion } from "motion/react";
import PropTypes from "prop-types";
import { Component } from "react";
import { createPortal } from "react-dom";

class SpotlightModal extends Component {
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
					duration: 0.1,
				},
			},
			hidden: {
				opacity: 0,
			},
		};

		return createPortal(
			<AnimatePresence>
				{show && (
					<motion.div
						className="spotlight-modal"
						style={style}
						variants={variants}
						initial="hidden"
						animate="visible"
						exit="hidden"
					>
						<div className="modal__background" onClick={handleBlur} />
						<div className="spotlight-modal__content">{children}</div>
					</motion.div>
				)}
			</AnimatePresence>,
			document.body,
		);
	}
}

SpotlightModal.propTypes = {
	show: PropTypes.bool,
	children: PropTypes.element,
	zIndex: PropTypes.number,
	onBlur: PropTypes.func,
};

SpotlightModal.defaultProps = {
	show: false,
	zIndex: null,
	children: null,
	onBlur: () => {},
};

export default SpotlightModal;
