import PropTypes from "prop-types";
import React from "react";

const ButtonStack = ({ children }) => <div className="button-stack">{children}</div>;

ButtonStack.propTypes = {
	children: PropTypes.node.isRequired,
};

export default ButtonStack;
