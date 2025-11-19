import cx from "classnames";
import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import { createPortal } from "react-dom";

const dialogVariants = {
	visible: {
		scale: 1,
		opacity: 1,
		transition: {
			when: "beforeChildren",
		},
	},
	hidden: {
		scale: 0.8,
		opacity: 0,
	},
};

const item = {
	hidden: { opacity: 0 },
	visible: { opacity: 1 },
};

type DialogProps = {
	children: React.ReactNode;
	className?: string;
	header?: React.ReactNode;
	footer?: React.ReactNode;
	show?: boolean;
	onClose?: () => void;
	beforeCloseHandler?: (() => boolean) | null;
};

const Dialog = ({
	header = null,
	footer = null,
	children,
	className = "",
	show = true,
	onClose = () => {},
	beforeCloseHandler = null,
}: DialogProps) => {
	const classes = cx("dialog", className);

	const handleClose = () => {
		if (beforeCloseHandler) {
			const outcome = beforeCloseHandler();
			if (outcome) {
				onClose();
			}
			return;
		}

		onClose();
	};

	const handleBackgroundClick = (e: React.MouseEvent) => {
		if (e.target === e.currentTarget) {
			handleClose();
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			handleClose();
		}
	};

	if (!show) {
		return null;
	}

	return createPortal(
		<AnimatePresence>
			{show && (
				<motion.div
					className="absolute inset-0 z-50 flex items-center justify-center bg-rich-black/50 backdrop-blur-sm"
					variants={dialogVariants}
					initial="hidden"
					animate="visible"
					exit="hidden"
					onClick={handleBackgroundClick}
					onKeyDown={handleKeyDown}
				>
					<motion.div className={classes}>
						{header && (
							<motion.header variants={item} className="dialog__header">
								{header}
							</motion.header>
						)}
						<motion.main variants={item} className="dialog__content">
							{children}
						</motion.main>
						{footer && (
							<motion.footer variants={item} className="dialog__footer">
								{footer}
							</motion.footer>
						)}
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>,
		document.body,
	);
};

export default Dialog;
