import classNames from "classnames";
import { Component } from "react";

/**
 * Renders a Node.
 */

type NodeProps = {
	color?: string;
	inactive?: boolean;
	label?: string;
	selected?: boolean;
	selectedColor?: string;
	linking?: boolean;
	handleClick?: (() => void) | null;
};

class Node extends Component<NodeProps> {
	private labelText!: HTMLDivElement;

	static defaultProps = {
		color: "node-color-seq-1",
		inactive: false,
		label: "Node",
		selected: false,
		selectedColor: "",
		linking: false,
		handleClick: null,
	};

	render() {
		const {
			label = "Node",
			color = "node-color-seq-1",
			inactive = false,
			selected = false,
			selectedColor = "",
			linking = false,
			handleClick = null,
		} = this.props;

		const classes = classNames("node", {
			"node--inactive": inactive,
			"node--selected": selected,
			"node--linking": linking,
			[`node--${selectedColor}`]: selected && selectedColor,
		});

		const labelClasses = () => {
			const labelLength = label.length;
			return `node__label-text len-${labelLength}`;
		};

		const nodeBaseColor = `var(--${color})`;
		const nodeFlashColor = `var(--${color}-dark)`;

		const labelWithEllipsis = label.length < 22 ? label : `${label.substring(0, 18)}\u{AD}...`; // Add ellipsis for really long labels

		return (
			<div className={classes} onClick={handleClick || undefined}>
				<svg
					viewBox="0 0 500 500"
					xmlns="http://www.w3.org/2000/svg"
					className="node__node"
					preserveAspectRatio="xMidYMid meet"
				>
					<circle cx="250" cy="270" r="200" className="node__node-shadow" opacity="0.25" />
					<circle cx="250" cy="250" r="250" className="node__node-outer-trim" />
					<circle cx="250" cy="250" r="200" className="node__node-base" />
					<path d="m50,250 a1,1 0 0,0 400,0" className="node__node-flash" transform="rotate(-35 250 250)" />
					<circle cx="250" cy="250" r="200" className="node__node-trim" />
				</svg>
				<div className="node__label">
					<div
						className={labelClasses()}
						ref={(labelText) => {
							this.labelText = labelText;
						}}
					>
						{labelWithEllipsis}
					</div>
				</div>
			</div>
		);
	}
}

export default Node;
