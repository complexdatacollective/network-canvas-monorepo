import cx from "classnames";
import { motion, useAnimation } from "motion/react";
import type React from "react";
import Icon from "~/lib/legacy-ui/components/Icon";

type TipProps = {
	type?: "info" | "warning" | "error";
	icon?: boolean;
	children?: React.ReactNode;
};

const Tip = ({ type = "info", icon = true, children = null }: TipProps) => {
	const classes = cx("tip", `tip__${type}`);

	const animation = useAnimation();

	return (
		<div className={classes}>
			{icon && (
				<motion.div
					animate={animation}
					style={{
						transformOrigin: "center",
					}}
					onViewportEnter={() =>
						animation.start({
							rotate: [-15, 10, -7, 0],
							scale: [1, 1.2, 1],
							transition: {
								delay: 0.5,
							},
						})
					}
				>
					<Icon name={type} />
				</motion.div>
			)}
			<div className="tip__content">{children}</div>
		</div>
	);
};

export default Tip;
