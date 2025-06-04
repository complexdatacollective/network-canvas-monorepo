import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import useResizeAware from "react-resize-aware";
import type { ReactNode } from "react";

interface HoverMarqueeProps {
	speed?: number;
	children: ReactNode;
}

const HoverMarquee = ({ speed = 100, children }: HoverMarqueeProps) => {
	const containerRef = useRef(null);
	const contentRef = useRef(null);
	const [resizeListener, sizes] = useResizeAware();

	const contentVariants = {
		hover: {
			left: 0,
			transition: {
				duration: 0,
				ease: "linear",
			},
		},
	};

	useEffect(() => {
		const delta = contentRef.current.offsetWidth - containerRef.current.offsetWidth;
		contentVariants.hover.left = `-${delta}px`;
		contentVariants.hover.transition.duration = delta / speed;
	}, [containerRef.current, contentRef.current, sizes]);

	return (
		<div className="hover-marquee" ref={containerRef}>
			{resizeListener}
			<motion.span transition={{ duration: 0 }} whileHover="hover" variants={contentVariants} ref={contentRef}>
				{children}
			</motion.span>
		</div>
	);
};


export default HoverMarquee;
