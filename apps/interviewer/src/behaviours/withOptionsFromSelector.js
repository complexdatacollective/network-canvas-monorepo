import PropTypes from "prop-types";
import { connect } from "react-redux";

export default function withOptionsFromSelector(WrappedComponent, selector) {
	const WithOptionsFromSelector = ({ options, ...rest }) => <WrappedComponent options={options} {...rest} />;

	WithOptionsFromSelector.propTypes = {
		options: PropTypes.array.isRequired,
	};

	function mapStateToProps(state) {
		return {
			options: selector(state),
		};
	}

	return connect(mapStateToProps)(WithOptionsFromSelector);
}
