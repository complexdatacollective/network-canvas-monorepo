import React from "react";
import { motion } from "motion/react";

type SpriteProps = {
	src: string;
	animate?: Record<string, unknown>;
} & React.CSSProperties;

const Sprite = ({ src, animate = {}, ...styles }: SpriteProps) => {
	const style = {
		...styles,
		backgroundImage: `url(${src})`,
	};

	return <motion.div className="sprite" style={style} animate={animate} />;
};

export default Sprite;