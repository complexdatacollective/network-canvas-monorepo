import { AnimatePresence, motion } from "motion/react";
import { Component } from "react";
import { createPortal } from "react-dom";

type SpotlightModalProps = {
	show?: boolean;
	children?: React.ReactElement;
	zIndex?: number;
	onBlur?: (event: React.MouseEvent) => void;
};

class SpotlightModal extends Component<SpotlightModalProps> {
	static defaultProps = {
		show: false,
		zIndex: undefined,
		children: undefined,
		onBlur: () => {},
	};
	render() {
		const { children, show, zIndex, onBlur } = this.props;

		const style = zIndex ? { zIndex } : undefined;

		const handleBlur = (event: React.MouseEvent) => {
			if (event.target !== event.currentTarget) {
				return;
			}
			onBlur?.(event);
		};

		const handleKeyDown = (event: React.KeyboardEvent) => {
			if (event.key === "Escape" && event.target === event.currentTarget) {
				onBlur?.(event as unknown as React.MouseEvent);
			}
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
						<div
							className="modal__background"
							onClick={handleBlur}
							onKeyDown={handleKeyDown}
							role="button"
							tabIndex={-1}
							aria-label="Close modal"
						/>
						<div className="spotlight-modal__content">{children}</div>
					</motion.div>
				)}
			</AnimatePresence>,
			document.body,
		);
	}
}

export default SpotlightModal;
