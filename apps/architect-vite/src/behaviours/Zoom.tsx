import anime from "animejs";
import type React from "react";
import { createRef, PureComponent } from "react";
import { compose, getContext } from "recompose";
import { getCSSVariableAsNumber } from "~/lib/legacy-ui/utils/CSSVariables";

function getDisplayName<P>(WrappedComponent: React.ComponentType<P>) {
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
		static displayName = `Zoomable(${getDisplayName(WrappedComponent)})`;

		private root: HTMLElement | null = null;
		private nodeRef = createRef<HTMLDivElement>();

		static defaultProps = {
			zoomColors: ["#ff6ec7", "#4cbb17"],
			constraints: [0, 0, 0, 0],
		};

		componentDidMount() {
			const roots = document.getElementsByTagName("body");
			this.root = roots[0] || null;
			if (this.nodeRef.current) {
				this.nodeRef.current.addEventListener("click", this.onClick);
			}
		}

		componentWillUnmount() {
			if (this.nodeRef.current) {
				this.nodeRef.current.removeEventListener("click", this.onClick);
			}
		}

		onClick = () => {
			if (!this.nodeRef.current || !this.root) return;

			const { constraints = [0, 0, 0, 0], zoomColors = ["#ff6ec7", "#4cbb17"] } = this.props;
			const [top = 0, right = 0, bottom = 0, left = 0] = constraints;

			const start = this.nodeRef.current.getBoundingClientRect();
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
					if (this.root) {
						this.root.removeChild(pseudoElement);
					}
				});
		};

		render() {
			return (
				<div ref={this.nodeRef}>
					<WrappedComponent {...(this.props as P)} />
				</div>
			);
		}
	}

	return Zoomable;
};

export default compose(withConstraintContext, Zoom);
