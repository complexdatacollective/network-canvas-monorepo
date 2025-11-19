import { motion } from "motion/react";

const container = {
	hidden: { opacity: 0 },
	show: {
		opacity: 1,
		transition: {
			staggerChildren: 0.05,
			delay: 0.15,
			when: "beforeChildren",
		},
	},
};

const item = {
	hidden: { opacity: 0, y: "-200%" },
	show: { opacity: 1, y: 0 },
};

interface PipsProps {
	large?: boolean;
	count?: number;
	currentIndex?: number;
}

/**
 * Renders a set of pips indicating the current `Prompt`.
 */
const Pips = ({ large = false, count = 0, currentIndex = 0 }: PipsProps) => {
	const className = `pips ${large ? "pips--large" : ""}`;

	return (
		<motion.div className={className} variants={container} initial="hidden" animate="show">
			{[...Array(count)].map((_, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: Pips are visual indicators with no unique IDs - index represents their position
				<motion.div
					key={`pip-${index}`}
					className={`pips__pip ${index === currentIndex ? "pips__pip--active" : ""}`}
					variants={item}
				/>
			))}
		</motion.div>
	);
};

export default Pips;
