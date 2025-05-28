import { motion } from "motion/react";
import PropTypes from "prop-types";

const Step = ({ children, component: Container, ...props }) => <Container {...props}>{children}</Container>;

Step.propTypes = {
	children: PropTypes.node,
	component: PropTypes.object,
};

Step.defaultProps = {
	children: null,
	component: motion.div,
};

export default Step;
