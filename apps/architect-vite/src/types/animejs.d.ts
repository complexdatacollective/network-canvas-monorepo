declare module "animejs" {
	type AnimeTimelineInstance = {
		add(params: AnimeParams): this;
		finished: Promise<void>;
	};

	type AnimeParams = {
		targets: Element | Element[] | string;
		[key: string]: unknown;
		duration?: number;
		delay?: number;
		easing?: string;
		elasticity?: number;
		translateX?: number | [number, number];
		translateY?: number | [number, number];
		scaleX?: number | [number, number];
		scaleY?: number | [number, number];
		opacity?: number | [number, number];
		backgroundColor?: string | string[];
	};

	type AnimeInstance = {
		timeline(): AnimeTimelineInstance;
	};

	const anime: AnimeInstance;
	export default anime;
}
