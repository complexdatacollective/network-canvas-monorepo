declare module "animejs" {
	type AnimeTimelineInstance = {
		add(params: AnimeParams): AnimeTimelineInstance;
		finished: Promise<void>;
	};

	type AnimeParams = {
		targets?: unknown;
		elasticity?: number;
		easing?: string;
		duration?: number;
		delay?: number;
		translateX?: number | number[];
		translateY?: number | number[];
		scaleX?: number | number[];
		scaleY?: number | number[];
		backgroundColor?: string | string[];
		opacity?: number | number[];
		[key: string]: unknown;
	};

	type AnimeInstance = {
		timeline(): AnimeTimelineInstance;
	};

	const anime: AnimeInstance;
	export default anime;
}
