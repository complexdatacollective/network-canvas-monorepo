import { motion } from "framer-motion";
import PropTypes from "prop-types";

const Sprite = ({ src, animate, ...styles }) => {
	const style = {
		...styles,
		backgroundImage: `url(${src})`,
	};

	return <motion.div className="sprite" style={style} animate={animate} />;
};

Sprite.propTypes = {
	src: PropTypes.string.isRequired,
	animate: PropTypes.object,
};

Sprite.defaultProps = {
	animate: {},
};

export default Sprite;
