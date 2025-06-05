import { AnimatePresence, motion } from "motion/react";
import type { ReactElement } from "react";
import { Component } from "react";
import { createPortal } from "react-dom";
import { getCSSVariableAsNumber } from "../utils/CSSVariables";
import Drop from "./Transitions/Drop";
// import window from "./window";

interface ModalProps {
	show?: boolean;
	children?: ReactElement | null;
	zIndex?: number | null;
	onBlur?: (event: React.MouseEvent<HTMLDivElement>) => void;
}

class Modal extends Component<ModalProps> {
	render() {
		const { children, show = false, zIndex = null, onBlur = () => {} } = this.props;

		const style = zIndex ? { zIndex } : null;

		const handleBlur = (event: React.MouseEvent<HTMLDivElement>) => {
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

		return createPortal(
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
			</AnimatePresence>,
			document.body,
		);
	}
}

export { Modal };

export default Modal;
