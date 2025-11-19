import cx from "classnames";
import { motion } from "motion/react";
import type React from "react";
import { Icon } from "~/lib/legacy-ui/components";

const baseVariant = {
	initial: { opacity: 0 },
	animate: { opacity: 1 },
};

type GroupProps = {
	children?: React.ReactNode;
	className?: string;
	color?: string;
	icon?: string;
	tada?: boolean;
	center?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

const Group = ({
	children = null as React.ReactNode,
	color = null as string | null,
	icon = null as string | null,
	tada = false,
	className = null as string | null,
	center = false,
	...rest
}: GroupProps) => {
	const styles = {
		backgroundColor: color ? `var(--${color})` : "transparent",
	};

	const classes = cx("home-group", className, {
		"home-group--icon": icon,
		"home-group--center": center,
	});

	const iconVariant = tada
		? {
				...baseVariant,
				animate: { opacity: [1, 1], rotate: [-15, 10, -7, 0] },
			}
		: baseVariant;

	return (
		<motion.div
			className={classes}
			style={styles}
			// eslint-disable-next-line react/jsx-props-no-spreading
			{...rest}
		>
			{icon && (
				<motion.div className="home-group__icon" variants={iconVariant}>
					<Icon name={icon} />
				</motion.div>
			)}
			{children}
		</motion.div>
	);
};

export default Group;
