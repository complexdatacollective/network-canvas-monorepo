import PropTypes from "prop-types";
import { Component } from "react";
import ReactDOM from "react-dom";
import { compose } from "recompose";
import windowRootConsumer from "./windowRootConsumer";

const getDisplayName = (WrappedComponent) => WrappedComponent.displayName || WrappedComponent.name || "Component";

/*
 * HOC which will cause a component to be rendered outside of the main ReactDOM hierarchy,
 * useful for modals and other windowed components.
 */
const withWindow = (WrappedComponent, defaultRoot = document.body) => {
	class WindowComponent extends Component {
		render() {
			const { windowRoot } = this.props;

			const portal = windowRoot || defaultRoot;

			return ReactDOM.createPortal(
				// eslint-disable-next-line react/jsx-props-no-spreading
				<WrappedComponent {...this.props} />,
				portal,
			);
		}
	}

	WindowComponent.displayName = () => `WindowComponent(${getDisplayName(WrappedComponent)})`;

	WindowComponent.propTypes = {
		windowRoot: PropTypes.any,
	};

	WindowComponent.defaultProps = {
		windowRoot: null,
	};

	return WindowComponent;
};

export { withWindow };

export default compose(windowRootConsumer, withWindow);
