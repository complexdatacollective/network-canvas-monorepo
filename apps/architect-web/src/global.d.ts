// Browser environment type overrides - prevent Node.js globals from being available

// Remove Buffer from global scope to ensure it causes TypeScript errors in browser context
declare const Buffer: undefined;

// Remove other Node.js globals that shouldn't be available in browser
declare const process: undefined;
declare const global: undefined;
declare const __dirname: undefined;
declare const __filename: undefined;
declare const require: undefined;
declare const module: undefined;
declare const exports: undefined;

// Map react-recompose types to @types/recompose declarations
declare module "react-recompose" {
	// biome-ignore lint/correctness/noUndeclaredDependencies: reexporting types from @types/recompose for compatibility
	export * from "recompose";
}

// Type declaration for animejs v2
declare module "animejs" {
	type AnimeParams = {
		targets?: unknown;
		duration?: number;
		easing?: unknown;
		scrollTop?: number;
		[key: string]: unknown;
	};
	function anime(params: AnimeParams): void;
	export default anime;
}

// Type declaration for scrollparent module
declare module "scrollparent" {
	function scrollparent(element: HTMLElement): HTMLElement | Document;
	export default scrollparent;
}
