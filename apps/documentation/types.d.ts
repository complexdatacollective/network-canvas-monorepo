// declaring module for rehype-figure as it does not have types
declare module "@microflash/rehype-figure" {
	import type { Root } from "hast";
	type RehypeFigureOptions = {
		className?: string;
	};

	/**
	 * RehypeFigure - a plugin for remark/rehype to wrap `<img>` with a `<figure>` tag.
	 * @param options Options for the plugin.
	 */
	const rehypeFigure: (options?: RehypeFigureOptions) => (tree: Root) => undefined;

	export default rehypeFigure;
}
