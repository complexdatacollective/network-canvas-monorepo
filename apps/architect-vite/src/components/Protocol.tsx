import { motion, useScroll } from "motion/react";
import { useEffect, useRef, useState } from "react";
import Overview from "~/components/Overview";
import ProtocolControlBar from "~/components/ProtocolControlBar";
import Timeline from "~/components/Timeline";
import useProtocolLoader from "~/hooks/useProtocolLoader";

const Protocol = () => {
	// Use the protocol loader hook to handle URL-based protocol loading
	useProtocolLoader();

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
	const { scrollY } = useScroll({ container: ref });
	const [scrollOffset, setScrollOffset] = useState(0);

	useEffect(() => {
		scrollY.onChange((value) => setScrollOffset(value));
	}, [scrollY]);

	return (
		<motion.div className="scene scene--protocol" variants={variants}>
			<div className="scene__protocol" ref={ref}>
				<Overview scrollOffset={scrollOffset} />
				<Timeline />
			</div>
			<ProtocolControlBar />
		</motion.div>
	);
};

export default Protocol;
