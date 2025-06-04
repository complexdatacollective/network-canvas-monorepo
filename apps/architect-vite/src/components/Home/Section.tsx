import React from "react";
import cx from "classnames";
import { motion } from "motion/react";

const springy = {
	show: {
		opacity: 1,
		y: "0rem",
		transition: {
			type: "spring",
			when: "beforeChildren",
		},
	},
	hide: {
		opacity: 0,
		y: "5rem",
	},
	exit: {
		opacity: 0,
		x: "100%",
	},
};

type SectionProps = {
	children?: React.ReactNode;
	className?: string | null;
};

const Section = ({ children = null, className = null }: SectionProps) => {
	const classes = cx("home-section", className);

	return (
		<motion.div className={classes} variants={springy}>
			{children}
		</motion.div>
	);
};

export default Section;