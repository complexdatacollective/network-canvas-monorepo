import anime from "animejs";
import type React from "react";
import { PureComponent } from "react";
import ReactDOM from "react-dom";
import { compose, getContext } from "recompose";
import { getCSSVariableAsNumber } from "~/lib/legacy-ui/utils/CSSVariables";

function getDisplayName(WrappedComponent: React.ComponentType<any>) {
	return WrappedComponent.displayName || WrappedComponent.name || "Component";
}

type ConstraintsContextType = {
	constraints: number[];
};

type ZoomableProps = {
	zoomColors?: string[];
	constraints?: number[];
};

const withConstraintContext = getContext<ConstraintsContextType>({ constraints: () => null });

const Zoom = <P extends object>(WrappedComponent: React.ComponentType<P>) => {
	class Zoomable extends PureComponent<P & ZoomableProps> {
		private root!: HTMLElement;
		private node!: Element;

		static defaultProps = {
			zoomColors: ["#ff6ec7", "#4cbb17"],
			constraints: [0, 0, 0, 0],
		};

		componentDidMount() {
			const [root] = document.getElementsByTagName("body");
			this.root = root;
			this.node = ReactDOM.findDOMNode(this) as Element;
			this.node.addEventListener("click", this.onClick);
		}

		componentWillUnmount() {
			this.node.removeEventListener("click", this.onClick);
		}

		onClick = () => {
			const { constraints = [0, 0, 0, 0], zoomColors = ["#ff6ec7", "#4cbb17"] } = this.props;
			const [top, right, bottom, left] = constraints;

			const start = (this.node as Element).getBoundingClientRect();
			const pseudoElement = document.createElement("div");

			const targetWidth = window.innerWidth - right - left;
			const targetHeight = window.innerHeight - top - bottom;

			const scaleX = start.width / targetWidth;
			const scaleY = start.height / targetHeight;

			// scaling gives us part of the neccessary offset, the difference
			// between the targetHeight and the start height:
			const scaleYoffset = (targetHeight - start.height) / 2;
			const scaleXoffset = (targetWidth - start.width) / 2;

			// We then need to find the difference between this offset, and
			// the location of the div on screen to work out what translation
			// we need:
			const translateY = start.top - top - scaleYoffset;
			const translateX = start.left - left - scaleXoffset;

			pseudoElement.setAttribute(
				"style",
				`position: absolute;
        transform: translateZ(0);
        z-index: var(--z-fx);
        top: ${top}px;
        left: ${left}px;
        width: ${targetWidth}px;
        height: ${targetHeight}px;`,
			);

			this.root.appendChild(pseudoElement);

			anime
				.timeline()
				.add({
					targets: pseudoElement,
					elasticity: 0,
					easing: "easeInOutQuad",
					duration: getCSSVariableAsNumber("--animation-duration-standard-ms"),
					translateX: [translateX, 0],
					translateY: [translateY, 0],
					scaleY: [scaleY, 1],
					scaleX: [scaleX, 1],
					backgroundColor: zoomColors,
				})
				.add({
					targets: pseudoElement,
					elasticity: 0,
					easing: "easeInOutQuad",
					delay: 50,
					duration: getCSSVariableAsNumber("--animation-duration-standard-ms"),
					opacity: [1, 0],
				})
				.finished.then(() => {
					this.root.removeChild(pseudoElement);
				});
		};

		render() {
			return <WrappedComponent {...(this.props as P)} />;
		}
	}

	Zoomable.displayName = `Zoomable(${getDisplayName(WrappedComponent)})`;

	return Zoomable;
};

export default compose(withConstraintContext, Zoom);
