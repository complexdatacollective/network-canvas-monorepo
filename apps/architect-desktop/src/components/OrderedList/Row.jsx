import PropTypes from "prop-types";
import React from "react";

const Row = ({ children, ...rest }) => (
	<div
		className="list-row"
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...rest}
	>
		{children}
	</div>
);

Row.propTypes = {
	children: PropTypes.node,
};

Row.defaultProps = {
	children: null,
};

export default Row;
