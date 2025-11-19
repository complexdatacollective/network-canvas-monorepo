/* eslint-disable no-param-reassign, no-mixed-operators */
import { useEffect, useRef } from "react";
import ProgressCircle from "../ProgressCircle";

const NODE_COUNT = 10;
const ROTATIONAL_SPEED = 0.015;
const GRAVITATIONAL_SPEED = 0.9834;

const px = (f) => `${Math.round(f)}px`;

const range = (min, max) => Math.random() * (max - min) + min;

const palette = [
	"rgb(226, 33, 91)",
	"rgb(242, 183, 0)",
	"rgb(0, 201, 162)",
	"rgb(15, 178, 226)",
	"rgb(211, 15, 239)",
	"rgb(255, 58, 140)",
	"rgb(15, 112, 255)",
	"rgb(112, 191, 84)",
	"rgb(247, 137, 30)",
	"rgb(237, 0, 140)",
	"rgb(232, 45, 63)",
];

interface Node {
	a: number;
	h: number;
	f: number;
	d: number;
	s: number;
	c: string;
	el: HTMLDivElement;
}

interface GenerateNodeOptions {
	size: number;
}

const generateNode = (el: HTMLDivElement, options: GenerateNodeOptions) => (): Node => {
	const maxRange = options.size / 2;

	const node = {
		a: range(-Math.PI, Math.PI),
		h: maxRange,
		f: range(1, 3),
		d: 1,
		s: range(options.size / 12, options.size / 8),
		c: palette[Math.floor(range(0, palette.length))],
		el: document.createElement("div"),
	};

	node.el.classList.add("export-sprite__node");
	node.el.style.backgroundColor = node.c;
	node.el.style.borderRadius = px(node.s);
	node.el.style.opacity = 0;
	el.appendChild(node.el);

	return node;
};

class ExportAnimation {
	el: HTMLDivElement;
	options: GenerateNodeOptions;
	nodes: Node[];
	animation: number;

	constructor(el: HTMLDivElement, options: GenerateNodeOptions) {
		if (!el) {
			throw new Error("Element not found");
		}
		this.el = el;
		this.options = options;
		this.nodes = [];
		this.start();
	}

	start() {
		this.nodes = Array(NODE_COUNT).fill(undefined).map(this.generateNode());

		this.loop();
	}

	generateNode() {
		return generateNode(this.el, this.options);
	}

	maxRange() {
		return this.options.size / 2;
	}

	loop(): void {
		// render
		this.nodes.forEach((node) => {
			const displaySize = node.s * 0.5 + (node.s * node.h) / this.maxRange();

			node.el.style.opacity = 1 - node.h / this.maxRange();

			node.el.style.left = px(Math.sin(node.a) * node.h + this.maxRange() - displaySize * 0.5);
			node.el.style.top = px(Math.cos(node.a) * node.h + this.maxRange() - displaySize * 0.5);

			node.el.style.width = px(displaySize);
			node.el.style.height = px(displaySize);
		});

		this.nodes = this.nodes.reduce((nodes, node) => {
			const a = node.a - node.d * ROTATIONAL_SPEED * node.f;
			const h = node.h * GRAVITATIONAL_SPEED ** node.f;
			const cutoff = node.s / 5;

			if (h <= cutoff) {
				this.el.removeChild(node.el);
				return nodes;
			}

			nodes.push({
				...node,
				a,
				h,
			});
			return nodes;
		}, []);

		this.nodes = [
			...this.nodes,
			...Array(NODE_COUNT - this.nodes.length)
				.fill(undefined)
				.map(this.generateNode()),
		];

		this.animation = window.requestAnimationFrame(() => this.loop());
	}

	destroy(): void {
		window.cancelAnimationFrame(this.animation);

		this.nodes.forEach(({ el }) => {
			this.el.removeChild(el);
		});

		this.nodes = [];
	}
}

interface ExportSpriteProps {
	size?: number;
	percentProgress: number;
	statusText?: string;
}

const ExportSprite = ({ size = 500, percentProgress, statusText = "Exporting items..." }: ExportSpriteProps) => {
	const el = useRef<HTMLDivElement>(null);
	const animation = useRef<ExportAnimation | null>(null);

	useEffect(() => {
		if (el.current) {
			animation.current = new ExportAnimation(el.current, {
				size,
			});
		}

		return () => {
			if (animation.current) {
				animation.current.destroy();
			}
		};
	}, [size]);

	return (
		<div className="export-sprite" ref={el} style={{ width: size, height: size }}>
			<div
				className="export-sprite__destination"
				style={{
					left: px(size / 2),
					top: px(size / 2),
				}}
			>
				<div className="export-sprite__destination__circle">
					<ProgressCircle percentProgress={percentProgress} />
				</div>
				<div className="export-sprite__destination__text">
					<h4>{statusText}</h4>
				</div>
			</div>
		</div>
	);
};

export default ExportSprite;
