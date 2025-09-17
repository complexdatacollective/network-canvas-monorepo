import cx from "classnames";
import { motion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import create from "../assets/images/create-button.svg";

interface GraphicButtonProps {
	children: ReactNode;
	color?: string;
	graphic?: string;
	graphicPosition?: string;
	graphicSize?: string;
	labelPosition?: CSSProperties;
	onClick: () => void;
	disabled?: boolean;
}

const GraphicButton = ({
	children,
	color = "sea-green",
	graphic = create,
	graphicPosition = "50% 50%",
	graphicSize = "contain",
	labelPosition = {},
	onClick,
	disabled = false,
}: GraphicButtonProps) => {
	const styles = {
		backgroundColor: `var(--${color})`,
		backgroundImage: `url(${graphic})`,
		backgroundPosition: graphicPosition,
		backgroundSize: graphicSize,
	};

	const labelStyles = {
		...labelPosition,
	};

	const className = cx("graphic-button", { "graphic-button--disabled": disabled });

	return (
		<motion.div className={className} style={styles} onClick={onClick}>
			<div className="graphic-button__label" style={labelStyles}>
				{children}
			</div>
		</motion.div>
	);
};

export default GraphicButton;
