import cx from "classnames";
import PropTypes from "prop-types";

const Button = ({ children, className, type, ...props }) => (
	<button className={cx("form-button", className)} type={type} {...props}>
		{children}
	</button>
);

Button.propTypes = {
	children: PropTypes.node,
	className: PropTypes.string,
	type: PropTypes.string,
};

Button.defaultProps = {
	className: "",
	children: null,
	type: "button",
};

export default Button;
