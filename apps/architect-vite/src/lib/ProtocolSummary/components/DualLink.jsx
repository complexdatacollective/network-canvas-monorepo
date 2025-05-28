import PropTypes from "prop-types";

const DualLink = ({ to, children, className }) => (
	<>
		<a href={to} data-print="only" className={className}>
			{children}
		</a>
	</>
);

DualLink.propTypes = {
	to: PropTypes.string.isRequired,
	className: PropTypes.string,
	children: PropTypes.node,
};

DualLink.defaultProps = {
	children: null,
	className: null,
};

export default DualLink;
