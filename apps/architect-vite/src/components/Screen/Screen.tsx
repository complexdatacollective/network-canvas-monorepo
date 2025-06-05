import cx from "classnames";
import { motion, useElementScroll } from "motion/react";
import React, { useEffect, useRef } from "react";
import { ScreenErrorBoundary } from "~/components/Errors";

export const ScreenContext = React.createContext({
	scrollY: 0,
	updateScrollY: () => {},
});

const screenVariants = {
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

type ScreenProps = {
	children: React.ReactNode;
	className?: string;
	header?: React.ReactNode;
	footer?: React.ReactNode;
	onComplete?: () => void;
	beforeCloseHandler?: () => boolean;
};

const Screen = ({ header = null, footer = null, children, className = "", onComplete = () => {}, beforeCloseHandler = null }: ScreenProps) => {
	const classes = cx("screen", className);
	const [currentScroll, setCurrentScroll] = React.useState(0);

	const ref = useRef(null);
	const { scrollY } = useElementScroll(ref);

	useEffect(() => {
		scrollY.onChange((progress) => {
			setCurrentScroll(progress);
		});
	}, [scrollY]);

	const handleClose = () => {
		if (beforeCloseHandler) {
			const outcome = beforeCloseHandler();
			if (outcome) {
				onComplete();
			}
			return;
		}

		onComplete();
	};

	return (
		<div className="screen-wrapper">
			<ScreenContext.Provider value={{ scrollY: currentScroll }}>
				<div className="modal__background" onClick={handleClose} />
				<motion.div
					className={classes}
					// layoutId={layoutId}
					variants={screenVariants}
				>
					<ScreenErrorBoundary>
						<motion.header variants={item} className="screen__header">
							{header}
						</motion.header>
						<motion.main variants={item} className="screen__content" ref={ref}>
							{children}
						</motion.main>
						<motion.footer variants={item} className="screen__footer">
							{footer}
						</motion.footer>
					</ScreenErrorBoundary>
				</motion.div>
			</ScreenContext.Provider>
		</div>
	);
};


export default Screen;
