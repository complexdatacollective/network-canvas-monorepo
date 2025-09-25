import type { ComponentType } from "react";
import { Component } from "react";
import ReactDOM from "react-dom";
import { compose } from "recompose";
import windowRootConsumer from "./windowRootConsumer";

const getDisplayName = (WrappedComponent: ComponentType<any>) =>
	WrappedComponent.displayName || WrappedComponent.name || "Component";

/*
 * HOC which will cause a component to be rendered outside of the main ReactDOM hierarchy,
 * useful for modals and other windowed components.
 */
interface WindowComponentProps {
	windowRoot?: Element | null;
	[key: string]: any;
}

const withWindow = <P extends object>(WrappedComponent: ComponentType<P>, defaultRoot: Element = document.body) => {
	class WindowComponent extends Component<WindowComponentProps & P> {
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

	return WindowComponent;
};

export { withWindow };

export default compose(windowRootConsumer, withWindow);
